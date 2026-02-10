import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { nanoid } from 'nanoid';

import type { GithubUser } from './types/github-user.type';
import type { AccessTokenPayload } from './types/access-token-payload.type';
import type { RefreshTokenPayload } from './types/refresh-token-payload.type';

import { MemberService } from '../member/member.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly memberService: MemberService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  async handleGithubLogin(user: GithubUser): Promise<{ priidoRt: string }> {
    const member = await this.memberService.upsertMember({
      githubUserId: user.githubUserId,
      githubUsername: user.githubUsername,
      githubAvatarUrl: user.githubAvatarUrl ?? '',
    });

    await this.memberService.upsertGithubAccessToken({
      memberId: String(member.id),
      accessToken: user.accessToken,
    });

    const priidoRt = await this.signRefreshToken(String(member.id));
    await this.storeRefreshToken(priidoRt, String(member.id));

    return { priidoRt };
  }

  async reissue(
    priidoRt: string,
  ): Promise<{ priidoAt: string; priidoRt: string }> {
    if (!priidoRt) throw new UnauthorizedException('Missing refresh token');

    const payload = await this.verifyRefreshToken(priidoRt);

    const storedMemberId = await this.getRefreshTokenOwner(priidoRt);
    if (!storedMemberId || storedMemberId !== payload.memberId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.deleteRefreshToken(priidoRt);

    const newPriidoRt = await this.signRefreshToken(payload.memberId);
    await this.storeRefreshToken(newPriidoRt, payload.memberId);

    const priidoAt = await this.signAccessToken({ memberId: payload.memberId });

    return { priidoAt, priidoRt: newPriidoRt };
  }

  async getMe(memberId: string): Promise<{
    id: string;
    githubUserId: string;
    githubUsername: string;
    githubAvatarUrl: string;
  }> {
    const member = await this.memberService.findById(memberId);

    if (!member) throw new UnauthorizedException('Member not found');

    return {
      id: String(member.id),
      githubUserId: String(member.githubUserId),
      githubUsername: member.githubUsername,
      githubAvatarUrl: member.githubAvatarUrl,
    };
  }

  async revokeRefreshToken(priidoRt: string): Promise<void> {
    if (!priidoRt) return;
    await this.deleteRefreshToken(priidoRt);
  }

  getRefreshCookieName(): string {
    return this.configService.get<string>('RT_COOKIE_NAME') ?? 'priidoRt';
  }

  getRefreshCookieOptions() {
    const secure =
      (this.configService.get<string>('COOKIE_SECURE') ?? 'false') === 'true';

    const sameSite = (this.configService.get<string>('COOKIE_SAMESITE') ??
      'lax') as 'lax' | 'strict' | 'none';

    const domain = this.configService.get<string>('COOKIE_DOMAIN') || undefined;

    return {
      httpOnly: true,
      secure,
      sameSite,
      domain,
      path: '/api/auth',
    } as const;
  }

  private getJwtSecret(): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET is missing');
    return secret;
  }

  private getAccessExpiresSec(): number {
    return Number(this.configService.get<string>('JWT_AT_EXPIRES_SEC') ?? 900);
  }

  private getRefreshExpiresSec(): number {
    return Number(
      this.configService.get<string>('JWT_RT_EXPIRES_SEC') ?? 1209600,
    );
  }

  private async signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.getJwtSecret(),
      expiresIn: this.getAccessExpiresSec(),
    });
  }

  private async signRefreshToken(memberId: string): Promise<string> {
    const payload: RefreshTokenPayload = {
      memberId,
      jti: nanoid(24),
    };

    return this.jwtService.signAsync(payload, {
      secret: this.getJwtSecret(),
      expiresIn: this.getRefreshExpiresSec(),
    });
  }

  private async verifyRefreshToken(
    token: string,
  ): Promise<RefreshTokenPayload> {
    try {
      return await this.jwtService.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.getJwtSecret(),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private refreshKey(token: string): string {
    return `refresh:${token}`;
  }

  private async storeRefreshToken(
    token: string,
    memberId: string,
  ): Promise<void> {
    const ttlSec = this.getRefreshExpiresSec();
    await this.redisService.setex(this.refreshKey(token), ttlSec, memberId);
  }

  private async getRefreshTokenOwner(token: string): Promise<string | null> {
    return this.redisService.get(this.refreshKey(token));
  }

  private async deleteRefreshToken(token: string): Promise<void> {
    await this.redisService.del(this.refreshKey(token));
  }
}
