import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth-guard';
import { orderLogger } from '@/lib/logger';
import { findOrderNoByProviderPaymentId } from '@/server/orders/order.repository';
import { markOrderConfirming } from '@/server/orders/order.service';
import { DEFAULT_LOCALE } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';

/**
 * GET /api/checkout/paddle/return — Paddle 완료 리디렉션 (F2-AC5/11).
 *
 * ★★이 라우트도 주문을 확정하지 않는다.
 *   `markOrderConfirming(orderNo, 'REDIRECT')`만 호출하며, 전이표상 REDIRECT는 PAID를 만들 수 없다.
 *   확정은 `transaction.completed` 웹훅 또는 재조회 배치가 Paddle 조회 API로 재확인한 뒤에만 일어난다.
 *
 * ★Paddle 복귀 URL에는 주문번호가 아니라 트랜잭션 id(`_ptxn`)가 실린다.
 *   결제 시작 시 orders.provider_payment_id에 저장해 둔 값으로 주문을 역추적한다.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function resolveLocale(): Promise<AppLocale> {
  const user = await getCurrentUser();
  return user?.locale ?? DEFAULT_LOCALE;
}

export async function GET(request: Request): Promise<Response> {
  const transactionId = new URL(request.url).searchParams.get('_ptxn');
  const locale = await resolveLocale();

  if (!transactionId) {
    // 어떤 거래인지 알 수 없다. 상태를 건드리지 않고 라이브러리로 보낸다(확정됐다면 이미 지급되어 있다).
    return NextResponse.redirect(new URL(`/${locale}/library`, request.url), 302);
  }

  const orderNo = await findOrderNoByProviderPaymentId('PADDLE', transactionId);
  if (!orderNo) {
    return NextResponse.redirect(new URL(`/${locale}/library`, request.url), 302);
  }

  const log = orderLogger(orderNo, { provider: 'PADDLE', source: 'REDIRECT' });

  try {
    await markOrderConfirming(orderNo, 'REDIRECT', transactionId);
  } catch (error) {
    // 웹훅이 먼저 도착해 이미 확정된 경우 등. 대기 화면이 실제 상태를 보여주므로 그대로 진행한다.
    log.warn('paddle_return_transition_skipped', {}, error);
  }

  return NextResponse.redirect(
    new URL(`/${locale}/checkout/status/${encodeURIComponent(orderNo)}`, request.url),
    302,
  );
}
