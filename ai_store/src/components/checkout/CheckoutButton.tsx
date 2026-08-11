'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useActionState, useCallback, useEffect, useRef, useState } from 'react';

import { CurrencySelector } from './CurrencySelector';
import { PaddleCheckoutLauncher } from './PaddleCheckoutLauncher';
import { PriceSummary } from './PriceSummary';
import { RefundPolicyConsent } from './RefundPolicyConsent';
import { startCheckoutAction, type StartCheckoutState } from '@/app/actions/checkout.actions';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import type { ClientCheckoutPayload, Currency } from '@/types/domain';

/**
 * 결제 진행 폼 (F2-AC1, F2-AC2, F2-AC7, F2-AC12).
 *
 * 이 컴포넌트가 통화 선택·금액 표시·정책 동의·결제창 실행을 하나의 클라이언트 경계로 묶는다.
 * 세 요소가 서로의 상태에 의존하기 때문이다(통화 → 금액, 통화+동의 → 버튼 활성).
 *
 * ★결제 진행 흐름
 *   1. 폼 제출 → `startCheckoutAction`(서버) → PENDING 주문 생성 + 결제창 payload 반환
 *   2. payload.kind에 따라 토스 결제창(KRW) 또는 Paddle 오버레이(USD)를 연다
 *   3. 결제 완료 시 결제사가 서버의 리디렉션 라우트로 돌려보내고, 그 라우트는 CONFIRMING까지만 전이한다
 *   ※ 클라이언트는 어떤 경우에도 주문을 "결제 완료"로 만들 수 없다(F2-AC5).
 *
 * ★이미 보유한 템플릿(F2-AC7)은 서버가 ALREADY_OWNED로 막고,
 *   화면은 결제창 대신 라이브러리 이동 다이얼로그를 띄운다.
 */

const INITIAL_STATE: StartCheckoutState = { status: 'idle' };

interface CheckoutButtonProps {
  templateSlug: string;
  priceKrw: number;
  /** Decimal 직렬화 문자열 */
  priceUsd: string;
  locale: AppLocale;
  /** 이미 보유 시 이동할 내 라이브러리 경로 */
  libraryHref: string;
  /** 환불 가능 기간(일). 서버 상수 REFUND_WINDOW_DAYS를 주입한다. */
  refundWindowDays: number;
}

export function CheckoutButton({
  templateSlug,
  priceKrw,
  priceUsd,
  locale,
  libraryHref,
  refundWindowDays,
}: CheckoutButtonProps) {
  const t = useTranslations('checkout');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors.codes');

  const [state, formAction, isPending] = useActionState(startCheckoutAction, INITIAL_STATE);
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [policyAgreed, setPolicyAgreed] = useState(false);
  const [ownedDialogOpen, setOwnedDialogOpen] = useState(false);
  const [launchFailed, setLaunchFailed] = useState(false);
  const [paddlePayload, setPaddlePayload] = useState<
    Extract<ClientCheckoutPayload, { kind: 'PADDLE_OVERLAY' }> | null
  >(null);

  // 결제창은 주문 1건당 한 번만 연다. 리렌더로 두 번 열리면 사용자가 같은 주문을 두 번 결제할 수 있다.
  const launchedOrderRef = useRef<string | null>(null);

  const handleLaunchError = useCallback(() => setLaunchFailed(true), []);

  useEffect(() => {
    if (state.status !== 'ready') return;

    const { orderNo, clientPayload } = state.checkout;
    if (launchedOrderRef.current === orderNo) return;
    launchedOrderRef.current = orderNo;

    if (clientPayload.kind === 'PADDLE_OVERLAY') {
      setPaddlePayload(clientPayload);
      return;
    }

    void (async () => {
      try {
        // 결제 SDK는 결제 시작 시점에만 필요하므로 동적으로 불러온다(초기 번들 축소).
        const { ANONYMOUS, loadTossPayments } = await import('@tosspayments/tosspayments-sdk');
        const tossPayments = await loadTossPayments(clientPayload.clientKey);
        const payment = tossPayments.payment({ customerKey: ANONYMOUS });

        await payment.requestPayment({
          method: 'CARD',
          amount: { currency: 'KRW', value: clientPayload.amount },
          orderId: clientPayload.orderId,
          orderName: clientPayload.orderName,
          customerEmail: clientPayload.customerEmail,
          successUrl: clientPayload.successUrl,
          failUrl: clientPayload.failUrl,
        });
      } catch {
        // 사용자가 결제창을 닫은 경우도 여기로 온다. 주문은 PENDING으로 남고 만료 배치가 정리한다.
        handleLaunchError();
        launchedOrderRef.current = null;
      }
    })();
  }, [handleLaunchError, state]);

  useEffect(() => {
    if (state.status === 'error' && state.code === 'ALREADY_OWNED') {
      setOwnedDialogOpen(true);
    }
  }, [state]);

  const isReady = state.status === 'ready';
  const submitDisabled = !currency || !policyAgreed || isPending || isReady;
  const showPolicyNotice = state.status === 'error' && state.code === 'POLICY_NOT_AGREED';
  const inlineErrorCode =
    state.status === 'error' && state.code !== 'ALREADY_OWNED' && state.code !== 'POLICY_NOT_AGREED'
      ? state.code
      : null;

  return (
    <>
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="templateSlug" value={templateSlug} />
        <input type="hidden" name="locale" value={locale} />

        <CurrencySelector value={currency} onChange={setCurrency} disabled={isPending || isReady} />

        <PriceSummary currency={currency} priceKrw={priceKrw} priceUsd={priceUsd} />

        <RefundPolicyConsent
          checked={policyAgreed}
          onChange={setPolicyAgreed}
          days={refundWindowDays}
          showRequiredNotice={showPolicyNotice}
        />

        {/* 왜 눌리지 않는지 텍스트로 알려 준다. 비활성 버튼만 두면 이유를 알 수 없다. */}
        {!currency ? (
          <p className="text-sm text-muted-foreground">{t('currencyNotSelected')}</p>
        ) : null}

        {inlineErrorCode ? (
          <p role="alert" className="text-sm text-destructive">
            {tErrors(inlineErrorCode)}
          </p>
        ) : null}

        {launchFailed ? (
          <p role="alert" className="text-sm text-destructive">
            {tErrors('PROVIDER_API_ERROR')}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={submitDisabled}>
          {isPending || isReady ? t('processing') : t('submit')}
        </Button>
      </form>

      {paddlePayload ? (
        <PaddleCheckoutLauncher
          clientToken={paddlePayload.clientToken}
          transactionId={paddlePayload.transactionId}
          environment={paddlePayload.environment}
          onError={handleLaunchError}
        />
      ) : null}

      <Dialog open={ownedDialogOpen} onOpenChange={setOwnedDialogOpen}>
        <DialogContent closeLabel={tCommon('close')}>
          <DialogHeader>
            <DialogTitle>{t('alreadyOwnedTitle')}</DialogTitle>
            <DialogDescription>{t('alreadyOwnedDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Link href={libraryHref} className={cn(buttonVariants({ variant: 'default' }))}>
              {t('alreadyOwnedAction')}
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
