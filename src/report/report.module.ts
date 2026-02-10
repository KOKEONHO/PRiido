import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AiModule } from '../ai/ai.module';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';

import { PullRequest } from '../pull-request/entities/pull-request.entity';
import { PullRequestCommit } from '../pull-request/entities/pull-request-commit.entity';
import { PullRequestFile } from '../pull-request/entities/pull-request-file.entity';

import { Repository } from '../repository/entities/repository.entity';
import { MemberRepository } from '../repository/entities/member-repository.entity';

import { Report } from './entities/report.entity';

@Module({
  imports: [
    AiModule,
    TypeOrmModule.forFeature([
      PullRequest,
      PullRequestCommit,
      PullRequestFile,
      Repository,
      MemberRepository,
      Report,
    ]),
  ],
  controllers: [ReportController],
  providers: [ReportService],
})
export class ReportModule {}
