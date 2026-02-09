import { Injectable } from '@nestjs/common';

type GithubRepoApiItem = {
  id: number;
  full_name: string; // owner/repo
  html_url: string;
  private: boolean;
};

@Injectable()
export class GithubService {
  async listUserRepos(accessToken: string) {
    const url = new URL('https://api.github.com/user/repos');
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', '1'); // ✅ PRWR 방식: 100개만
    url.searchParams.set('sort', 'updated');
    url.searchParams.set('direction', 'desc');

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'priido',
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GitHub API error: ${res.status} ${text}`);
    }

    const data = (await res.json()) as GithubRepoApiItem[];

    // ✅ 프론트가 바로 POST /repositories에 보낼 수 있게 DTO 형태로 매핑
    return data.map((r) => ({
      githubRepoId: String(r.id),
      fullName: r.full_name,
      htmlUrl: r.html_url,
      private: r.private,
    }));
  }
}
