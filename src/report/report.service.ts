import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository as TypeOrmRepository } from 'typeorm';

import { ClaudeService } from '../ai/claude.service';

import { PullRequest } from '../pull-request/entities/pull-request.entity';
import { PullRequestCommit } from '../pull-request/entities/pull-request-commit.entity';
import { PullRequestFile } from '../pull-request/entities/pull-request-file.entity';

import { Repository as RepoEntity } from '../repository/entities/repository.entity';
import { MemberRepository } from '../repository/entities/member-repository.entity';

import { Report } from './entities/report.entity';

type GenerateWeeklyReportInput = {
  memberId: string;
  repositoryId: string;
  prIds: string[];
};

type ListReportsInput = {
  memberId: string;
  repositoryId: string;
  limit: number;
  cursor: string | null; // report.id 기준 내림차순 커서
};

type GetReportInput = {
  memberId: string;
  reportId: string;
};

@Injectable()
export class ReportService {
  constructor(
    private readonly claude: ClaudeService,

    @InjectRepository(PullRequest)
    private readonly prTable: TypeOrmRepository<PullRequest>,

    @InjectRepository(PullRequestCommit)
    private readonly prCommitTable: TypeOrmRepository<PullRequestCommit>,

    @InjectRepository(PullRequestFile)
    private readonly prFileTable: TypeOrmRepository<PullRequestFile>,

    @InjectRepository(RepoEntity)
    private readonly repoTable: TypeOrmRepository<RepoEntity>,

    @InjectRepository(MemberRepository)
    private readonly memberRepoTable: TypeOrmRepository<MemberRepository>,

    @InjectRepository(Report)
    private readonly reportTable: TypeOrmRepository<Report>,
  ) {}

  async generateWeeklyReport(input: GenerateWeeklyReportInput): Promise<{
    reportId: string;
    contentMarkdown: string;
    model: string;
    createdAt: string; // ✅ 프론트 편의상 ISO 문자열로 리턴
  }> {
    const { memberId, repositoryId } = input;

    // 1) repo 접근 권한 확인
    await this.assertRepoAccess(memberId, repositoryId);

    // 2) repo 메타
    const repo = await this.repoTable.findOne({
      where: { id: String(repositoryId) } as any,
      select: ['id', 'githubRepoFullName', 'htmlUrl', 'githubRepoName'] as any,
    });

    if (!repo?.githubRepoFullName) {
      throw new BadRequestException(
        'Repository not found or full name missing',
      );
    }

    // 3) PR들 로드
    const prIds = Array.from(new Set(input.prIds)).filter(Boolean);
    if (!prIds.length) throw new BadRequestException('prIds is empty');

    const prs = await this.prTable.find({
      where: {
        id: In(prIds as any),
        repositoryId: String(repositoryId),
      } as any,
      select: [
        'id',
        'prNumber',
        'title',
        'content',
        'author',
        'mergedAtGithub',
        'changedFiles',
        'additions',
        'deletions',
        'commits',
      ] as any,
      order: {
        mergedAtGithub: 'DESC' as any,
        prNumber: 'DESC' as any,
      } as any,
    });

    if (prs.length !== prIds.length) {
      throw new BadRequestException(
        'Some PR ids are invalid or do not belong to this repository',
      );
    }

    const prIdList = prs.map((p) => String((p as any).id));

    // 4) commits/files 로드
    const commits = await this.prCommitTable.find({
      where: { pullRequestId: In(prIdList as any) } as any,
      select: [
        'pullRequestId',
        'sha',
        'message',
        'author',
        'committedAtGithub',
      ] as any,
      order: { committedAtGithub: 'DESC' as any } as any,
    });

    const files = await this.prFileTable.find({
      where: { pullRequestId: In(prIdList as any) } as any,
      select: [
        'pullRequestId',
        'filename',
        'status',
        'additions',
        'deletions',
        'changes',
      ] as any,
      order: { changes: 'DESC' as any } as any,
    });

    // 5) PR별 그룹핑
    const commitsByPrId = new Map<string, PullRequestCommit[]>();
    for (const c of commits) {
      const k = String((c as any).pullRequestId);
      const list = commitsByPrId.get(k) ?? [];
      list.push(c);
      commitsByPrId.set(k, list);
    }

    const filesByPrId = new Map<string, PullRequestFile[]>();
    for (const f of files) {
      const k = String((f as any).pullRequestId);
      const list = filesByPrId.get(k) ?? [];
      list.push(f);
      filesByPrId.set(k, list);
    }

    // 6) 기간
    const mergedDates = prs
      .map((p) =>
        (p as any).mergedAtGithub ? new Date((p as any).mergedAtGithub) : null,
      )
      .filter((d): d is Date => !!d && !Number.isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    const periodStr =
      mergedDates.length > 0
        ? `${this.formatYmdDot(mergedDates[0])} ~ ${this.formatYmdDot(
            mergedDates[mergedDates.length - 1],
          )}`
        : 'YYYY.MM.DD ~ YYYY.MM.DD';

    // 7) 헤더
    const projectName =
      (repo as any).githubRepoName ?? (repo as any).githubRepoFullName ?? '';

    const prNumbers = prs
      .map((p) => (p as any).prNumber)
      .filter((n): n is number => typeof n === 'number')
      .sort((a, b) => a - b);

    const prNumbersLabel =
      prNumbers.length > 0 ? prNumbers.map((n) => `#${n}`).join(', ') : '-';

    const prAuthorsLabel = this.buildAuthorsLabel(
      prs.map((p) => (p as any).author ?? null),
    );

    const headerMarkdown = [
      '# 개발 보고서',
      '',
      `- 프로젝트: ${projectName}`,
      `- 기간: ${periodStr}`,
      `- PR 번호: ${prNumbersLabel}`,
      `- PR 쓴 사람: ${prAuthorsLabel}`,
      '',
    ].join('\n');

    // 8) Claude 입력
    const claudeInput = {
      headerMarkdown,
      repoFullName: (repo as any).githubRepoFullName,
      prs: prs.map((pr) => {
        const prId = String((pr as any).id);
        const prCommits = commitsByPrId.get(prId) ?? [];
        const prFiles = filesByPrId.get(prId) ?? [];

        const commitMessages = prCommits
          .map((c) => (c as any).message)
          .filter(Boolean)
          .slice(0, 10);

        const filesPayload = prFiles.slice(0, 30).map((f) => ({
          filename: (f as any).filename,
          status: (f as any).status ?? null,
          changes:
            typeof (f as any).changes === 'number' ? (f as any).changes : null,
        }));

        return {
          number: (pr as any).prNumber,
          title: (pr as any).title ?? '',
          author: (pr as any).author ?? null,
          mergedAt: (pr as any).mergedAtGithub
            ? new Date((pr as any).mergedAtGithub).toISOString()
            : null,
          stats: {
            changedFiles:
              typeof (pr as any).changedFiles === 'number'
                ? (pr as any).changedFiles
                : null,
            additions:
              typeof (pr as any).additions === 'number'
                ? (pr as any).additions
                : null,
            deletions:
              typeof (pr as any).deletions === 'number'
                ? (pr as any).deletions
                : null,
            commits:
              typeof (pr as any).commits === 'number'
                ? (pr as any).commits
                : null,
          },
          body: (pr as any).content
            ? String((pr as any).content).slice(0, 4000)
            : null,
          commitMessages,
          files: filesPayload,
        };
      }),
    };

    // 9) Claude 호출
    const contentMarkdown =
      await this.claude.generateWeeklyReportMarkdown(claudeInput);

    // 10) 저장 (created_at은 DB default now())
    const entity = this.reportTable.create({
      memberId: String(memberId),
      repositoryId: String(repositoryId),
      content: contentMarkdown,
    });

    const saved = await this.reportTable.save(entity);

    return {
      reportId: String((saved as any).id),
      contentMarkdown,
      model: process.env.CLAUDE_MODEL ?? 'claude-opus-4-6',
      createdAt: (saved as any).createdAt
        ? new Date((saved as any).createdAt).toISOString()
        : new Date().toISOString(),
    };
  }

  // ✅ 목록: createdAt 포함
  async listReports(input: ListReportsInput): Promise<{
    items: Array<{ id: string; repositoryId: string; createdAt: string }>;
    nextCursor: string | null;
  }> {
    const { memberId, repositoryId, limit, cursor } = input;

    await this.assertRepoAccess(memberId, repositoryId);

    const where: any = { repositoryId: String(repositoryId) };
    if (cursor) where.id = LessThan(String(cursor)); // id desc 커서

    const rows = await this.reportTable.find({
      where,
      select: ['id', 'repositoryId', 'createdAt'] as any,
      order: { id: 'DESC' as any } as any,
      take: limit,
    });

    const nextCursor =
      rows.length === limit ? String((rows[rows.length - 1] as any).id) : null;

    return {
      items: rows.map((r) => ({
        id: String((r as any).id),
        repositoryId: String((r as any).repositoryId),
        createdAt: (r as any).createdAt
          ? new Date((r as any).createdAt).toISOString()
          : new Date().toISOString(),
      })),
      nextCursor,
    };
  }

  // ✅ 상세: createdAt 포함
  async getReport(input: GetReportInput): Promise<{
    id: string;
    repositoryId: string;
    contentMarkdown: string;
    createdAt: string;
  }> {
    const { memberId, reportId } = input;

    const report = await this.reportTable.findOne({
      where: { id: String(reportId) } as any,
      select: ['id', 'repositoryId', 'content', 'createdAt'] as any,
    });

    if (!report) throw new NotFoundException('Report not found');

    await this.assertRepoAccess(memberId, String((report as any).repositoryId));

    return {
      id: String((report as any).id),
      repositoryId: String((report as any).repositoryId),
      contentMarkdown: String((report as any).content),
      createdAt: (report as any).createdAt
        ? new Date((report as any).createdAt).toISOString()
        : new Date().toISOString(),
    };
  }

  private async assertRepoAccess(memberId: string, repositoryId: string) {
    const link = await this.memberRepoTable.findOne({
      where: {
        memberId: String(memberId),
        repositoryId: String(repositoryId),
      } as any,
    });

    if (!link) {
      throw new ForbiddenException(
        'Repository is not registered by this member',
      );
    }
  }

  private formatYmdDot(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}.${m}.${day}`;
  }

  private buildAuthorsLabel(authors: Array<string | null>): string {
    const names = authors
      .map((a) => (a ?? '').trim())
      .filter((v) => v.length > 0);

    if (names.length === 0) return '알 수 없음';

    const uniq = Array.from(new Set(names));
    if (uniq.length <= 10) return uniq.join(', ');
    return `${uniq.slice(0, 10).join(', ')} 외 ${uniq.length - 10}명`;
  }
}
