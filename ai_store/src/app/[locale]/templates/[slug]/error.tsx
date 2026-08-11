'use client';

import { RetryError } from '@/components/templates/RetryError';

/**
 * 상세 화면 오류 경계 (F1-AC9).
 *
 * 목록 경계와 파일이 분리된 이유는 안내 문구가 다르기 때문이다.
 * 상세는 "템플릿 정보를 불러오지 못했습니다"(scope='detail')를 보여준다.
 *
 * ★`notFound()`로 던져진 404는 이 경계가 아니라 not-found.tsx가 처리한다.
 *   따라서 여기 도달하는 것은 조회 실패 같은 일시적 오류이며, 재시도가 의미 있다.
 */
interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function TemplateDetailError({ reset }: ErrorBoundaryProps) {
  return <RetryError scope="detail" onRetry={reset} />;
}
