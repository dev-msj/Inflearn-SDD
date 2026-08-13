import { z } from 'zod';
import { ApiException, normalizeError, toErrorResponse } from '@/lib/api-error';
import { CONTENT_TIMEOUT_MS } from '@/lib/constants';
import { generateStructured } from '@/lib/gemini';
import { buildContentPrompt, CONTENT_RESPONSE_SCHEMA, type AnalysisContent } from '@/lib/prompts/content';
import { requireSession } from '@/lib/session';
import {
  contentRequestSchema,
  type ContentGenerationResult,
  type ContentResponse,
} from '@/types/api';
import type { ActivitySummary, ContentDraft, Platform } from '@/types/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/content` — 분석 결과를 플랫폼별 초안으로 옮긴다 (TECH_SPEC 3. 기능 3 > 3-D).
 *
 * - `platforms` 를 `Promise.allSettled` 로 **병렬 생성**하고 **항상 200** 으로 `{ results }` 를 반환한다.
 *   개별 실패는 배열 원소의 `status:'error'` 로 표현한다 (AC-3.10).
 * - 인증·스키마 실패만 4xx 다.
 * - 개별 재생성(AC-3.7)은 `platforms: ['x']` 처럼 1개만 보내 같은 경로로 처리한다.
 */

/** Gemini 구조화 응답 (`CONTENT_RESPONSE_SCHEMA` 와 1:1) */
const contentResponseSchema = z.object({ content: z.string().trim().min(1) });

async function generateDraft(
  platform: Platform,
  analysis: AnalysisContent,
  activity: ActivitySummary,
): Promise<ContentDraft> {
  const content = await generateStructured({
    prompt: buildContentPrompt({ platform, analysis, activity }),
    responseSchema: CONTENT_RESPONSE_SCHEMA,
    parse: (value) => contentResponseSchema.parse(value).content,
    timeoutMs: CONTENT_TIMEOUT_MS,
  });

  return {
    platform,
    content,
    generatedAt: new Date().toISOString(),
    edited: false,
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    await requireSession();

    const raw: unknown = await request.json().catch(() => null);
    const parsed = contentRequestSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ApiException('INVALID_REQUEST');
    }

    const { platforms, analysis, activity } = parsed.data;

    const settled = await Promise.allSettled(
      platforms.map((platform) => generateDraft(platform, analysis, activity)),
    );

    const results: ContentGenerationResult[] = platforms.map((platform, index) => {
      const outcome = settled[index];

      if (outcome.status === 'fulfilled') {
        return { platform, status: 'success', draft: outcome.value };
      }

      // 한 플랫폼의 실패가 다른 플랫폼의 결과를 무효화하지 않는다 (AC-3.10)
      return { platform, status: 'error', error: normalizeError(outcome.reason) };
    });

    const body: ContentResponse = { results };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
