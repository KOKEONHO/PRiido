import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository as TypeOrmRepository } from 'typeorm';

import { PullRequest } from './entities/pull-request.entity';
import { PullRequestCommit } from './entities/pull-request-commit.entity';
import { PullRequestFile } from './entities/pull-request-file.entity';

import { Repository } from '../repository/entities/repository.entity';
import { MemberRepository } from '../repository/entities/member-repository.entity';
import { MemberService } from '../member/member.service';

type ListInput = {
  memberId: string;
  repositoryId: string;
  limit: number;
  cursorMergedAt: string | null; // ISO
  cursorPrNumber: number | null;
};

type ListOutput = {
  items: PullRequest[];
  nextCursor: { mergedAt: string; prNumber: number } | null;
  hasNext: boolean;
};

type PullRequestStreamStart = { type: 'start' };
type PullRequestStreamItem = {
  type: 'pr';
  item: PullRequest;
  sent: number;
  source: 'db' | 'github';
};
type PullRequestStreamCursor = {
  type: 'cursor';
  nextCursor: { mergedAt: string; prNumber: number } | null;
  hasNext: boolean;
};
type PullRequestStreamEnd = { type: 'end'; total: number };

type PullRequestSyncStreamStart = {
  type: 'start';
  since: string | null;
  candidates: number;
};
type PullRequestSyncStreamProgress = {
  type: 'progress';
  synced: number;
  total: number;
  prNumber: number;
  item: PullRequest;
};
type PullRequestSyncStreamEnd = {
  type: 'end';
  synced: number;
  total: number;
  since: string | null;
  lastSyncedMergedAt: string | null;
};

// ---- GitHub types (필요 최소) ----
type GithubSearchIssuesResponse = {
  total_count: number;
  incomplete_results: boolean;
  items: Array<{ number: number; pull_request?: { url: string } }>;
};

type GithubPullDetail = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  user: { login: string } | null;

  html_url?: string;
  state?: string;

  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  merged_at?: string | null;

  changed_files?: number;
  additions?: number;
  deletions?: number;
  commits?: number;
};

type GithubPullCommit = {
  sha: string;
  commit: {
    message: string;
    author?: { name?: string; date?: string } | null;
    committer?: { name?: string; date?: string } | null;
  };
  author?: { login?: string } | null;
};

type GithubPullFile = {
  filename: string;
  status?: string;
  additions?: number;
  deletions?: number;
  changes?: number;
};

@Injectable()
export class PullRequestService {
  constructor(
    @InjectRepository(PullRequest)
    private readonly prTable: TypeOrmRepository<PullRequest>,

    @InjectRepository(PullRequestCommit)
    private readonly prCommitTable: TypeOrmRepository<PullRequestCommit>,

    @InjectRepository(PullRequestFile)
    private readonly prFileTable: TypeOrmRepository<PullRequestFile>,

    @InjectRepository(Repository)
    private readonly repoTable: TypeOrmRepository<Repository>,

    @InjectRepository(MemberRepository)
    private readonly memberRepoTable: TypeOrmRepository<MemberRepository>,

    private readonly memberService: MemberService,
  ) {}

  /**
   * ✅ 무한 스크롤 목록:
   * - DB에서 limit+1 확보 시도
   * - 부족하면 GitHub에서 채워넣고(DB upsert) 다시 DB 조회
   */
  async list(input: ListInput): Promise<ListOutput> {
    await this.assertRepoAccess(input.memberId, input.repositoryId);

    const cursor = this.validateCursor(
      input.cursorMergedAt,
      input.cursorPrNumber,
    );

    const viewLimit = input.limit;
    const target = viewLimit + 1;

    const fetchTarget = () =>
      this.fetchDbPage(input.repositoryId, target, cursor);

    let pageTarget = await fetchTarget();

    if (pageTarget.items.length < target) {
      const beforeIso = this.pickBeforeMergedAtIso(pageTarget, cursor);

      await this.fillFromGithubAndUpdateLastSynced(
        input.memberId,
        input.repositoryId,
        beforeIso,
        target,
      );

      pageTarget = await fetchTarget();
    }

    const hasNext = pageTarget.items.length > viewLimit;
    const items = hasNext
      ? pageTarget.items.slice(0, viewLimit)
      : pageTarget.items;

    const last = items.length ? items[items.length - 1] : null;
    const nextCursor =
      last?.mergedAtGithub && last.prNumber
        ? {
            mergedAt: new Date(last.mergedAtGithub).toISOString(),
            prNumber: last.prNumber,
          }
        : null;

    return { items, nextCursor, hasNext };
  }

  streamList(
    input: ListInput,
  ): Observable<import('@nestjs/common').MessageEvent> {
    return new Observable<import('@nestjs/common').MessageEvent>(
      (subscriber) => {
        (async () => {
          await this.assertRepoAccess(input.memberId, input.repositoryId);

          const cursor = this.validateCursor(
            input.cursorMergedAt,
            input.cursorPrNumber,
          );

          const viewLimit = input.limit;
          const target = viewLimit + 1;

          let sent = 0;
          let hasNext = false;
          let latestPage = await this.fetchDbPage(
            input.repositoryId,
            target,
            cursor,
          );

          const emittedIds = new Set<string>();

          const emitFromDb = async (source: 'db' | 'github') => {
            latestPage = await this.fetchDbPage(
              input.repositoryId,
              target,
              cursor,
            );

            if (latestPage.items.length > viewLimit) {
              hasNext = true;
            }

            for (const pr of latestPage.items) {
              const id = String(pr.id);
              if (emittedIds.has(id)) continue;

              if (sent >= viewLimit) {
                hasNext = true;
                break;
              }

              sent += 1;
              emittedIds.add(id);

              subscriber.next({
                data: {
                  type: 'pr',
                  item: pr,
                  sent,
                  source,
                } satisfies PullRequestStreamItem,
              });
            }
          };

          subscriber.next({
            data: { type: 'start' } satisfies PullRequestStreamStart,
          });

          await emitFromDb('db');

          if (!hasNext) {
            const beforeIso = this.pickBeforeMergedAtIso(latestPage, cursor);
            const { fullName, token } = await this.getRepoAndTokenOrThrow(
              input.memberId,
              input.repositoryId,
            );

            const search = await this.searchMergedPulls(token, fullName, {
              mergedBefore: beforeIso,
              perPage: Math.min(100, Math.max(1, target)),
              page: 1,
            });

            const prNumbers = Array.from(
              new Set(
                (search.items ?? [])
                  .filter((x) => !!x.pull_request)
                  .map((x) => x.number),
              ),
            );

            for (const prNumber of prNumbers) {
              await this.upsertSinglePullWithExtras(
                input.repositoryId,
                fullName,
                token,
                prNumber,
              );

              await emitFromDb('github');

              if (hasNext) {
                break;
              }
            }

            await this.updateRepoLastSyncedMergedAtFromDb(input.repositoryId);
            latestPage = await this.fetchDbPage(
              input.repositoryId,
              target,
              cursor,
            );
            if (latestPage.items.length > viewLimit) hasNext = true;
          }

          latestPage = await this.fetchDbPage(
            input.repositoryId,
            target,
            cursor,
          );
          const pageItems = latestPage.items.slice(
            0,
            Math.min(viewLimit, latestPage.items.length),
          );
          const cursorItem = pageItems.length
            ? pageItems[pageItems.length - 1]
            : null;

          let nextCursor: { mergedAt: string; prNumber: number } | null = null;
          if (cursorItem?.mergedAtGithub) {
            nextCursor = {
              mergedAt: new Date(cursorItem.mergedAtGithub).toISOString(),
              prNumber: cursorItem.prNumber,
            };
          }

          subscriber.next({
            data: {
              type: 'cursor',
              nextCursor,
              hasNext,
            } satisfies PullRequestStreamCursor,
          });

          subscriber.next({
            data: { type: 'end', total: sent } satisfies PullRequestStreamEnd,
          });
          subscriber.complete();
        })().catch((err) => subscriber.error(err));
      },
    );
  }

  /**
   * ✅ 상단 신규 동기화:
   * - repository.last_synced_merged_at 이후(>=) 머지된 PR만 GitHub에서 조회
   * - PR + commits/files upsert
   * - repository.last_synced_merged_at 갱신
   */
  async syncNewlyMergedPulls(memberId: string, repositoryId: string) {
    await this.assertRepoAccess(memberId, repositoryId);

    const { repo, fullName, token } = await this.getRepoAndTokenOrThrow(
      memberId,
      repositoryId,
    );

    const mergedAfterIso = (repo as any).lastSyncedMergedAt
      ? new Date((repo as any).lastSyncedMergedAt).toISOString()
      : null;

    const perPage = 100;
    const maxPages = 10;
    const prNumbersSet = new Set<number>();

    for (let page = 1; page <= maxPages; page += 1) {
      const search = await this.searchMergedPulls(token, fullName, {
        mergedAfter: mergedAfterIso,
        mergedBefore: null,
        perPage,
        page,
      });

      const numbers = (search.items ?? [])
        .filter((x) => !!x.pull_request)
        .map((x) => x.number);

      for (const n of numbers) prNumbersSet.add(n);

      if (numbers.length < perPage) break;
    }

    const prNumbers = Array.from(prNumbersSet).sort((a, b) => a - b);
    if (!prNumbers.length) {
      return {
        ok: true,
        synced: 0,
        since: mergedAfterIso,
        lastSyncedMergedAt: mergedAfterIso,
      };
    }

    const details = await this.fetchPullDetailsBulk(token, fullName, prNumbers);

    await this.upsertPullDetailsWithExtras(
      repositoryId,
      fullName,
      token,
      details,
    );

    await this.updateRepoLastSyncedMergedAtFromDb(repositoryId);

    const refreshedRepo = await this.repoTable.findOne({
      where: { id: String(repositoryId) },
      select: ['id', 'lastSyncedMergedAt'] as any,
    });

    return {
      ok: true,
      synced: details.length,
      since: mergedAfterIso,
      lastSyncedMergedAt: (refreshedRepo as any)?.lastSyncedMergedAt
        ? new Date((refreshedRepo as any).lastSyncedMergedAt).toISOString()
        : null,
    };
  }

  async getOne(memberId: string, repositoryId: string, id: string) {
    await this.assertRepoAccess(memberId, repositoryId);

    const row = await this.prTable.findOne({
      where: {
        id: String(id),
        repositoryId: String(repositoryId),
      } as any,
    });

    if (!row) {
      throw new NotFoundException('Pull request not found');
    }

    return row;
  }

  async refreshOne(memberId: string, repositoryId: string, id: string) {
    await this.assertRepoAccess(memberId, repositoryId);

    const row = await this.prTable.findOne({
      where: {
        id: String(id),
        repositoryId: String(repositoryId),
      } as any,
      select: ['id', 'prNumber', 'githubPrId', 'repositoryId'] as any,
    });

    if (!row) {
      throw new NotFoundException('Pull request not found');
    }

    const prNumber =
      typeof row.prNumber === 'number' && row.prNumber > 0
        ? row.prNumber
        : null;

    if (!prNumber) {
      throw new BadRequestException(
        'prNumber is missing for this pull request',
      );
    }

    const { fullName, token } = await this.getRepoAndTokenOrThrow(
      memberId,
      repositoryId,
    );

    const refreshed = await this.upsertSinglePullWithExtras(
      repositoryId,
      fullName,
      token,
      prNumber,
    );

    if (!refreshed) {
      throw new BadRequestException('Unable to refresh pull request');
    }

    return {
      ok: true,
      id: String(refreshed.id),
      repositoryId: String(repositoryId),
      prNumber: refreshed.prNumber,
      item: refreshed,
    };
  }

  streamSyncNewlyMergedPulls(
    memberId: string,
    repositoryId: string,
  ): Observable<import('@nestjs/common').MessageEvent> {
    return new Observable<import('@nestjs/common').MessageEvent>(
      (subscriber) => {
        (async () => {
          await this.assertRepoAccess(memberId, repositoryId);

          const { repo, fullName, token } = await this.getRepoAndTokenOrThrow(
            memberId,
            repositoryId,
          );

          const mergedAfterIso = (repo as any).lastSyncedMergedAt
            ? new Date((repo as any).lastSyncedMergedAt).toISOString()
            : null;

          const perPage = 100;
          const maxPages = 10;
          const prNumbersSet = new Set<number>();

          for (let page = 1; page <= maxPages; page += 1) {
            const search = await this.searchMergedPulls(token, fullName, {
              mergedAfter: mergedAfterIso,
              mergedBefore: null,
              perPage,
              page,
            });

            const numbers = (search.items ?? [])
              .filter((x) => !!x.pull_request)
              .map((x) => x.number);

            for (const n of numbers) prNumbersSet.add(n);

            if (numbers.length < perPage) break;
          }

          const prNumbers = Array.from(prNumbersSet).sort((a, b) => a - b);

          subscriber.next({
            data: {
              type: 'start',
              since: mergedAfterIso,
              candidates: prNumbers.length,
            } satisfies PullRequestSyncStreamStart,
          });

          if (!prNumbers.length) {
            subscriber.next({
              data: {
                type: 'end',
                synced: 0,
                total: 0,
                since: mergedAfterIso,
                lastSyncedMergedAt: mergedAfterIso,
              } satisfies PullRequestSyncStreamEnd,
            });
            subscriber.complete();
            return;
          }

          let synced = 0;
          for (const prNumber of prNumbers) {
            const upserted = await this.upsertSinglePullWithExtras(
              repositoryId,
              fullName,
              token,
              prNumber,
            );

            if (!upserted) continue;

            synced += 1;
            subscriber.next({
              data: {
                type: 'progress',
                synced,
                total: prNumbers.length,
                prNumber,
                item: upserted,
              } satisfies PullRequestSyncStreamProgress,
            });
          }

          await this.updateRepoLastSyncedMergedAtFromDb(repositoryId);

          const refreshedRepo = await this.repoTable.findOne({
            where: { id: String(repositoryId) },
            select: ['id', 'lastSyncedMergedAt'] as any,
          });

          subscriber.next({
            data: {
              type: 'end',
              synced,
              total: prNumbers.length,
              since: mergedAfterIso,
              lastSyncedMergedAt: (refreshedRepo as any)?.lastSyncedMergedAt
                ? new Date(
                    (refreshedRepo as any).lastSyncedMergedAt,
                  ).toISOString()
                : null,
            } satisfies PullRequestSyncStreamEnd,
          });
          subscriber.complete();
        })().catch((err) => subscriber.error(err));
      },
    );
  }

  // =========================
  // Access / cursor validation
  // =========================

  private async assertRepoAccess(memberId: string, repositoryId: string) {
    const link = await this.memberRepoTable.findOne({
      where: {
        memberId: String(memberId),
        repositoryId: String(repositoryId),
      } as any,
    });

    if (!link) {
      throw new ForbiddenException(
        'Repository is not registered by this member',
      );
    }
  }

  private validateCursor(
    cursorMergedAt: string | null,
    cursorPrNumber: number | null,
  ): { mergedAt: Date; prNumber: number } | null {
    if (cursorMergedAt == null && cursorPrNumber == null) return null;

    if (!cursorMergedAt || cursorPrNumber == null) {
      throw new BadRequestException(
        'cursorMergedAt and cursorPrNumber must be provided together',
      );
    }

    const d = new Date(cursorMergedAt);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('cursorMergedAt is invalid ISO date');
    }

    if (!Number.isFinite(cursorPrNumber) || cursorPrNumber < 1) {
      throw new BadRequestException('cursorPrNumber is invalid');
    }

    return { mergedAt: d, prNumber: cursorPrNumber };
  }

  private pickBeforeMergedAtIso(
    page: { items: PullRequest[] },
    cursor: { mergedAt: Date; prNumber: number } | null,
  ): string | null {
    const last = page.items.length ? page.items[page.items.length - 1] : null;

    if (last?.mergedAtGithub)
      return new Date(last.mergedAtGithub).toISOString();
    if (cursor) return cursor.mergedAt.toISOString();
    return null;
  }

  // =========================
  // DB query (keyset pagination)
  // =========================

  private async fetchDbPage(
    repositoryId: string,
    limit: number,
    cursor: { mergedAt: Date; prNumber: number } | null,
  ): Promise<{ items: PullRequest[] }> {
    const qb = this.prTable
      .createQueryBuilder('pr')
      .where('pr.repositoryId = :rid', { rid: String(repositoryId) })
      .andWhere('pr.mergedAtGithub IS NOT NULL');

    if (cursor) {
      qb.andWhere(
        '(pr.mergedAtGithub < :cma OR (pr.mergedAtGithub = :cma AND pr.prNumber < :cpn))',
        { cma: cursor.mergedAt.toISOString(), cpn: cursor.prNumber },
      );
    }

    const rows = await qb
      .orderBy('pr.mergedAtGithub', 'DESC', 'NULLS LAST')
      .addOrderBy('pr.prNumber', 'DESC')
      .limit(limit)
      .getMany();

    return { items: rows };
  }

  // =========================
  // GitHub
  // =========================

  private getAuthHeaders(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'priido',
    };
  }

  private async getRepoAndTokenOrThrow(memberId: string, repositoryId: string) {
    const repo = await this.repoTable.findOne({
      where: { id: String(repositoryId) },
    });
    if (!repo) throw new BadRequestException('Repository not found');

    const fullName = (repo as any).githubRepoFullName as string | undefined;
    if (!fullName)
      throw new BadRequestException('github_repo_full_name missing');

    const token = await this.memberService.getGithubAccessToken(
      String(memberId),
    );
    if (!token)
      throw new UnauthorizedException('Github access token not found');

    return { repo, fullName, token };
  }

  private async fillFromGithubAndUpdateLastSynced(
    memberId: string,
    repositoryId: string,
    beforeMergedAtIso: string | null,
    target: number,
  ) {
    const { fullName, token } = await this.getRepoAndTokenOrThrow(
      memberId,
      repositoryId,
    );

    const search = await this.searchMergedPulls(token, fullName, {
      mergedBefore: beforeMergedAtIso,
      perPage: Math.min(100, Math.max(1, target)),
      page: 1,
    });

    const prNumbers = (search.items ?? [])
      .filter((x) => !!x.pull_request)
      .map((x) => x.number);

    if (!prNumbers.length) return;

    const details = await this.fetchPullDetailsBulk(token, fullName, prNumbers);

    await this.upsertPullDetailsWithExtras(
      repositoryId,
      fullName,
      token,
      details,
    );

    await this.updateRepoLastSyncedMergedAtFromDb(repositoryId);
  }

  private async searchMergedPulls(
    token: string,
    fullName: string,
    opts: {
      mergedAfter?: string | null;
      mergedBefore: string | null;
      perPage: number;
      page: number;
    },
  ): Promise<GithubSearchIssuesResponse> {
    const qParts: string[] = [`repo:${fullName}`, 'is:pr', 'is:merged'];
    if (opts.mergedAfter) qParts.push(`merged:>=${opts.mergedAfter}`);
    if (opts.mergedBefore) qParts.push(`merged:<${opts.mergedBefore}`);

    const q = encodeURIComponent(qParts.join(' '));
    const url = `https://api.github.com/search/issues?q=${q}&per_page=${opts.perPage}&page=${opts.page}`;

    const res = await fetch(url, { headers: this.getAuthHeaders(token) });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new BadRequestException(
        `GitHub search fetch failed: ${res.status} ${txt}`,
      );
    }
    return (await res.json()) as GithubSearchIssuesResponse;
  }

  private async fetchPullDetail(
    token: string,
    fullName: string,
    prNumber: number,
  ): Promise<GithubPullDetail> {
    const url = `https://api.github.com/repos/${fullName}/pulls/${prNumber}`;

    const res = await fetch(url, { headers: this.getAuthHeaders(token) });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new BadRequestException(
        `GitHub pull detail fetch failed: ${res.status} ${txt}`,
      );
    }
    return (await res.json()) as GithubPullDetail;
  }

  private async fetchPullDetailsBulk(
    token: string,
    fullName: string,
    prNumbers: number[],
  ): Promise<GithubPullDetail[]> {
    const unique = Array.from(new Set(prNumbers));
    const concurrency = 5;

    const results: GithubPullDetail[] = [];
    let idx = 0;

    const worker = async () => {
      while (idx < unique.length) {
        const n = unique[idx];
        idx += 1;
        try {
          const d = await this.fetchPullDetail(token, fullName, n);
          results.push(d);
        } catch {
          // ignore
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return results;
  }

  private async fetchPullCommits(
    token: string,
    fullName: string,
    prNumber: number,
    maxItems = 50,
  ): Promise<GithubPullCommit[]> {
    const perPage = Math.min(100, Math.max(1, maxItems));
    const url = `https://api.github.com/repos/${fullName}/pulls/${prNumber}/commits?per_page=${perPage}&page=1`;

    const res = await fetch(url, { headers: this.getAuthHeaders(token) });
    if (!res.ok) return [];

    const arr = (await res.json()) as GithubPullCommit[];
    return Array.isArray(arr) ? arr.slice(0, maxItems) : [];
  }

  private async fetchPullFiles(
    token: string,
    fullName: string,
    prNumber: number,
    maxItems = 100,
  ): Promise<GithubPullFile[]> {
    const perPage = Math.min(100, Math.max(1, maxItems));
    const url = `https://api.github.com/repos/${fullName}/pulls/${prNumber}/files?per_page=${perPage}&page=1`;

    const res = await fetch(url, { headers: this.getAuthHeaders(token) });
    if (!res.ok) return [];

    const arr = (await res.json()) as GithubPullFile[];
    return Array.isArray(arr) ? arr.slice(0, maxItems) : [];
  }

  // =========================
  // Upsert (PR + commits/files)
  // - DDL 기준: synced_at 컬럼 없음
  // =========================

  private async upsertPullDetailsWithExtras(
    repositoryId: string,
    fullName: string,
    token: string,
    details: GithubPullDetail[],
  ) {
    await this.upsertPullDetailsWithStats(repositoryId, details);

    const merged = details
      .map((d) => ({
        githubPrId: String(d.id),
        prNumber: d.number,
        mergedAt: d.merged_at ? new Date(d.merged_at) : null,
      }))
      .filter((x) => x.mergedAt != null);

    if (!merged.length) return;

    const githubPrIds = merged.map((x) => x.githubPrId);

    const prs = await this.prTable.find({
      where: {
        repositoryId: String(repositoryId),
        githubPrId: In(githubPrIds),
      } as any,
      select: ['id', 'githubPrId', 'prNumber'],
    });

    const prIdByPrNumber = new Map<number, string>();
    for (const p of prs) prIdByPrNumber.set(p.prNumber, String(p.id));

    const concurrency = 3;
    let idx = 0;
    const uniquePrNumbers = Array.from(new Set(merged.map((x) => x.prNumber)));

    const worker = async () => {
      while (idx < uniquePrNumbers.length) {
        const prNumber = uniquePrNumbers[idx];
        idx += 1;

        const prId = prIdByPrNumber.get(prNumber);
        if (!prId) continue;

        const [commits, files] = await Promise.all([
          this.fetchPullCommits(token, fullName, prNumber, 50),
          this.fetchPullFiles(token, fullName, prNumber, 100),
        ]);

        await this.prCommitTable.delete({ pullRequestId: String(prId) } as any);
        await this.prFileTable.delete({ pullRequestId: String(prId) } as any);

        const commitRows = commits
          .map((c) => {
            const msg = (c.commit?.message ?? '').trim();
            const subject = msg.split('\n')[0]?.trim() ?? '';
            if (!subject) return null;

            const committedAtRaw =
              c.commit?.committer?.date ?? c.commit?.author?.date ?? null;

            return this.prCommitTable.create({
              pullRequestId: String(prId),
              sha: String(c.sha ?? ''),
              message: subject,
              author: (c.author?.login ??
                c.commit?.author?.name ??
                null) as any,
              committedAtGithub: committedAtRaw
                ? new Date(committedAtRaw)
                : null,
            });
          })
          .filter((x): x is PullRequestCommit => x != null);

        const fileRows = files
          .map((f) => {
            const filename = String(f.filename ?? '').trim();
            if (!filename) return null;

            return this.prFileTable.create({
              pullRequestId: String(prId),
              filename,
              status: (f.status ?? null) as any,
              additions: typeof f.additions === 'number' ? f.additions : null,
              deletions: typeof f.deletions === 'number' ? f.deletions : null,
              changes: typeof f.changes === 'number' ? f.changes : null,
            });
          })
          .filter((x): x is PullRequestFile => x != null);

        if (commitRows.length)
          await this.prCommitTable.save(commitRows, { chunk: 200 });
        if (fileRows.length)
          await this.prFileTable.save(fileRows, { chunk: 300 });
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  }

  private async upsertSinglePullWithExtras(
    repositoryId: string,
    fullName: string,
    token: string,
    prNumber: number,
  ): Promise<PullRequest | null> {
    const detail = await this.fetchPullDetail(token, fullName, prNumber);

    if (!detail.merged_at) {
      return null;
    }

    await this.upsertPullDetailsWithStats(repositoryId, [detail]);

    const githubPrId = String(detail.id);
    const pr = await this.prTable.findOne({
      where: {
        repositoryId: String(repositoryId),
        githubPrId,
      } as any,
      select: ['id', 'githubPrId', 'prNumber'] as any,
    });

    if (!pr) return null;

    const prId = String(pr.id);

    const [commits, files] = await Promise.all([
      this.fetchPullCommits(token, fullName, prNumber, 50),
      this.fetchPullFiles(token, fullName, prNumber, 100),
    ]);

    await this.prCommitTable.delete({ pullRequestId: prId } as any);
    await this.prFileTable.delete({ pullRequestId: prId } as any);

    const commitRows = commits
      .map((c) => {
        const msg = (c.commit?.message ?? '').trim();
        const subject = msg.split('\n')[0]?.trim() ?? '';
        if (!subject) return null;

        const committedAtRaw =
          c.commit?.committer?.date ?? c.commit?.author?.date ?? null;

        return this.prCommitTable.create({
          pullRequestId: prId,
          sha: String(c.sha ?? ''),
          message: subject,
          author: (c.author?.login ?? c.commit?.author?.name ?? null) as any,
          committedAtGithub: committedAtRaw ? new Date(committedAtRaw) : null,
        });
      })
      .filter((x): x is PullRequestCommit => x != null);

    const fileRows = files
      .map((f) => {
        const filename = String(f.filename ?? '').trim();
        if (!filename) return null;

        return this.prFileTable.create({
          pullRequestId: prId,
          filename,
          status: (f.status ?? null) as any,
          additions: typeof f.additions === 'number' ? f.additions : null,
          deletions: typeof f.deletions === 'number' ? f.deletions : null,
          changes: typeof f.changes === 'number' ? f.changes : null,
        });
      })
      .filter((x): x is PullRequestFile => x != null);

    if (commitRows.length)
      await this.prCommitTable.save(commitRows, { chunk: 200 });
    if (fileRows.length) await this.prFileTable.save(fileRows, { chunk: 300 });

    return this.prTable.findOne({
      where: { id: prId } as any,
    });
  }

  private async upsertPullDetailsWithStats(
    repositoryId: string,
    details: GithubPullDetail[],
  ) {
    const merged = details
      .map((d) => ({
        d,
        githubPrId: String(d.id),
        mergedAt: d.merged_at ? new Date(d.merged_at) : null,
      }))
      .filter((x) => x.mergedAt != null);

    if (!merged.length) return;

    const githubPrIds = merged.map((x) => x.githubPrId);

    const existing = await this.prTable.find({
      where: {
        repositoryId: String(repositoryId),
        githubPrId: In(githubPrIds),
      } as any,
      select: ['id', 'githubPrId'],
    });

    const idByGithubPrId = new Map(
      existing.map((e) => [String(e.githubPrId), e.id]),
    );

    const rows = merged.map(({ d, githubPrId, mergedAt }) => {
      const existingId = idByGithubPrId.get(githubPrId);

      return this.prTable.create({
        id: existingId,
        repositoryId: String(repositoryId),
        githubPrId,
        prNumber: d.number,

        title: d.title ?? '',
        content: d.body ?? null,
        author: d.user?.login ?? null,

        htmlUrl: (d.html_url ?? null) as any,
        state: (d.state ?? null) as any,

        createdAtGithub: d.created_at ? new Date(d.created_at) : null,
        updatedAtGithub: d.updated_at ? new Date(d.updated_at) : null,
        closedAtGithub: d.closed_at ? new Date(d.closed_at) : null,
        mergedAtGithub: mergedAt,

        changedFiles:
          typeof d.changed_files === 'number' ? d.changed_files : null,
        additions: typeof d.additions === 'number' ? d.additions : null,
        deletions: typeof d.deletions === 'number' ? d.deletions : null,
        commits: typeof d.commits === 'number' ? d.commits : null,
      });
    });

    await this.prTable.save(rows, { chunk: 50 });
  }

  // =========================
  // repository.last_synced_merged_at = DB MAX(merged_at_github)
  // =========================

  private async getLatestMergedAtFromDb(
    repositoryId: string,
  ): Promise<Date | null> {
    const row = await this.prTable
      .createQueryBuilder('pr')
      .select('MAX(pr.mergedAtGithub)', 'max')
      .where('pr.repositoryId = :rid', { rid: String(repositoryId) })
      .andWhere('pr.mergedAtGithub IS NOT NULL')
      .getRawOne<{ max: string | null }>();

    if (!row?.max) return null;

    const d = new Date(row.max);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private async updateRepoLastSyncedMergedAtFromDb(repositoryId: string) {
    const latest = await this.getLatestMergedAtFromDb(repositoryId);
    if (!latest) return;

    const repo = await this.repoTable.findOne({
      where: { id: String(repositoryId) },
    });
    if (!repo) return;

    const prev = (repo as any).lastSyncedMergedAt
      ? new Date((repo as any).lastSyncedMergedAt)
      : null;

    if (!prev || latest.getTime() > prev.getTime()) {
      (repo as any).lastSyncedMergedAt = latest;
      await this.repoTable.save(repo);
    }
  }
}
