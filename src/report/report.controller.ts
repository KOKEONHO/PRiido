import {
  BadRequestException,
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
import { ReportService } from './report.service';
import { GenerateReportDto } from './dto/generate-report.dto';

@Controller('reports') // => /api/reports/*
@UseGuards(JwtAuthGuard)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  /**
   * POST /api/reports/generate
   * body: { repositoryId: "1", prIds: ["101","102"] }
   */
  @Post('generate')
  async generate(@Req() req: any, @Body() body: GenerateReportDto) {
    const memberId = String(req.user.memberId);

    return this.reportService.generateWeeklyReport({
      memberId,
      repositoryId: String(body.repositoryId),
      prIds: body.prIds.map(String),
    });
  }

  // GET /api/reports?repositoryId=123&limit=20&cursor=9999
  @Get()
  async list(
    @Req() req: any,
    @Query('repositoryId') repositoryId?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    if (!repositoryId)
      throw new BadRequestException('repositoryId is required');

    const memberId = String(req.user.memberId);

    return this.reportService.listReports({
      memberId,
      repositoryId: String(repositoryId),
      limit: limit ? Math.min(Math.max(Number(limit), 1), 50) : 20,
      cursor: cursor ? String(cursor) : null,
    });
  }

  // GET /api/reports/1234
  @Get(':reportId')
  async getOne(@Req() req: any, @Param('reportId') reportId: string) {
    const memberId = String(req.user.memberId);

    return this.reportService.getReport({
      memberId,
      reportId: String(reportId),
    });
  }
}
