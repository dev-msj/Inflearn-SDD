import { buildActivitySummary } from '@/lib/activity';
import { ApiException, toErrorResponse } from '@/lib/api-error';
import { fetchPublicEvents } from '@/lib/github';
import { requireSession } from '@/lib/session';
import { subtractDays } from '@/lib/utils';
import { activityQuerySchema, type ActivityResponse } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/activity?period=7|30|90` — 기간별 공개 활동 수집 (AC-1.5, AC-1.7, AC-1.8).
 *
 * 수집 대상은 공개 이벤트뿐이며(Q1), 실패는 `classifyGitHubError` 가 분류한 코드로
 * `{ error: { code, message, retryable } }` 를 반환한다.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireSession();

    const period = new URL(request.url).searchParams.get('period');
    const parsed = activityQuerySchema.safeParse({ period });
    if (!parsed.success) {
      throw new ApiException('INVALID_REQUEST');
    }
    const days = parsed.data.period;

    const to = new Date();
    const from = subtractDays(to, days);

    const { events, truncated } = await fetchPublicEvents(
      session.accessToken,
      session.user.login,
      from,
    );

    const body: ActivityResponse = {
      activity: buildActivitySummary(events, { days, from, to }, truncated),
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
