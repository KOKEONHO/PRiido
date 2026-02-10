import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  Sse,
  Query,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RepositoryService, SseEvent } from './repository.service';
import { RegisterRepositoryDto } from './dto/register-repository.dto';

@Controller('repositories')
export class RepositoryController {
  constructor(private readonly repositoryService: RepositoryService) {}

  @Get('github')
  @UseGuards(JwtAuthGuard)
  async getGithubRepos(
    @Req() req: any,
    @Query('first') first?: string,
    @Query('after') after?: string,
  ) {
    const memberId = req.user.memberId as string;
    const firstNum = Number(first ?? '30');

    return this.repositoryService.getMyGithubRepos(memberId, {
      first: Number.isFinite(firstNum)
        ? Math.max(1, Math.min(firstNum, 100))
        : 30,
      after: after ?? null,
    });
  }

  @Sse('github/stream')
  @UseGuards(JwtAuthGuard)
  streamGithubRepos(
    @Req() req: any,
    @Query('first') first?: string,
    @Query('after') after?: string,
  ): Observable<SseEvent<any>> {
    const memberId = req.user.memberId as string;
    const firstNum = Number(first ?? '30');

    return this.repositoryService.streamMyGithubRepos(memberId, {
      first: Number.isFinite(firstNum)
        ? Math.max(1, Math.min(firstNum, 100))
        : 30,
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
