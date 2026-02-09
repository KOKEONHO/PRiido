import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
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
    opts: { mergedBefore: string | null; perPage: number; page: number },
  ): Promise<GithubSearchIssuesResponse> {
    const qParts: string[] = [`repo:${fullName}`, 'is:pr', 'is:merged'];
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
    const unique = Array.from(new Set(prNumbers)).slice(0, 100);
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
