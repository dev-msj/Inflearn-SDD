'use client';

import { initializePaddle } from '@paddle/paddle-js';
import { useEffect, useRef } from 'react';

/**
 * Paddle 오버레이 결제창 실행 (F2-AC2, USD 경로).
 *
 * ★서버가 이미 Paddle 트랜잭션을 만들어 두었고, 여기서는 그 `transactionId`로 오버레이만 연다.
 *   금액·상품 정보를 클라이언트가 다시 구성하지 않으므로 가격 조작 여지가 없다(F2-AC8).
 *
 * ★`clientToken`은 Paddle이 클라이언트 노출을 전제로 발급하는 값이다(NEXT_PUBLIC_PADDLE_CLIENT_TOKEN).
 *   서버 API 키(PADDLE_API_KEY)는 이 컴포넌트에 절대 전달되지 않는다.
 *
 * 렌더 결과가 없다(null). 결제창은 Paddle.js가 document에 직접 띄우고,
 * 대기 안내 문구는 호출부(CheckoutButton)가 표시한다.
 */
interface PaddleCheckoutLauncherProps {
  clientToken: string;
  transactionId: string;
  environment: 'sandbox' | 'production';
  /** 초기화·오픈 실패 시 호출. 호출부가 재시도 안내를 띄운다. */
  onError?: () => void;
}

export function PaddleCheckoutLauncher({
  clientToken,
  transactionId,
  environment,
  onError,
}: PaddleCheckoutLauncherProps) {
  // React StrictMode의 이중 마운트로 결제창이 두 번 열리는 것을 막는다.
  const openedRef = useRef(false);

  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;

    let cancelled = false;

    void (async () => {
      try {
        const paddle = await initializePaddle({ environment, token: clientToken });
        if (cancelled) return;

        if (!paddle) {
          onError?.();
          return;
        }

        paddle.Checkout.open({ transactionId });
      } catch {
        // 오류 원문은 표시하지 않는다. 결제사 내부 메시지가 사용자 화면에 그대로 노출되면 혼란만 준다.
        if (!cancelled) onError?.();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clientToken, environment, onError, transactionId]);

  return null;
}
