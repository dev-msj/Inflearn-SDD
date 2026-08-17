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
 * - `platforms` 를 **순차 생성**하고 **항상 200** 으로 `{ results }` 를 반환한다.
 *   개별 실패는 배열 원소의 `status:'error'` 로 표현한다 (AC-3.10).
 *
 *   병렬(`Promise.allSettled`)이었으나 순차로 바꿨다. 3건을 동시에 던지면 Gemini 가
 *   `503 UNAVAILABLE`(high demand)로 2건을 거절해 초안 1개만 생성되는 일이 재현됐다.
 *   `generateStructured` 의 백오프 재시도와 합쳐, 스스로 만드는 동시 부하를 없애는 쪽이
 *   AC-3.2(3개 동시 출력)를 실제로 지킨다. 3건 × 약 6초 ≈ 20초로 M7(45초) 안에 들어온다.
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

    const results: ContentGenerationResult[] = [];

    // 한 플랫폼의 실패가 다른 플랫폼의 생성을 막지 않는다 (AC-3.10)
    for (const platform of platforms) {
      try {
        results.push({ platform, status: 'success', draft: await generateDraft(platform, analysis, activity) });
      } catch (e) {
        results.push({ platform, status: 'error', error: normalizeError(e) });
      }
    }

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
