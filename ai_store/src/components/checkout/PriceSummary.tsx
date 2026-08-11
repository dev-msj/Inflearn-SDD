'use client';

import { useFormatter, useTranslations } from 'next-intl';

import type { Currency } from '@/types/domain';

/**
 * 최종 결제 금액 표시 (F2-AC1, F2-AC8).
 *
 * ★환산하지 않는다. 통화별 개별 고정가(D4)이므로 선택한 통화의 저장된 가격을 그대로 보여준다.
 *
 * ★여기 표시된 금액이 곧 주문의 `amount` 스냅샷이 된다.
 *   결제 진행 중 운영자가 가격을 바꿔도 이 화면의 금액으로 결제가 끝난다는 사실을
 *   `amountNotice` 문구로 명시한다(F2-AC8).
 */
interface PriceSummaryProps {
  /** 미선택 상태에서는 금액 대신 선택 안내를 보여준다. */
  currency: Currency | null;
  priceKrw: number;
  /** Decimal 직렬화 문자열 (예: "12.00") */
  priceUsd: string;
}

export function PriceSummary({ currency, priceKrw, priceUsd }: PriceSummaryProps) {
  const t = useTranslations('checkout');
  const tTemplates = useTranslations('templates');
  const format = useFormatter();

  const amountText =
    currency === 'KRW'
      ? tTemplates('priceKrw', { amount: format.number(priceKrw) })
      : currency === 'USD'
        ? tTemplates('priceUsd', { amount: priceUsd })
        : null;

  return (
    <section aria-labelledby="price-summary-heading" className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <h2 id="price-summary-heading" className="text-base font-semibold text-foreground">
        {t('amountHeading')}
      </h2>

      {/* 통화 선택에 따라 값이 바뀌므로 live region으로 변경을 알린다. */}
      <p aria-live="polite" className="text-2xl font-bold text-foreground">
        {amountText ?? <span className="text-base font-normal text-muted-foreground">{t('currencyNotSelected')}</span>}
      </p>

      <p className="text-sm text-muted-foreground">{t('amountNotice')}</p>
    </section>
  );
}
