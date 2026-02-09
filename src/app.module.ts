import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from './auth/auth.module';
import { MemberModule } from './member/member.module';
import { GithubModule } from './github/github.module';
import { RepositoryModule } from './repository/repository.module';
import { Member } from './member/entities/member.entity';
import { GithubAccessToken } from './member/entities/github-access-token.entity';
import { Repository } from './repository/entities/repository.entity';
import { MemberRepository } from './repository/entities/member-repository.entity';
import { PullRequestModule } from './pull-request/pull-request.module';
import { PullRequest } from './pull-request/entities/pull-request.entity';
import { PullRequestCommit } from './pull-request/entities/pull-request-commit.entity';
import { PullRequestFile } from './pull-request/entities/pull-request-file.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST'),
        port: Number(configService.get<string>('DB_PORT') ?? 5432),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_NAME'),
        entities: [
          Member,
          GithubAccessToken,
          Repository,
          MemberRepository,
          PullRequest,
          PullRequestCommit,
          PullRequestFile,
        ],
        synchronize: false,
        logging: false,
      }),
    }),

    MemberModule,
    AuthModule,
    GithubModule,
    RepositoryModule,
    PullRequestModule,
  ],
})
export class AppModule {}
