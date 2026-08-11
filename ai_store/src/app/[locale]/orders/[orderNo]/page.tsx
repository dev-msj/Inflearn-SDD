import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { OrderSummary } from '@/components/orders/OrderSummary';
import { RefundRequestForm } from '@/components/orders/RefundRequestForm';
import { buttonVariants } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/auth-guard';
import { isAppError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { findOrderWithLibraryItem } from '@/server/orders/order.repository';
import { getOrderStatusForUser } from '@/server/orders/order.service';
import { REFUND_WINDOW_DAYS } from '@/server/refunds/refund.policy';
import { getTemplateDetail } from '@/server/templates/template.service';
import { isAppLocale } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';

/**
 * 주문 상세 + 환불 요청 (F2-AC4/10/12).
 *
 * ★타인의 주문은 404다. `getOrderStatusForUser()`가 소유자 검증을 겸하며,
 *   403을 주면 "그 주문번호가 존재한다"는 사실이 노출된다.
 *
 * ★환불 폼은 결제 완료(PAID) 상태에서만 노출한다.
 *   다만 최종 자격 판정(7일 이내 + 미열람·미다운로드)은 전적으로 서버가 하며,
 *   폼을 감추는 것은 UX 보조일 뿐이다(F2-AC12).
 *
 * ★`REFUND_WINDOW_DAYS`는 클라이언트 폼이 server-only 상수를 import 할 수 없어 props로 내려준다.
 */

export const dynamic = 'force-dynamic';

interface OrderDetailPageProps {
  params: Promise<{ locale: string; orderNo: string }>;
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { locale: rawLocale, orderNo } = await params;
  if (!isAppLocale(rawLocale)) notFound();
  const locale: AppLocale = rawLocale;

  const user = await getCurrentUser();
  if (!user) {
    const callbackUrl = `/${locale}/orders/${orderNo}`;
    redirect(`/${locale}/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  let status;
  try {
    status = await getOrderStatusForUser(orderNo, user.id);
  } catch (error) {
    if (isAppError(error) && error.status === 404) notFound();
    throw error;
  }

  // 결제 일시는 상태 폴링 뷰에 없어 주문 행에서 따로 읽는다(전문·결제수단은 읽지 않는다).
  const [tLibrary, order, detail] = await Promise.all([
    getTranslations('library'),
    findOrderWithLibraryItem(orderNo),
    getTemplateDetail(status.templateSlug, locale),
  ]);

  const templateTitle = detail?.template.title ?? status.templateSlug;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">{templateTitle}</h1>

      <OrderSummary
        order={{
          orderNo: status.orderNo,
          status: status.status,
          currency: status.currency,
          amount: status.amount,
          templateTitle,
          paidAt: order?.paidAt ? order.paidAt.toISOString() : null,
          failureMessage: status.failureMessage,
          delayed: status.delayed,
        }}
        // 실패·만료 주문의 재시도는 새 주문 생성이다(F2-AC9/AC10).
        retryHref={`/${locale}/checkout/${status.templateSlug}`}
      />

      {status.status === 'PAID' ? (
        <>
          <Link
            href={`/${locale}/library/${status.templateId}`}
            className={cn(buttonVariants({ variant: 'outline' }), 'w-fit')}
          >
            {tLibrary('openViewer')}
          </Link>

          <RefundRequestForm orderNo={status.orderNo} locale={locale} days={REFUND_WINDOW_DAYS} />
        </>
      ) : null}
    </div>
  );
}
