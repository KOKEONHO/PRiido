import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PullRequestController } from './pull-request.controller';
import { PullRequestService } from './pull-request.service';

import { PullRequest } from './entities/pull-request.entity';
import { PullRequestCommit } from './entities/pull-request-commit.entity';
import { PullRequestFile } from './entities/pull-request-file.entity';

import { Repository } from '../repository/entities/repository.entity';
import { MemberRepository } from '../repository/entities/member-repository.entity';
import { MemberModule } from '../member/member.module';

@Module({
  imports: [
    MemberModule,
    TypeOrmModule.forFeature([
      PullRequest,
      PullRequestCommit,
      PullRequestFile,
      Repository,
      MemberRepository,
    ]),
  ],
  controllers: [PullRequestController],
  providers: [PullRequestService],
})
export class PullRequestModule {}
