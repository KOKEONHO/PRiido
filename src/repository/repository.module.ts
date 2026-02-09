import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RepositoryController } from './repository.controller';
import { RepositoryService } from './repository.service';
import { Repository } from './entities/repository.entity';
import { MemberRepository } from './entities/member-repository.entity';
import { MemberModule } from 'src/member/member.module';
import { GithubModule } from 'src/github/github.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Repository, MemberRepository]),
    MemberModule,
    GithubModule,
  ],
  controllers: [RepositoryController],
  providers: [RepositoryService],
  exports: [RepositoryService],
})
export class RepositoryModule {}
