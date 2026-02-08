import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { redisClient } from './redis.constants';
import { RedisService } from './redis.service';

@Module({
  providers: [
    {
      provide: redisClient,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return new Redis({
          host: configService.get<string>('REDIS_HOST') ?? 'localhost',
          port: Number(configService.get<string>('REDIS_PORT') ?? 6379),
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
          db: Number(configService.get<string>('REDIS_DB') ?? 0),
          lazyConnect: true,
          maxRetriesPerRequest: 2,
        });
      },
    },
    RedisService,
  ],
  exports: [redisClient, RedisService],
})
export class RedisModule {}
