import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as fs from 'fs';

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
import { ReportModule } from './report/report.module';
import { Report } from './report/entities/report.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const sslEnabled =
          (
            configService.get<string>('DB_SSL_ENABLED') ?? 'true'
          ).toLowerCase() === 'true';

        let ssl: false | { rejectUnauthorized: true; ca: string } = false;

        if (sslEnabled) {
          const caPath =
            configService.get<string>('DB_SSL_CA_PATH') ??
            '/run/secrets/rds-ca.pem';

          if (!fs.existsSync(caPath)) {
            throw new Error(
              `DB SSL is enabled but CA file not found: ${caPath}. ` +
                `Mount the RDS CA bundle into the container (e.g., -v /etc/ssl/rds-ca/global-bundle.pem:${caPath}:ro) ` +
                `or set DB_SSL_ENABLED=false for local/dev.`,
            );
          }

          const ca = fs.readFileSync(caPath, 'utf8');

          ssl = {
            rejectUnauthorized: true,
            ca,
          };
        }

        return {
          type: 'postgres' as const,
          host: configService.get<string>('DB_HOST'),
          port: Number(configService.get<string>('DB_PORT') ?? 5432),
          username: configService.get<string>('DB_USERNAME'),
          password: configService.get<string>('DB_PASSWORD'),
          database: configService.get<string>('DB_NAME'),
          ssl,

          entities: [
            Member,
            GithubAccessToken,
            Repository,
            MemberRepository,
            PullRequest,
            PullRequestCommit,
            PullRequestFile,
            Report,
          ],
          synchronize: false,
          logging: false,
        };
      },
    }),

    MemberModule,
    AuthModule,
    GithubModule,
    RepositoryModule,
    PullRequestModule,
    ReportModule,
  ],
})
export class AppModule {}
