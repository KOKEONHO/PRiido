import {
  BadRequestException,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PullRequestService } from './pull-request.service';
import { Observable } from 'rxjs';

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

  /**
   * GET /api/pull-requests/stream?repositoryId=1&limit=30
   * GET /api/pull-requests/stream?repositoryId=1&limit=30&cursorMergedAt=...&cursorPrNumber=...
   */
  @Sse('stream')
  @UseGuards(JwtAuthGuard)
  stream(
    @Req() req: any,
    @Query('repositoryId') repositoryId: string,
    @Query('limit') limit?: string,
    @Query('cursorMergedAt') cursorMergedAt?: string,
    @Query('cursorPrNumber') cursorPrNumber?: string,
  ): Observable<import('@nestjs/common').MessageEvent> {
    const memberId = String(req.user.memberId);
    const n = limit ? Math.min(100, Math.max(1, Number(limit))) : 30;

    return this.pullRequestService.streamList({
      memberId,
      repositoryId: String(repositoryId),
      limit: n,
      cursorMergedAt: cursorMergedAt ? String(cursorMergedAt) : null,
      cursorPrNumber: cursorPrNumber ? Number(cursorPrNumber) : null,
    });
  }

  /**
   * POST /api/pull-requests/sync
   * body: { repositoryId: "1" }
   * - repository.last_synced_merged_at 이후로 병합된 PR만 동기화
   */
  @Post('sync')
  @UseGuards(JwtAuthGuard)
  async sync(@Req() req: any, @Body() body: { repositoryId?: string }) {
    const memberId = String(req.user.memberId);
    const repositoryId = String(body?.repositoryId ?? '');

    if (!repositoryId) {
      throw new BadRequestException('repositoryId is required');
    }

    return this.pullRequestService.syncNewlyMergedPulls(memberId, repositoryId);
  }

  /**
   * GET /api/pull-requests/sync/stream?repositoryId=1
   * - 신규 merged PR 동기화 진행상황 SSE
   */
  @Sse('sync/stream')
  @UseGuards(JwtAuthGuard)
  syncStream(
    @Req() req: any,
    @Query('repositoryId') repositoryId?: string,
  ): Observable<import('@nestjs/common').MessageEvent> {
    const memberId = String(req.user.memberId);
    const rid = String(repositoryId ?? '');

    if (!rid) {
      throw new BadRequestException('repositoryId is required');
    }

    return this.pullRequestService.streamSyncNewlyMergedPulls(memberId, rid);
  }

  /**
   * GET /api/pull-requests/:id?repositoryId=1
   * - 단건 조회 (DB)
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getOne(
    @Req() req: any,
    @Param('id') id: string,
    @Query('repositoryId') repositoryId?: string,
  ) {
    const memberId = String(req.user.memberId);
    const rid = String(repositoryId ?? '');

    if (!rid) {
      throw new BadRequestException('repositoryId is required');
    }

    return this.pullRequestService.getOne(memberId, rid, String(id));
  }

  /**
   * POST /api/pull-requests/refresh
   * body: { repositoryId: "1", id: "123" }
   * - 단건 강제 갱신 (GitHub detail/commits/files 재조회)
   */
  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  async refresh(
    @Req() req: any,
    @Body() body: { repositoryId?: string; id?: string },
  ) {
    const memberId = String(req.user.memberId);
    const repositoryId = String(body?.repositoryId ?? '');
    const id = String(body?.id ?? '');

    if (!repositoryId) {
      throw new BadRequestException('repositoryId is required');
    }
    if (!id) {
      throw new BadRequestException('id is required');
    }

    return this.pullRequestService.refreshOne(memberId, repositoryId, id);
  }
}
