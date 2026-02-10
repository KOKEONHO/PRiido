// src/github/github.service.ts
import { Injectable } from '@nestjs/common';

export type GithubRepoDto = {
  githubRepoId: string; // GraphQL databaseId (없으면 node id fallback)
  fullName: string; // owner/repo
  htmlUrl: string;
  private: boolean;
};

export type GithubReposPageDto = {
  items: GithubRepoDto[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
};

export type GithubSourceDto = {
  type: 'USER' | 'ORG';
  login: string;
  name: string | null;
  avatarUrl: string | null;
};

export type GithubSourcesDto = {
  viewer: GithubSourceDto; // type USER
  orgs: GithubSourceDto[]; // type ORG
};

type RepoNode = {
  id: string;
  databaseId: number | null;
  nameWithOwner: string;
  url: string;
  isPrivate: boolean;
};

type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

@Injectable()
export class GithubService {
  private readonly endpoint = 'https://api.github.com/graphql';

  private readonly sourcesQuery = `
    query($orgFirst: Int!) {
      viewer {
        login
        name
        avatarUrl
        organizations(first: $orgFirst) {
          nodes {
            login
            name
            avatarUrl
          }
        }
      }
    }
  `;

  private readonly viewerReposQuery = `
    query($first: Int!, $after: String) {
      viewer {
        repositories(
          first: $first,
          after: $after,
          orderBy: { field: UPDATED_AT, direction: DESC }
        ) {
          nodes {
            id
            databaseId
            nameWithOwner
            url
            isPrivate
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  `;

  private readonly orgReposQuery = `
    query($login: String!, $first: Int!, $after: String) {
      organization(login: $login) {
        repositories(
          first: $first,
          after: $after,
          orderBy: { field: UPDATED_AT, direction: DESC }
        ) {
          nodes {
            id
            databaseId
            nameWithOwner
            url
            isPrivate
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  `;

  private async postGraphql<T>(
    accessToken: string,
    query: string,
    variables: Record<string, any>,
  ): Promise<GraphqlResponse<T>> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'priido',
      },
      body: JSON.stringify({ query, variables }),
    });

    const text = await res.text().catch(() => '');
    if (!res.ok) {
      throw new Error(`GitHub GraphQL error: ${res.status} ${text}`);
    }

    const json = (text ? JSON.parse(text) : {}) as GraphqlResponse<T>;

    if (json.errors?.length) {
      throw new Error(
        `GitHub GraphQL error: ${json.errors.map((e) => e.message).join(' | ')}`,
      );
    }

    return json;
  }

  private mapRepos(nodes: RepoNode[]): GithubRepoDto[] {
    return (nodes ?? []).map((n) => ({
      // ✅ databaseId가 null일 수 있으니 Node id로 fallback (프론트 식별용)
      githubRepoId: String(n.databaseId ?? n.id),
      fullName: n.nameWithOwner,
      htmlUrl: n.url,
      private: n.isPrivate,
    }));
  }

  /**
   * ✅ 1) 조직/소스 목록 가져오기 (read:org 필요)
   */
  async listSources(accessToken: string): Promise<GithubSourcesDto> {
    const json = await this.postGraphql<{
      viewer: {
        login: string;
        name: string | null;
        avatarUrl: string | null;
        organizations: {
          nodes: Array<{
            login: string;
            name: string | null;
            avatarUrl: string | null;
          }> | null;
        };
      };
    }>(accessToken, this.sourcesQuery, { orgFirst: 100 });

    const viewer = json.data?.viewer;
    const orgs = viewer?.organizations?.nodes ?? [];

    return {
      viewer: {
        type: 'USER',
        login: viewer?.login ?? '',
        name: viewer?.name ?? null,
        avatarUrl: viewer?.avatarUrl ?? null,
      },
      orgs: (orgs ?? []).map((o) => ({
        type: 'ORG',
        login: o.login,
        name: o.name ?? null,
        avatarUrl: o.avatarUrl ?? null,
      })),
    };
  }

  /**
   * ✅ 2-A) 내 계정(사용자) 레포 페이지
   */
  async listViewerReposPage(
    accessToken: string,
    opts: { first: number; after: string | null },
  ): Promise<GithubReposPageDto> {
    const first = Math.max(1, Math.min(opts.first ?? 30, 100));
    const after = opts.after ?? null;

    const json = await this.postGraphql<{
      viewer: {
        repositories: {
          nodes: RepoNode[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      };
    }>(accessToken, this.viewerReposQuery, { first, after });

    const conn = json.data?.viewer?.repositories;
    const nodes = conn?.nodes ?? [];
    const pageInfo = conn?.pageInfo ?? { hasNextPage: false, endCursor: null };

    return {
      items: this.mapRepos(nodes),
      pageInfo: {
        hasNextPage: !!pageInfo.hasNextPage,
        endCursor: pageInfo.endCursor ?? null,
      },
    };
  }

  /**
   * ✅ 2-B) 조직 레포 페이지 (org 선택 시 호출)
   */
  async listOrgReposPage(
    accessToken: string,
    orgLogin: string,
    opts: { first: number; after: string | null },
  ): Promise<GithubReposPageDto> {
    const first = Math.max(1, Math.min(opts.first ?? 30, 100));
    const after = opts.after ?? null;

    const json = await this.postGraphql<{
      organization: {
        repositories: {
          nodes: RepoNode[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      } | null;
    }>(accessToken, this.orgReposQuery, { login: orgLogin, first, after });

    const conn = json.data?.organization?.repositories;
    const nodes = conn?.nodes ?? [];
    const pageInfo = conn?.pageInfo ?? { hasNextPage: false, endCursor: null };

    return {
      items: this.mapRepos(nodes),
      pageInfo: {
        hasNextPage: !!pageInfo.hasNextPage,
        endCursor: pageInfo.endCursor ?? null,
      },
    };
  }
}
