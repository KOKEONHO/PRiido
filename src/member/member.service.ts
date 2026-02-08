import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Member } from './entities/member.entity';
import { GithubAccessToken } from './entities/github-access-token.entity';

@Injectable()
export class MemberService {
  constructor(
    @InjectRepository(Member)
    private readonly memberRepository: Repository<Member>,
    @InjectRepository(GithubAccessToken)
    private readonly githubAccessTokenRepository: Repository<GithubAccessToken>,
  ) {}

  async findById(memberId: string): Promise<Member | null> {
    return this.memberRepository.findOne({
      where: { id: memberId },
    });
  }

  async upsertMember(input: {
    githubUserId: string;
    githubUsername: string;
    githubAvatarUrl: string;
  }): Promise<Member> {
    await this.memberRepository.upsert(
      {
        githubUserId: input.githubUserId,
        githubUsername: input.githubUsername,
        githubAvatarUrl: input.githubAvatarUrl,
      },
      ['githubUserId'],
    );

    return this.memberRepository.findOneByOrFail({
      githubUserId: input.githubUserId,
    });
  }

  async upsertGithubAccessToken(input: {
    memberId: string;
    accessToken: string;
  }): Promise<GithubAccessToken> {
    await this.githubAccessTokenRepository.upsert(
      {
        memberId: input.memberId,
        accessToken: input.accessToken,
      },
      ['memberId'],
    );

    return this.githubAccessTokenRepository.findOneByOrFail({
      memberId: input.memberId,
    });
  }
}
