import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Currency, OrderStatus } from '@/types/domain';

/**
 * 주문 요약 (F2-AC10, F2-AC11).
 *
 * ★상태는 색이 아니라 **문구**로 전달한다. 뱃지 색상은 보조 신호일 뿐이다.
 *
 * ★실패한 주문에는 실패 사유와 함께 "다시 결제하기" 경로를 반드시 노출한다(F2-AC10).
 *   재시도는 기존 주문을 되살리는 것이 아니라 새 주문을 만드는 것이며(EXPIRED/FAILED는 종료 상태),
 *   그 시점의 가격으로 다시 스냅샷된다(F2-AC9).
 */

/** 주문 상태 → 뱃지 색상. 의미는 항상 텍스트로도 함께 표시된다. */
const STATUS_VARIANT: Record<OrderStatus, NonNullable<BadgeProps['variant']>> = {
  PENDING: 'muted',
  CONFIRMING: 'secondary',
  PAID: 'success',
  FAILED: 'destructive',
  EXPIRED: 'muted',
  REFUND_REQUESTED: 'secondary',
  REFUNDED: 'outline',
};

export interface OrderSummaryData {
  orderNo: string;
  status: OrderStatus;
  currency: Currency;
  /** Decimal 직렬화 문자열 */
  amount: string;
  templateTitle: string;
  /** ISO 문자열. 미확정 주문에서는 null */
  paidAt?: string | null;
  failureMessage?: string | null;
  /** CONFIRMING + INCIDENT 상태에서 "최대 24시간" 안내를 띄우기 위한 플래그 (F2-AC11) */
  delayed?: boolean;
}

interface OrderSummaryProps {
  order: OrderSummaryData;
  /** 실패·만료 시 다시 결제할 경로 */
  retryHref?: string;
}

export function OrderSummary({ order, retryHref }: OrderSummaryProps) {
  const t = useTranslations('order');
  const tStatus = useTranslations('order.status');
  const tTemplates = useTranslations('templates');
  const tCheckoutStatus = useTranslations('checkout.status');
  const format = useFormatter();

  const amountText =
    order.currency === 'KRW'
      ? tTemplates('priceKrw', { amount: format.number(Number(order.amount)) })
      : tTemplates('priceUsd', { amount: order.amount });

  const canRetry = order.status === 'FAILED' || order.status === 'EXPIRED';

  return (
    <section aria-labelledby="order-summary-heading" className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="order-summary-heading" className="text-lg font-semibold text-foreground">
          {t('title')}
        </h2>
        <Badge variant={STATUS_VARIANT[order.status]}>{tStatus(order.status)}</Badge>
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="text-sm text-muted-foreground">{t('orderNo')}</dt>
          <dd className="break-all font-mono text-sm text-foreground">{order.orderNo}</dd>
        </div>

        <div className="flex flex-col gap-0.5">
          <dt className="text-sm text-muted-foreground">{t('template')}</dt>
          <dd className="text-sm text-foreground">{order.templateTitle}</dd>
        </div>

        <div className="flex flex-col gap-0.5">
          <dt className="text-sm text-muted-foreground">{t('currency')}</dt>
          <dd className="text-sm text-foreground">{order.currency}</dd>
        </div>

        <div className="flex flex-col gap-0.5">
          <dt className="text-sm text-muted-foreground">{t('amount')}</dt>
          <dd className="text-sm font-semibold text-foreground">{amountText}</dd>
        </div>

        {order.paidAt ? (
          <div className="flex flex-col gap-0.5">
            <dt className="text-sm text-muted-foreground">{t('paidAt')}</dt>
            <dd className="text-sm text-foreground">
              <time dateTime={order.paidAt}>
                {format.dateTime(new Date(order.paidAt), { dateStyle: 'medium', timeStyle: 'short' })}
              </time>
            </dd>
          </div>
        ) : null}

        {order.failureMessage ? (
          <div className="flex flex-col gap-0.5 sm:col-span-2">
            <dt className="text-sm text-muted-foreground">{t('failureReason')}</dt>
            <dd className="text-sm text-destructive">{order.failureMessage}</dd>
          </div>
        ) : null}
      </dl>

      {order.delayed ? (
        <p className="text-sm font-medium text-foreground">{tCheckoutStatus('delayNotice')}</p>
      ) : null}

      {canRetry && retryHref ? (
        <Link href={retryHref} className={cn(buttonVariants({ variant: 'default' }), 'w-fit')}>
          {tCheckoutStatus('retry')}
        </Link>
      ) : null}
    </section>
  );
}
