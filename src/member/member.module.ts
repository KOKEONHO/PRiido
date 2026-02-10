import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Member } from './entities/member.entity';
import { GithubAccessToken } from './entities/github-access-token.entity';
import { MemberService } from './member.service';

@Module({
  imports: [TypeOrmModule.forFeature([Member, GithubAccessToken])],
  providers: [MemberService],
  exports: [MemberService],
})
export class MemberModule {}
