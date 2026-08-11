import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth-guard';
import { orderLogger } from '@/lib/logger';
import { markOrderFailed } from '@/server/orders/order.service';
import { DEFAULT_LOCALE } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';

/**
 * GET /api/checkout/toss/fail — 토스 결제 실패 리디렉션 (F2-AC10).
 *
 * ★실패 경로에는 지급 코드가 존재하지 않는다.
 *   라이브러리 지급은 `confirmOrderPaid()`에서만 일어나므로,
 *   이 경로를 아무리 호출해도 라이브러리에 항목이 추가될 수 없다.
 *
 * ★상태 머신상 `PENDING → FAILED`는 REDIRECT도 허용한다.
 *   실패는 금전 이동을 만들지 않아 위조되어도 손해가 없고, 사용자에게 즉시 사유를 보여줘야 하기 때문이다.
 *   이미 CONFIRMING/PAID로 진행된 주문은 전이가 거부되며, 그 경우에도 대기 화면이 실제 상태를 보여준다.
 *
 * 실패 사유는 결제사가 준 code/message를 그대로 저장하고, 화면은 "다시 결제하기" 경로를 함께 제공한다.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 결제사가 사유 문구를 주지 않은 경우의 대체 값. */
const FALLBACK_CODE = 'PAYMENT_FAILED';
const FALLBACK_MESSAGE = 'Payment failed';

async function resolveLocale(): Promise<AppLocale> {
  const user = await getCurrentUser();
  return user?.locale ?? DEFAULT_LOCALE;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const orderNo = url.searchParams.get('orderId');
  const code = url.searchParams.get('code') ?? FALLBACK_CODE;
  const message = url.searchParams.get('message') ?? FALLBACK_MESSAGE;

  const locale = await resolveLocale();

  if (!orderNo) {
    return NextResponse.redirect(new URL(`/${locale}`, request.url), 302);
  }

  const log = orderLogger(orderNo, { provider: 'TOSS', source: 'REDIRECT' });

  try {
    await markOrderFailed({ orderNo, code, message, source: 'REDIRECT' });
  } catch (error) {
    // 이미 확정·종료된 주문이면 전이가 거부된다. 상태 화면이 실제 상태를 보여주므로 그대로 진행한다.
    log.warn('toss_fail_transition_skipped', { code }, error);
  }

  // 실패 사유와 재시도 경로는 대기 화면(OrderStatusPoller)이 상태를 읽어 표시한다.
  return NextResponse.redirect(
    new URL(`/${locale}/checkout/status/${encodeURIComponent(orderNo)}`, request.url),
    302,
  );
}
