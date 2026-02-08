import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('GITHUB_CLIENT_ID')!,
      clientSecret: config.get<string>('GITHUB_CLIENT_SECRET')!,
      callbackURL: config.get<string>('GITHUB_CALLBACK_URL')!,
      scope: ['read:user', 'repo'],
    });
  }

  async validate(accessToken: string, _refreshToken: string, profile: any) {
    return {
      githubUserId: profile?.id,
      githubUsername: profile?.username,
      githubAvatarUrl: profile?.photos?.[0]?.value ?? null,
      accessToken,
    };
  }
}
