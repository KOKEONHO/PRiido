// src/repository/repository.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RepositoryService } from './repository.service';
import { RegisterRepositoryDto } from './dto/register-repository.dto';
import type {
  GithubReposPageDto,
  GithubSourcesDto,
} from 'src/github/github.service';

@Controller('repositories')
export class RepositoryController {
  constructor(private readonly repositoryService: RepositoryService) {}

  /**
   * ✅ 1) "저장소 가져오기" 버튼 클릭 시: sources(내 계정 + org 목록)만 내려줌 (JSON)
   */
  @Get('sources')
  @UseGuards(JwtAuthGuard)
  async getSources(@Req() req: any): Promise<GithubSourcesDto> {
    const memberId = String(req.user.memberId);
    return this.repositoryService.getGithubSources(memberId);
  }

  /**
   * ✅ 2-A) 내 계정 레포 - JSON 페이지 응답 (호환용)
   * GET /api/repositories/github/user?first=30&after=...
   */
  @Get('github/user')
  @UseGuards(JwtAuthGuard)
  async getViewerReposPage(
    @Req() req: any,
    @Query('first') first?: string,
    @Query('after') after?: string,
  ): Promise<GithubReposPageDto> {
    const memberId = String(req.user.memberId);
    return this.repositoryService.getViewerReposPage(memberId, {
      first: first ? Number(first) : 30,
      after: after ?? null,
    });
  }

  /**
   * ✅ 2-A) 내 계정 레포 - SSE 스트림
   * GET /api/repositories/github/stream/user?first=30&after=...
   */
  @Sse('github/stream/user')
  @UseGuards(JwtAuthGuard)
  streamViewerRepos(
    @Req() req: Request & { user?: any },
    @Query('first') first?: string,
    @Query('after') after?: string,
  ): Observable<import('@nestjs/common').MessageEvent> {
    const memberId = String((req as any).user.memberId);
    return this.repositoryService.streamViewerRepos(memberId, {
      first: first ? Number(first) : 30,
      after: after ?? null,
    });
  }

  /**
   * ✅ 2-B) 조직 레포 - JSON 페이지 응답 (호환용)
   * GET /api/repositories/github/org/:orgLogin?first=30&after=...
   */
  @Get('github/org/:orgLogin')
  @UseGuards(JwtAuthGuard)
  async getOrgReposPage(
    @Req() req: any,
    @Param('orgLogin') orgLogin: string,
    @Query('first') first?: string,
    @Query('after') after?: string,
  ): Promise<GithubReposPageDto> {
    const memberId = String(req.user.memberId);
    return this.repositoryService.getOrgReposPage(memberId, orgLogin, {
      first: first ? Number(first) : 30,
      after: after ?? null,
    });
  }

  /**
   * ✅ 2-B) 조직 레포 - SSE 스트림
   * GET /api/repositories/github/stream/org/:orgLogin?first=30&after=...
   */
  @Sse('github/stream/org/:orgLogin')
  @UseGuards(JwtAuthGuard)
  streamOrgRepos(
    @Req() req: Request & { user?: any },
    @Param('orgLogin') orgLogin: string,
    @Query('first') first?: string,
    @Query('after') after?: string,
  ): Observable<import('@nestjs/common').MessageEvent> {
    const memberId = String((req as any).user.memberId);
    return this.repositoryService.streamOrgRepos(memberId, orgLogin, {
      first: first ? Number(first) : 30,
      after: after ?? null,
    });
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async register(@Req() req: any, @Body() body: RegisterRepositoryDto[]) {
    const memberId = req.user.memberId as string;
    return this.repositoryService.registerGithubRepos(memberId, body);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@Req() req: any) {
    const memberId = req.user.memberId as string;
    return this.repositoryService.listRegistered(memberId);
  }
}
