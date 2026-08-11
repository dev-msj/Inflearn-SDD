'use client';

import { RetryError } from '@/components/templates/RetryError';

/**
 * 목록 화면 오류 경계 (F1-AC9).
 *
 * ★Next.js의 error boundary는 반드시 클라이언트 컴포넌트여야 하고 `reset()`을 받는다.
 *   `reset()`은 해당 세그먼트를 다시 렌더해 서버 조회를 재시도한다 = "재시도 수단".
 *
 * ★오류 원문(error.message)을 화면에 표시하지 않는다.
 *   서버 예외 메시지에는 쿼리·경로 같은 내부 정보가 담길 수 있다.
 *   진단은 서버 로그(logger)와 `error.digest`로 한다.
 */
interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function LocaleError({ reset }: ErrorBoundaryProps) {
  return <RetryError scope="list" onRetry={reset} />;
}
