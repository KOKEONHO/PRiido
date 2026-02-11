// src/repository/repository.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as TypeOrmRepository } from 'typeorm';

import { Repository } from './entities/repository.entity';
import { MemberRepository } from './entities/member-repository.entity';
import { RegisterRepositoryDto } from './dto/register-repository.dto';
import { MemberService } from 'src/member/member.service';
import {
  GithubService,
  type GithubReposPageDto,
  type GithubSourcesDto,
} from 'src/github/github.service';

type PageOptions = {
  first: number;
  after: string | null;
};

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

  private normalizePageOptions(opts: PageOptions): PageOptions {
    const firstRaw = Number.isFinite(opts.first) ? opts.first : 30;
    const first = Math.max(1, Math.min(firstRaw, 100));
    const after = opts.after ?? null;
    return { first, after };
  }

  private async getAccessTokenOrThrow(memberId: string): Promise<string> {
    const token = await this.memberService.getGithubAccessToken(
      String(memberId),
    );
    if (!token)
      throw new UnauthorizedException('GitHub access token not found');
    return token;
  }

  /**
   * ✅ 1) sources: 내 계정 + org 목록 (read:org 필요)
   */
  async getGithubSources(memberId: string): Promise<GithubSourcesDto> {
    const token = await this.getAccessTokenOrThrow(memberId);
    return this.githubService.listSources(token);
  }

  /**
   * ✅ 2-A) 내 계정 레포 - JSON 페이지 (GitHub GraphQL 커서 페이징)
   */
  async getViewerReposPage(
    memberId: string,
    opts: PageOptions,
  ): Promise<GithubReposPageDto> {
    const token = await this.getAccessTokenOrThrow(memberId);
    const normalized = this.normalizePageOptions(opts);
    return this.githubService.listViewerReposPage(token, normalized);
  }

  /**
   * ✅ 2-B) 조직 레포 - JSON 페이지 (GitHub GraphQL 커서 페이징)
   */
  async getOrgReposPage(
    memberId: string,
    orgLogin: string,
    opts: PageOptions,
  ): Promise<GithubReposPageDto> {
    const token = await this.getAccessTokenOrThrow(memberId);
    const normalized = this.normalizePageOptions(opts);
    return this.githubService.listOrgReposPage(token, orgLogin, normalized);
  }

  async registerGithubRepos(memberId: string, items: RegisterRepositoryDto[]) {
    const results: { repositoryId: string; githubRepoId: string }[] = [];

    for (const item of items ?? []) {
      const githubRepoId = String(item.githubRepoId);
      const fullName = item.fullName; // owner/repo
      const name = fullName.includes('/') ? fullName.split('/')[1] : fullName;

      // 1) repository upsert (by github_repo_id)
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

      // 2) member_repository upsert (by member_id + repository_id)
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
