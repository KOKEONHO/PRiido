import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { GithubAuthGuard } from './guards/github-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { TokenResponseDto } from './dto/token-response.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Get('github')
  @UseGuards(GithubAuthGuard)
  githubLogin() {}

  @Get('github/callback')
  @UseGuards(GithubAuthGuard)
  async githubCallback(@Req() req: any, @Res() res: Response) {
    const { priidoRt } = await this.authService.handleGithubLogin(req.user);

    res.cookie(
      this.authService.getRefreshCookieName(),
      priidoRt,
      this.authService.getRefreshCookieOptions(),
    );

    const frontOrigin =
      this.configService.get<string>('FRONT_ORIGIN') ?? 'http://localhost:5173';
    return res.redirect(`${frontOrigin}/oauth/callback`);
  }

  @Post('reissue')
  async token(@Req() req: Request, @Res() res: Response) {
    const rtCookieName = this.authService.getRefreshCookieName();
    const priidoRt = (req as any)?.cookies?.[rtCookieName] ?? '';

    const { priidoAt, priidoRt: newPriidoRt } =
      await this.authService.reissue(priidoRt);

    res.cookie(
      rtCookieName,
      newPriidoRt,
      this.authService.getRefreshCookieOptions(),
    );

    return res.status(201).json({ priidoAt } satisfies TokenResponseDto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: any, @Res() res: Response) {
    const { memberId } = req.user as { memberId: string };
    const me = await this.authService.getMe(memberId);
    return res.json({ me });
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    const rtCookieName = this.authService.getRefreshCookieName();
    const priidoRt = (req as any)?.cookies?.[rtCookieName] as
      | string
      | undefined;

    if (priidoRt) await this.authService.revokeRefreshToken(priidoRt);

    res.clearCookie(rtCookieName, { path: '/api/auth' });
    return res.json({ ok: true });
  }
}
