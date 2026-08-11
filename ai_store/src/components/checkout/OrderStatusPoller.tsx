'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { OrderStatusView } from '@/types/domain';

/**
 * "결제 확인 중" 대기 화면 (F2-AC5, F2-AC10, F2-AC11).
 *
 * ★확정은 이 화면이 하지 않는다.
 *   폴링은 서버가 이미 확정한 결과를 읽어올 뿐이고, PAID 전이는 웹훅/배치만 만들 수 있다.
 *   따라서 사용자가 이 화면을 닫아도 지급 여부는 달라지지 않는다.
 *
 * ★폴링 주기는 서버가 응답에 실어 주는 `pollAfterMs`를 그대로 따른다.
 *   종료 상태(PAID/FAILED/EXPIRED/REFUNDED 등)에서는 서버가 0을 주며, 그러면 폴링을 멈춘다.
 *   주기를 클라이언트에 고정하면 부하 상황에서 서버가 속도를 조절할 방법이 없다.
 *
 * ★확정이 지연되면(`delayed`) "최대 24시간 내 처리" 안내를 띄운다(F2-AC11).
 */
interface OrderStatusPollerProps {
  /** 서버 컴포넌트가 첫 렌더에 이미 조회한 상태. 화면이 빈 채로 시작하지 않게 한다. */
  initial: OrderStatusView;
  /** 확정 시 이동할 내 라이브러리 경로 */
  libraryHref: string;
  /** 실패·만료 시 다시 결제할 경로 */
  retryHref: string;
}

export function OrderStatusPoller({ initial, libraryHref, retryHref }: OrderStatusPollerProps) {
  const t = useTranslations('checkout.status');
  const router = useRouter();

  const [status, setStatus] = useState<OrderStatusView>(initial);
  // 폴링 실패 시 재시도를 유발하는 카운터. 상태가 그대로면 effect가 다시 돌지 않기 때문이다.
  const [retryTick, setRetryTick] = useState(0);

  const poll = useCallback(async (orderNo: string, signal: AbortSignal) => {
    const response = await fetch(`/api/orders/${encodeURIComponent(orderNo)}`, {
      signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`order status request failed: ${response.status}`);
    return (await response.json()) as OrderStatusView;
  }, []);

  useEffect(() => {
    if (status.pollAfterMs <= 0) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      void poll(status.orderNo, controller.signal)
        .then(setStatus)
        .catch(() => {
          // 일시적 네트워크 오류. 화면 상태는 유지하고 같은 주기로 다시 시도한다.
          if (!controller.signal.aborted) setRetryTick((tick) => tick + 1);
        });
    }, status.pollAfterMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [poll, retryTick, status]);

  useEffect(() => {
    if (status.status !== 'PAID') return;
    // 확정되면 대기 화면을 히스토리에 남기지 않고 라이브러리로 넘긴다.
    router.replace(libraryHref);
  }, [libraryHref, router, status.status]);

  const isWaiting = status.status === 'PENDING' || status.status === 'CONFIRMING';
  const isFailed = status.status === 'FAILED';
  const isExpired = status.status === 'EXPIRED';

  const headline = isWaiting
    ? t('title')
    : status.status === 'PAID'
      ? t('paid')
      : isExpired
        ? t('expired')
        : t('failed');

  return (
    <section className="flex flex-col items-center gap-4 rounded-lg border border-border px-4 py-10 text-center">
      {isWaiting ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" /> : null}

      {/* 상태 변화는 화면 갱신 없이 일어나므로 live region으로 반드시 안내한다. */}
      <div aria-live="polite" aria-label={t('liveRegionLabel')} className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-foreground">{headline}</h1>

        {isWaiting ? <p className="text-sm text-muted-foreground">{t('description')}</p> : null}

        {status.delayed ? (
          <p className="text-sm font-medium text-foreground">{t('delayNotice')}</p>
        ) : null}

        {isFailed && status.failureMessage ? (
          <p className="text-sm text-destructive">{status.failureMessage}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {status.status === 'PAID' ? (
          <Link href={libraryHref} className={cn(buttonVariants({ variant: 'default' }))}>
            {t('goLibrary')}
          </Link>
        ) : null}

        {isFailed || isExpired ? (
          <Link href={retryHref} className={cn(buttonVariants({ variant: 'default' }))}>
            {t('retry')}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
