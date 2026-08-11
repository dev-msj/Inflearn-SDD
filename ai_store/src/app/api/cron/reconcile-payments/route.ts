import { jsonError, jsonOk, NO_STORE_HEADERS } from '@/lib/http';
import { assertCronRequest } from '@/server/jobs/cron-auth';
import { reconcilePayments } from '@/server/jobs/reconcile-payments.job';
import type { ReconcilePaymentsResponse } from '@/types/api';

/**
 * POST /api/cron/reconcile-payments — 자동 재조회 배치 (F2-AC3/11). 주기 2분.
 *
 * ★"결제는 됐는데 미지급"을 0건으로 만드는 장치다.
 *   웹훅이 유실되거나 사용자가 리디렉션 전에 브라우저를 닫아도, 결제사 조회 API가 SUCCEEDED를
 *   돌려주면 웹훅과 **동일한 확정 함수**(confirmOrderPaid)를 호출한다.
 *
 * ★공개 URL이므로 시크릿 헤더로만 보호된다(`x-cron-secret` 또는 `Authorization: Bearer`).
 *   실패 시 401 `CRON_UNAUTHORIZED`이며, 시크릿 비교는 timingSafeEqual로 수행한다.
 *
 * ★GET도 받는다. 관리형 스케줄러(Vercel Cron 등)가 GET만 보내기 때문이다.
 *   프리페치·크롤러 걱정은 메서드가 아니라 시크릿이 막는다 — 인증 없는 요청은 작업을 시작하지 못한다.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    assertCronRequest(request);

    const result = await reconcilePayments();

    return jsonOk<ReconcilePaymentsResponse>(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error, { route: 'cron/reconcile-payments' });
  }
}

/** 관리형 스케줄러(Vercel Cron 등)는 GET만 호출한다. 인증·동작은 POST와 동일하다. */
export const GET = POST;
