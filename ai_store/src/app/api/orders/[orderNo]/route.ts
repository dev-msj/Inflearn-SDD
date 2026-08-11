import { requireUser } from '@/lib/auth-guard';
import { jsonError, jsonOk, NO_STORE_HEADERS } from '@/lib/http';
import { getOrderStatusForUser } from '@/server/orders/order.service';
import type { OrderStatusResponse } from '@/types/api';

/**
 * GET /api/orders/[orderNo] — 주문 상태 폴링 (F2-AC5/10/11).
 *
 * ★대기 화면의 `OrderStatusPoller`가 이 응답을 그대로 `OrderStatusView`로 파싱한다.
 *   응답 형태를 바꾸면 폴링이 깨지므로, 서비스 반환값을 가공 없이 내보낸다.
 *   폴링 주기(`pollAfterMs`)도 서버가 정해 내려보내며, 종료 상태에서는 0을 준다(폴링 중단).
 *
 * ★타인의 주문도 404다(존재 여부 노출 금지). 판정은 `getOrderStatusForUser()`가 담당한다.
 *
 * ★`no-store`: 주문 상태가 CDN·브라우저 캐시에 남으면 확정 후에도 옛 상태가 보인다.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ orderNo: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { orderNo } = await context.params;

  try {
    const user = await requireUser();
    const view = await getOrderStatusForUser(orderNo, user.id);

    return jsonOk<OrderStatusResponse>(view, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error, { route: 'orders/status', orderNo });
  }
}
