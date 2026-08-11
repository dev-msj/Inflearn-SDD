import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth-guard';
import { orderLogger } from '@/lib/logger';
import { markOrderConfirming } from '@/server/orders/order.service';
import { confirmPayment } from '@/server/payments/toss/toss.client';
import { DEFAULT_LOCALE } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';

/**
 * GET /api/checkout/toss/return — 토스 결제 성공 리디렉션 (F2-AC5/11).
 *
 * ★★이 라우트는 주문을 확정하지 않는다.
 *   호출하는 상태 변경은 `markOrderConfirming(orderNo, 'REDIRECT')` 하나뿐이며,
 *   전이표상 REDIRECT는 PAID를 만들 수 없다. 즉 브라우저가 돌아왔다는 사실만으로는
 *   어떤 코드 경로로도 "결제 완료"가 되지 않는다(F2-AC5).
 *   확정은 웹훅 또는 재조회 배치가 결제사 조회 API로 재확인한 뒤에만 일어난다.
 *
 * ★`confirmPayment()`는 "매입(승인)"이지 "주문 확정"이 아니다.
 *   승인에 실패해도 상태를 실패로 바꾸지 않는다. 결제사 조회 결과로만 판단해야 하며,
 *   미승인 건은 재조회 배치가 승인 대행 또는 만료 처리한다(N3).
 *
 * ★결제사 API를 호출하므로 Node.js 런타임이 필요하다.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function resolveLocale(): Promise<AppLocale> {
  // 결제사 복귀 URL에는 로케일이 없다. 세션 사용자의 언어를 쓰고, 없으면 기본 로케일로 둔다.
  const user = await getCurrentUser();
  return user?.locale ?? DEFAULT_LOCALE;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const orderNo = url.searchParams.get('orderId');
  const paymentKey = url.searchParams.get('paymentKey');
  const amount = Number(url.searchParams.get('amount'));

  const locale = await resolveLocale();

  // 주문번호가 없으면 어떤 주문인지 알 수 없다. 상태를 건드리지 않고 목록으로 돌려보낸다.
  if (!orderNo) {
    return NextResponse.redirect(new URL(`/${locale}`, request.url), 302);
  }

  const log = orderLogger(orderNo, { provider: 'TOSS', source: 'REDIRECT' });

  if (paymentKey && Number.isFinite(amount) && amount > 0) {
    try {
      // 매입만 수행한다. 금액 대조는 확정 시점(confirmOrderPaid)이 orders.amount 기준으로 다시 한다.
      await confirmPayment({ paymentKey, orderNo, amount });
    } catch (error) {
      // 승인 실패는 여기서 확정하지 않는다. 배치가 결제사 조회로 실패/만료를 판정한다.
      log.error('toss_confirm_failed_on_return', {}, error);
    }
  }

  try {
    await markOrderConfirming(orderNo, 'REDIRECT', paymentKey);
  } catch (error) {
    // 이미 웹훅이 먼저 도착해 확정된 경우 등. 대기 화면이 실제 상태를 보여주므로 그대로 진행한다.
    log.warn('toss_return_transition_skipped', {}, error);
  }

  return NextResponse.redirect(
    new URL(`/${locale}/checkout/status/${encodeURIComponent(orderNo)}`, request.url),
    302,
  );
}
