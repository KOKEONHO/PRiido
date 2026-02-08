import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { redisClient } from './redis.constants';

@Injectable()
export class RedisService {
  constructor(@Inject(redisClient) private readonly redis: Redis) {}

  async ensureConnected(): Promise<void> {
    if (this.redis.status === 'ready') return;
    if (this.redis.status === 'connecting') return;
    await this.redis.connect();
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    await this.ensureConnected();
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }

  async get(key: string): Promise<string | null> {
    await this.ensureConnected();
    return this.redis.get(key);
  }

  async del(key: string): Promise<number> {
    await this.ensureConnected();
    return this.redis.del(key);
  }
}
