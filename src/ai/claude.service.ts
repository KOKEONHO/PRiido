import { Injectable, InternalServerErrorException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ClaudeService {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!key) throw new Error('ANTHROPIC_API_KEY is missing');

    this.client = new Anthropic({ apiKey: key });
    this.model = this.config.get<string>('CLAUDE_MODEL') ?? 'claude-opus-4-6';
  }

  private extractText(msg: any): string {
    return (msg.content ?? [])
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n')
      .trim();
  }

  private requiredHeadings(): string[] {
    return [
      '## 요약',
      '## 주요 작업',
      '## 사용자/비즈니스 관점의 변화',
      '## 리스크/주의사항',
      '## 다음 주 계획 제안',
    ];
  }

  private hasAllSections(md: string): boolean {
    return this.requiredHeadings().every((h) => md.includes(h));
  }

  private buildSystem(): string {
    return `
너는 비개발자가 읽기 쉬운 개발 보고서를 작성하는 에디터다.
기술 용어는 최소화하고, "무엇이 좋아졌는지 / 사용자에게 어떤 의미인지" 중심으로 작성한다.
출력은 반드시 Markdown만 사용한다.

[가장 중요한 규칙]
- 사용자가 제공하는 "헤더 블록(headerMarkdown)"은 절대 수정/삭제/재작성하지 말고 그대로 문서 최상단에 유지한다.
- 보고서의 시작은 반드시 headerMarkdown으로 시작한다.
- headerMarkdown 아래에 아래 섹션들을 순서대로 작성한다.

[섹션 구조(반드시 이 순서)]
## 요약
## 주요 작업
## 사용자/비즈니스 관점의 변화
## 리스크/주의사항
## 다음 주 계획 제안

[작성 규칙]
- "요약": 3~5줄
- "주요 작업": 불릿 5개 이내
- "사용자/비즈니스 관점의 변화": 불릿 3개 이내
- "리스크/주의사항": 없으면 "특이사항 없음" 한 줄로
- "다음 주 계획 제안": 불릿 3개 이내 (비어 있으면 안 됨. 최소 1개)
- 섹션 제목에는 절대 괄호/가이드 문구를 포함하지 않는다.
- 코드 블록, 전체 diff, 과도한 기술 상세는 절대 포함하지 않는다.
- 마지막 문장은 반드시 완결된 문장으로 끝낸다.
`.trim();
  }

  async generateWeeklyReportMarkdown(input: {
    headerMarkdown: string; // ✅ 서버가 완성해 둔 헤더 (수정 금지)
    repoFullName: string;
    prs: Array<{
      number: number;
      title: string;
      author: string | null;
      mergedAt: string | null;
      stats: {
        changedFiles: number | null;
        additions: number | null;
        deletions: number | null;
        commits: number | null;
      };
      body: string | null;
      commitMessages: string[];
      files: Array<{
        filename: string;
        status: string | null;
        changes: number | null;
      }>;
    }>;
  }): Promise<string> {
    const system = this.buildSystem();

    const payload = {
      headerMarkdown: input.headerMarkdown,
      repo: input.repoFullName,
      pullRequests: input.prs.map((p) => ({
        number: p.number,
        title: p.title,
        author: p.author,
        mergedAt: p.mergedAt,
        stats: p.stats,
        summaryHints: {
          commitMessagesTop: (p.commitMessages ?? []).slice(0, 5),
          filesTop: (p.files ?? []).slice(0, 10),
        },
        body: p.body?.slice(0, 2000) ?? null,
      })),
    };

    const user = [
      '아래 JSON의 headerMarkdown을 문서 최상단에 그대로 붙여넣고(수정 금지), 그 아래 섹션을 작성해라.',
      '출력은 Markdown만.',
      '',
      JSON.stringify(payload, null, 2),
    ].join('\n');

    const call = async (messages: any[]) => {
      const msg = await this.client.messages.create({
        model: this.model,
        max_tokens: 3500,
        system,
        messages,
      });
      return this.extractText(msg);
    };

    try {
      // 1) 1차 생성
      let out = await call([{ role: 'user', content: user }]);

      // 2) 끊기거나 섹션 누락이면 이어쓰기/보정
      for (let i = 0; i < 2; i++) {
        if (out.includes('# 개발 보고서') && this.hasAllSections(out)) break;

        const cont = await call([
          { role: 'user', content: user },
          { role: 'assistant', content: out },
          {
            role: 'user',
            content:
              '출력이 끊겼거나 섹션이 누락되었다. 이미 쓴 내용은 반복하지 말고, headerMarkdown은 그대로 유지한 채 누락된 부분을 끝까지 완성해라. Markdown만.',
          },
        ]);

        if (!cont) break;

        if (cont.includes('# 개발 보고서') && cont.includes('- 프로젝트:')) {
          out = cont.trim();
        } else {
          out = `${out}\n\n${cont}`.trim();
        }
      }

      // 3) 헤더 빠짐 방지
      if (!out.includes('# 개발 보고서') || !out.includes('- 프로젝트:')) {
        const fixed = await call([
          { role: 'user', content: user },
          { role: 'assistant', content: out },
          {
            role: 'user',
            content:
              '문서 최상단에 headerMarkdown을 반드시 포함해서 전체를 다시 출력해라. 헤더는 수정 금지. Markdown만.',
          },
        ]);
        out = (fixed || out).trim();
      }

      return out;
    } catch (e: any) {
      throw new InternalServerErrorException(
        `Claude API failed: ${e?.message ?? 'unknown error'}`,
      );
    }
  }
}
