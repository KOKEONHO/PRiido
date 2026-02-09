import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PullRequestService } from './pull-request.service';

@Controller('pull-requests')
export class PullRequestController {
  constructor(private readonly pullRequestService: PullRequestService) {}

  /**
   * GET /api/pull-requests?repositoryId=1&limit=30
   * GET /api/pull-requests?repositoryId=1&limit=30&cursorMergedAt=...&cursorPrNumber=...
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async list(
    @Req() req: any,
    @Query('repositoryId') repositoryId: string,
    @Query('limit') limit?: string,
    @Query('cursorMergedAt') cursorMergedAt?: string,
    @Query('cursorPrNumber') cursorPrNumber?: string,
  ) {
    const memberId = String(req.user.memberId);
    const n = limit ? Math.min(100, Math.max(1, Number(limit))) : 30;

    return this.pullRequestService.list({
      memberId,
      repositoryId: String(repositoryId),
      limit: n,
      cursorMergedAt: cursorMergedAt ? String(cursorMergedAt) : null,
      cursorPrNumber: cursorPrNumber ? Number(cursorPrNumber) : null,
    });
  }
}
