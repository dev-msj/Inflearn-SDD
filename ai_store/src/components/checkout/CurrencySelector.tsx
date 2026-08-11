'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import type { Currency } from '@/types/domain';

/**
 * 결제 통화 선택 (F2-AC1, F2-AC2).
 *
 * ★기본 선택값이 없다. `value`는 처음에 null이며 사용자가 직접 고르기 전까지 결제로 넘어갈 수 없다.
 *   PRD가 "명시적으로 선택"을 요구하기 때문이다.
 *
 * ★IP·Accept-Language·국가 헤더를 참조하는 코드가 이 파일에 없다(Out of Scope: IP 기반 자동 통화 판별).
 *   접속 지역으로 통화를 추천하지도, 정렬 순서를 바꾸지도 않는다.
 *
 * 네이티브 라디오를 쓰는 이유: 화살표 키 이동·라벨 클릭·폼 제출이 모두 브라우저 기본 동작으로 처리되어
 * 키보드 조작 요구(비기능)를 추가 코드 없이 만족한다.
 */

/** 통화별 결제사 안내 문구 키. 사용자가 어느 결제 흐름으로 가는지 미리 알 수 있게 한다. */
const PROVIDER_HINT_KEY: Record<Currency, 'currencyKrwProvider' | 'currencyUsdProvider'> = {
  KRW: 'currencyKrwProvider',
  USD: 'currencyUsdProvider',
};

const LABEL_KEY: Record<Currency, 'currencyKrw' | 'currencyUsd'> = {
  KRW: 'currencyKrw',
  USD: 'currencyUsd',
};

const CURRENCIES: readonly Currency[] = ['KRW', 'USD'];

interface CurrencySelectorProps {
  /** 선택된 통화. 미선택 상태를 null로 표현한다. */
  value: Currency | null;
  onChange: (currency: Currency) => void;
  /** 폼 제출 시 사용할 필드명 */
  name?: string;
  disabled?: boolean;
}

export function CurrencySelector({
  value,
  onChange,
  name = 'currency',
  disabled = false,
}: CurrencySelectorProps) {
  const t = useTranslations('checkout');

  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="text-base font-semibold text-foreground">{t('currencyHeading')}</legend>
      <p className="text-sm text-muted-foreground">{t('currencyHint')}</p>

      <div className="flex flex-col gap-2">
        {CURRENCIES.map((currency) => {
          const inputId = `${name}-${currency}`;
          const isSelected = value === currency;

          return (
            <label
              key={currency}
              htmlFor={inputId}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2',
                isSelected ? 'border-primary bg-accent' : 'border-border bg-background hover:bg-accent',
              )}
            >
              <input
                id={inputId}
                type="radio"
                name={name}
                value={currency}
                checked={isSelected}
                onChange={() => onChange(currency)}
                className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">{t(LABEL_KEY[currency])}</span>
                <span className="text-sm text-muted-foreground">
                  {t(PROVIDER_HINT_KEY[currency])}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
