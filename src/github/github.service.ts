import { Injectable } from '@nestjs/common';

export type GithubRepoDto = {
  githubRepoId: string; // GraphQL databaseId
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

type GraphqlResponse = {
  data?: {
    viewer?: {
      repositories?: {
        nodes?: Array<{
          databaseId: number | null;
          nameWithOwner: string;
          url: string;
          isPrivate: boolean;
        }>;
        pageInfo?: {
          hasNextPage: boolean;
          endCursor: string | null;
        };
      };
    };
  };
  errors?: Array<{ message: string }>;
};

@Injectable()
export class GithubService {
  private readonly endpoint = 'https://api.github.com/graphql';

  private readonly query = `
    query($first: Int!, $after: String) {
      viewer {
        repositories(
          first: $first,
          after: $after,
          orderBy: { field: UPDATED_AT, direction: DESC },
          ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]
        ) {
          nodes {
            databaseId
            nameWithOwner
            url
            isPrivate
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `;

  /**
   * ✅ GraphQL 커서 기반: first개씩 + pageInfo(endCursor/hasNextPage)
   * - accessToken은 OAuth Access Token
   */
  async listUserReposPage(
    accessToken: string,
    opts: { first: number; after: string | null },
  ): Promise<GithubReposPageDto> {
    const first = Math.max(1, Math.min(opts.first ?? 30, 100));
    const after = opts.after ?? null;

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`, // GraphQL은 Bearer 권장
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'priido',
      },
      body: JSON.stringify({
        query: this.query,
        variables: { first, after },
      }),
    });

    const text = await res.text().catch(() => '');
    if (!res.ok) {
      throw new Error(`GitHub GraphQL error: ${res.status} ${text}`);
    }

    const json = (text ? JSON.parse(text) : {}) as GraphqlResponse;

    if (json.errors?.length) {
      throw new Error(
        `GitHub GraphQL error: ${json.errors.map((e) => e.message).join(' | ')}`,
      );
    }

    const repoConn = json.data?.viewer?.repositories;
    const nodes = repoConn?.nodes ?? [];
    const pageInfo = repoConn?.pageInfo ?? {
      hasNextPage: false,
      endCursor: null,
    };

    const items: GithubRepoDto[] = nodes
      .filter((n) => typeof n.databaseId === 'number' && n.databaseId !== null)
      .map((n) => ({
        githubRepoId: String(n.databaseId),
        fullName: n.nameWithOwner,
        htmlUrl: n.url,
        private: n.isPrivate,
      }));

    return {
      items,
      pageInfo: {
        hasNextPage: !!pageInfo.hasNextPage,
        endCursor: pageInfo.endCursor ?? null,
      },
    };
  }
}
