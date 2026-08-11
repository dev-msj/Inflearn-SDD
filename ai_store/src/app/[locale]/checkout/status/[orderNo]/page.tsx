import { notFound, redirect } from 'next/navigation';

import { OrderStatusPoller } from '@/components/checkout/OrderStatusPoller';
import { getCurrentUser } from '@/lib/auth-guard';
import { isAppError } from '@/lib/errors';
import { getOrderStatusForUser } from '@/server/orders/order.service';
import { isAppLocale } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';

/**
 * "결제 확인 중" 대기 화면 (F2-AC5/10/11).
 *
 * ★이 화면은 주문을 확정하지 않는다.
 *   서버가 이미 확정한 결과를 폴링으로 읽어올 뿐이며, PAID 전이는 웹훅/배치만 만들 수 있다.
 *   사용자가 이 화면을 닫아도 지급 여부는 달라지지 않는다.
 *
 * ★초기 상태를 서버에서 미리 조회해 넘긴다.
 *   폴링 첫 응답을 기다리는 동안 빈 화면이 보이는 것을 막고,
 *   이미 확정된 주문이라면 즉시 라이브러리로 이동시킬 수 있다.
 *
 * ★타인의 주문번호로 접근하면 404다. 403을 주면 주문 존재 여부가 노출된다.
 */

export const dynamic = 'force-dynamic';

interface CheckoutStatusPageProps {
  params: Promise<{ locale: string; orderNo: string }>;
}

export default async function CheckoutStatusPage({ params }: CheckoutStatusPageProps) {
  const { locale: rawLocale, orderNo } = await params;
  if (!isAppLocale(rawLocale)) notFound();
  const locale: AppLocale = rawLocale;

  const user = await getCurrentUser();
  if (!user) {
    const callbackUrl = `/${locale}/checkout/status/${orderNo}`;
    redirect(`/${locale}/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  let initial;
  try {
    initial = await getOrderStatusForUser(orderNo, user.id);
  } catch (error) {
    // OrderNotFoundError(본인 주문 아님 포함)는 404로만 응답한다.
    if (isAppError(error) && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <OrderStatusPoller
        initial={initial}
        libraryHref={`/${locale}/library`}
        // 실패·만료 시 재시도는 기존 주문 재사용이 아니라 새 주문 생성이다(F2-AC9).
        retryHref={`/${locale}/checkout/${initial.templateSlug}`}
      />
    </div>
  );
}
