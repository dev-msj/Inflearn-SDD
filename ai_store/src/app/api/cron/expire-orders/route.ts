import { jsonError, jsonOk, NO_STORE_HEADERS } from '@/lib/http';
import { assertCronRequest } from '@/server/jobs/cron-auth';
import { expireOrders } from '@/server/jobs/expire-orders.job';
import type { ExpireOrdersResponse } from '@/types/api';

/**
 * POST /api/cron/expire-orders — 결제 시도 만료 배치 (F2-AC9). 주기 5분.
 *
 * ★만료 처리 전에 결제사 조회를 한 번 더 한다(job 내부).
 *   30분 경계 직전에 결제를 끝냈지만 웹훅이 아직 안 온 건을 만료시키면
 *   "돈은 받고 지급은 안 된" 상태가 되기 때문이다. 성공이 확인되면 만료 대신 확정한다.
 *
 * ★응답은 TECH_SPEC 7장 규격대로 `{ expired }`만 반환한다.
 *   만료 직전에 구제된 건수(confirmed)는 배치 로그(`job_completed`)로만 남긴다.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    assertCronRequest(request);

    const result = await expireOrders();

    return jsonOk<ExpireOrdersResponse>({ expired: result.expired }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error, { route: 'cron/expire-orders' });
  }
}

/**
 * 관리형 스케줄러(Vercel Cron 등)는 GET만 호출한다. 인증·동작은 POST와 동일하다.
 * 인증이 없으면 아무 일도 하지 않으므로 GET을 열어도 부수효과가 노출되지 않는다.
 */
export const GET = POST;
