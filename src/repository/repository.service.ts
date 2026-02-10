import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as TypeOrmRepository } from 'typeorm';
import { Observable } from 'rxjs';

import { Repository } from './entities/repository.entity';
import { MemberRepository } from './entities/member-repository.entity';
import { RegisterRepositoryDto } from './dto/register-repository.dto';
import { MemberService } from 'src/member/member.service';
import { GithubService, GithubReposPageDto } from 'src/github/github.service';

type PageOptions = {
  first: number;
  after: string | null;
};

// ✅ Nest SSE에서 쓰기 좋은 이벤트 타입 (DOM MessageEvent 아님!)
export type SseEvent<T = any> = {
  data: T;
  event?: string;
  id?: string;
  retry?: number;
};

type RepoStreamStart = { type: 'start' };
type RepoStreamItem = { type: 'repo'; item: any; sent: number };
type RepoStreamCursor = {
  type: 'cursor';
  endCursor: string | null;
  hasNextPage: boolean;
};
type RepoStreamEnd = { type: 'end'; total: number };

type RepoStreamPayload =
  | RepoStreamStart
  | RepoStreamItem
  | RepoStreamCursor
  | RepoStreamEnd;

@Injectable()
export class RepositoryService {
  constructor(
    @InjectRepository(Repository)
    private readonly repoTable: TypeOrmRepository<Repository>,
    @InjectRepository(MemberRepository)
    private readonly memberRepoTable: TypeOrmRepository<MemberRepository>,
    private readonly memberService: MemberService,
    private readonly githubService: GithubService,
  ) {}

  async getMyGithubRepos(
    memberId: string,
    opts: PageOptions,
  ): Promise<GithubReposPageDto> {
    const token = await this.memberService.getGithubAccessToken(
      String(memberId),
    );
    if (!token)
      throw new UnauthorizedException('GitHub access token not found');

    return this.githubService.listUserReposPage(token, opts);
  }

  // ✅ 여기 반환 타입 변경: Observable<MessageEvent> -> Observable<SseEvent<...>>
  streamMyGithubRepos(
    memberId: string,
    opts: PageOptions,
  ): Observable<SseEvent<RepoStreamPayload>> {
    return new Observable<SseEvent<RepoStreamPayload>>((subscriber) => {
      (async () => {
        const token = await this.memberService.getGithubAccessToken(
          String(memberId),
        );
        if (!token)
          throw new UnauthorizedException('GitHub access token not found');

        subscriber.next({ data: { type: 'start' } });

        const page = await this.githubService.listUserReposPage(token, opts);

        let sent = 0;
        for (const item of page.items) {
          sent += 1;
          subscriber.next({ data: { type: 'repo', item, sent } });
        }

        subscriber.next({
          data: {
            type: 'cursor',
            endCursor: page.pageInfo.endCursor,
            hasNextPage: page.pageInfo.hasNextPage,
          },
        });

        subscriber.next({ data: { type: 'end', total: sent } });
        subscriber.complete();
      })().catch((err) => subscriber.error(err));
    });
  }

  // ====== 아래는 네 원본 로직 그대로 ======

  async registerGithubRepos(memberId: string, items: RegisterRepositoryDto[]) {
    const results: { repositoryId: string; githubRepoId: string }[] = [];

    for (const item of items ?? []) {
      const githubRepoId = String(item.githubRepoId);
      const fullName = item.fullName;
      const name = fullName.includes('/') ? fullName.split('/')[1] : fullName;

      let repo = await this.repoTable.findOne({ where: { githubRepoId } });

      if (!repo) {
        repo = await this.repoTable.save(
          this.repoTable.create({
            githubRepoId,
            githubRepoName: name,
            githubRepoFullName: fullName,
            htmlUrl: item.htmlUrl ?? null,
            isPrivate: item.private,
            lastSyncedMergedAt: null,
          }),
        );
      } else {
        repo.githubRepoName = name;
        repo.githubRepoFullName = fullName;
        repo.isPrivate = item.private;
        repo.htmlUrl = item.htmlUrl ?? null;

        repo = await this.repoTable.save(repo);
      }

      const linkKey = {
        memberId: String(memberId),
        repositoryId: String(repo.id),
      };

      const link = await this.memberRepoTable.findOne({ where: linkKey });

      if (!link) {
        await this.memberRepoTable.save(
          this.memberRepoTable.create({ ...linkKey }),
        );
      }

      results.push({ repositoryId: String(repo.id), githubRepoId });
    }

    return { ok: true, registered: results };
  }

  async listRegistered(memberId: string) {
    const links = await this.memberRepoTable.find({
      where: { memberId: String(memberId) },
      relations: { repository: true },
    });

    return links.map((l) => ({
      id: l.repository.id,
      githubRepoId: l.repository.githubRepoId,
      name: l.repository.githubRepoName,
      fullName: l.repository.githubRepoFullName,
      htmlUrl: l.repository.htmlUrl,
      private: l.repository.isPrivate,
      lastSyncedMergedAt: l.repository.lastSyncedMergedAt,
    }));
  }
}
