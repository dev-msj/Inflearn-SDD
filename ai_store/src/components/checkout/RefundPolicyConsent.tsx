'use client';

import { useTranslations } from 'next-intl';

/**
 * 환불 규정 고지 + 동의 (F2-AC12).
 *
 * 국내 전자상거래법상 디지털 콘텐츠 청약철회 제한은 **결제 전 고지·동의**가 필수다.
 * 따라서 정책 본문을 접힌 상태로 숨기지 않고 항상 펼쳐서 보여준다.
 *
 * ★동의 여부의 최종 판정은 서버가 한다.
 *   체크박스를 해제한 채 폼을 조작해 보내도 `startCheckout()`이 PolicyNotAgreedError를 던진다.
 *   여기서의 비활성화는 UX 보조다.
 *
 * ★환불 가능 기간(days)은 하드코딩하지 않고 서버(refund.policy.ts의 REFUND_WINDOW_DAYS)에서 주입받는다.
 *   화면 문구와 판정 로직이 서로 다른 숫자를 말하는 상황을 만들지 않기 위함이다.
 */
interface RefundPolicyConsentProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** 환불 가능 기간(일). 서버 상수 REFUND_WINDOW_DAYS를 그대로 전달한다. */
  days: number;
  /** 폼 제출 시 사용할 필드명 */
  name?: string;
  /** 미동의 상태에서 결제를 시도했을 때 사유를 노출할지 */
  showRequiredNotice?: boolean;
}

const CONSENT_INPUT_ID = 'refund-policy-consent';

export function RefundPolicyConsent({
  checked,
  onChange,
  days,
  name = 'policyAgreed',
  showRequiredNotice = false,
}: RefundPolicyConsentProps) {
  const t = useTranslations('refundPolicy');

  return (
    <section
      aria-labelledby="refund-policy-heading"
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
    >
      <h2 id="refund-policy-heading" className="text-base font-semibold text-foreground">
        {t('heading')}
      </h2>

      <p className="text-sm leading-relaxed text-muted-foreground">{t('body', { days })}</p>

      <div className="flex items-start gap-2">
        <input
          id={CONSENT_INPUT_ID}
          type="checkbox"
          name={name}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={showRequiredNotice ? 'refund-policy-required' : undefined}
          className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]"
        />
        <label htmlFor={CONSENT_INPUT_ID} className="text-sm text-foreground">
          {t('consentLabel')}
        </label>
      </div>

      {showRequiredNotice ? (
        <p id="refund-policy-required" role="alert" className="text-sm text-destructive">
          {t('consentRequired')}
        </p>
      ) : null}
    </section>
  );
}
