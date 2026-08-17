import { buildActivitySummary, collectPushedRepositories, toCommitActivities } from '@/lib/activity';
import { ApiException, toErrorResponse } from '@/lib/api-error';
import { fetchPublicEvents, fetchRepoCommits } from '@/lib/github';
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
 *
 * **2단계 수집**: Events API 의 `PushEvent` payload 에는 커밋이 없으므로
 * ① 이벤트로 PR·이슈·스타와 "푸시가 발생한 저장소 목록"을 얻고
 * ② 그 저장소마다 `GET /repos/{owner}/{repo}/commits` 를 병렬 호출해 커밋을 채운다.
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

    const activityPeriod = { days, from, to };

    // 푸시가 발생한 저장소마다 커밋을 병렬 조회한다 (저장소 수만큼 호출 — 보통 1~5회)
    const pushedRepositories = collectPushedRepositories(events, activityPeriod);
    const settled = await Promise.allSettled(
      pushedRepositories.map((repo) =>
        fetchRepoCommits(session.accessToken, repo, session.user.login, from, to),
      ),
    );

    // 토큰 무효·rate limit 은 조회 전체를 무의미하게 만들므로 그대로 노출한다 (AC-1.8).
    // 개별 저장소 실패(삭제·비공개 전환)는 그 저장소만 빠지고 나머지는 살린다.
    const fatal = settled.find(
      (result): result is PromiseRejectedResult =>
        result.status === 'rejected' && result.reason instanceof ApiException,
    );
    if (fatal !== undefined) {
      throw fatal.reason as ApiException;
    }

    const commits = settled.flatMap((result, index) =>
      result.status === 'fulfilled'
        ? toCommitActivities(pushedRepositories[index], result.value)
        : [],
    );

    const body: ActivityResponse = {
      activity: buildActivitySummary(events, commits, activityPeriod, truncated),
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
