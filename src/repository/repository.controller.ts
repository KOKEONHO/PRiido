// src/repository/repository.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

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

  @Get('sources')
  @UseGuards(JwtAuthGuard)
  async getSources(@Req() req: any): Promise<GithubSourcesDto> {
    const memberId = String(req.user.memberId);
    return this.repositoryService.getGithubSources(memberId);
  }

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
