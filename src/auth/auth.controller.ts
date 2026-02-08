import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { AuthService } from './auth.service';
import { GithubAuthGuard } from './guards/github-auth.guard';

@Controller('auth') // => /api/auth/*
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('github')
  @UseGuards(GithubAuthGuard)
  githubLogin() {
    // passport가 GitHub로 redirect
  }

  @Get('github/callback')
  @UseGuards(GithubAuthGuard)
  async githubCallback(@Req() req: any, @Res() res: Response) {
    // req.user = GithubStrategy.validate() 리턴 값
    const { accessToken } = await this.authService.handleGithubLogin(req.user);

    console.log('req.user:', req.user);
    console.log('accessToken: ', accessToken);

    res.cookie('priido_at', accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
    });

    return res.redirect('/');
  }
}
