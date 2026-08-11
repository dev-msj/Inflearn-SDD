'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { requestRefundAction, type RequestRefundState } from '@/app/actions/refund.actions';
import { Button } from '@/components/ui/button';
import type { AppLocale } from '@/i18n/routing';
import type { RefundReasonCode } from '@/types/domain';

/**
 * 환불 요청 폼 (F2-AC12).
 *
 * ★"접수"와 "완료"를 구분해 표기한다.
 *   서버의 `requestRefund()`는 상태 REQUESTED로 접수만 하고, 실제 환불 완료는
 *   결제사 처리 결과로 확정된다. 이 화면에서 "환불이 완료되었습니다"라고 쓰면 안 된다.
 *
 * ★자격 판정(7일 이내 + 미열람·미다운로드)은 전적으로 서버가 한다.
 *   폼을 감추는 것만으로는 막을 수 없으므로, 접수 불가 사유(reason)를 받아 안내만 한다.
 */
interface RefundRequestFormProps {
  orderNo: string;
  locale: AppLocale;
  /** 환불 가능 기간(일). 안내 문구의 {days}에 쓰인다. 서버 상수 REFUND_WINDOW_DAYS를 주입한다. */
  days: number;
}

const INITIAL_STATE: RequestRefundState = { status: 'idle' };

const REASON_CODES: readonly RefundReasonCode[] = [
  'NOT_AS_DESCRIBED',
  'MISTAKEN_PURCHASE',
  'OTHER',
];

const REASON_SELECT_ID = 'refund-reason-code';
const REASON_TEXT_ID = 'refund-reason-text';

export function RefundRequestForm({ orderNo, locale, days }: RefundRequestFormProps) {
  const t = useTranslations('refundRequest');
  const tReasonCodes = useTranslations('refundRequest.reasonCodes');
  const tIneligible = useTranslations('refundRequest.ineligible');
  const tErrors = useTranslations('errors.codes');
  const tCommon = useTranslations('common');

  const [state, formAction, isPending] = useActionState(requestRefundAction, INITIAL_STATE);

  if (state.status === 'success') {
    return (
      <section role="status" className="rounded-lg border border-border p-4">
        <p className="text-sm font-medium text-foreground">{t('submitted')}</p>
      </section>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>

      <input type="hidden" name="orderNo" value={orderNo} />
      <input type="hidden" name="locale" value={locale} />

      <div className="flex flex-col gap-1">
        <label htmlFor={REASON_SELECT_ID} className="text-sm font-medium text-foreground">
          {t('reasonCodeLabel')}
          <span className="ml-1 text-muted-foreground">({tCommon('required')})</span>
        </label>
        <select
          id={REASON_SELECT_ID}
          name="reasonCode"
          required
          defaultValue={REASON_CODES[0]}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {REASON_CODES.map((code) => (
            <option key={code} value={code}>
              {tReasonCodes(code)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={REASON_TEXT_ID} className="text-sm font-medium text-foreground">
          {t('reasonTextLabel')}
          <span className="ml-1 text-muted-foreground">({tCommon('optional')})</span>
        </label>
        <textarea
          id={REASON_TEXT_ID}
          name="reasonText"
          rows={3}
          maxLength={1000}
          placeholder={t('reasonTextPlaceholder')}
          className="rounded-md border border-input bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>

      {state.status === 'ineligible' ? (
        <p role="alert" className="text-sm text-destructive">
          {tIneligible(state.reason, { days })}
        </p>
      ) : null}

      {state.status === 'error' ? (
        <p role="alert" className="text-sm text-destructive">
          {tErrors(state.code)}
        </p>
      ) : null}

      <Button type="submit" disabled={isPending} className="w-fit">
        {t('submit')}
      </Button>
    </form>
  );
}
