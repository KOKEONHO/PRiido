import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RepositoryService } from './repository.service';
import { RegisterRepositoryDto } from './dto/register-repository.dto';

@Controller('repositories')
export class RepositoryController {
  constructor(private readonly repositoryService: RepositoryService) {}

  @Get('github')
  @UseGuards(JwtAuthGuard)
  async getGithubRepos(@Req() req: any) {
    const memberId = req.user.memberId;
    return this.repositoryService.getMyGithubRepos(memberId);
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
