import { ApiException, toErrorResponse } from '@/lib/api-error';
import { ANALYSIS_TIMEOUT_MS, LOW_ACTIVITY_THRESHOLD } from '@/lib/constants';
import { generateStructured } from '@/lib/gemini';
import { ANALYSIS_RESPONSE_SCHEMA, buildAnalysisPrompt } from '@/lib/prompts/analysis';
import { requireSession } from '@/lib/session';
import { analyzeRequestSchema, type AnalyzeResponse } from '@/types/api';
import { analysisResultSchema } from '@/types/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/analyze` — 활동 요약을 Gemini 로 분석한다 (TECH_SPEC 3. 기능 2 > 2-D).
 *
 * Gemini 호출은 이 핸들러 내부에서만 수행하고, 응답 본문에 API 키·프롬프트 원문을
 * 포함하지 않는다 (AC-2.7). `generatedAt`·`lowVolume` 은 서버가 부여한다.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    await requireSession();

    const raw: unknown = await request.json().catch(() => null);
    const parsed = analyzeRequestSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ApiException('INVALID_REQUEST');
    }

    const { activity } = parsed.data;
    if (activity.totalCount === 0) {
      // 분석할 활동이 없으면 모델을 호출하지 않는다 (AC-2.1)
      throw new ApiException('INVALID_REQUEST', '분석할 활동이 없습니다.');
    }

    const result = await generateStructured({
      prompt: buildAnalysisPrompt(activity),
      responseSchema: ANALYSIS_RESPONSE_SCHEMA,
      parse: (value) => analysisResultSchema.parse(value),
      timeoutMs: ANALYSIS_TIMEOUT_MS,
    });

    const body: AnalyzeResponse = {
      analysis: {
        ...result,
        generatedAt: new Date().toISOString(),
        lowVolume: activity.totalCount < LOW_ACTIVITY_THRESHOLD,
      },
    };

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
