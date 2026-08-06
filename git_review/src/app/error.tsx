'use client';

/**
 * 렌더 단계 예외의 최종 폴백 화면 (TECH_SPEC §2 app/error.tsx)
 *
 * 어떤 컴포넌트가 렌더 중 예외를 던져도 빈 화면 대신 원인 안내와 재시도 수단을 보여준다.
 * (PRD 기능3 에러 수용 기준의 "화면 오류 없이 재시도" 원칙을 화면 최상단에서도 지킨다)
 *
 * 예외 원문(스택·GitHub 응답)은 노출하지 않고 ERROR_CATALOG 문구만 표시한다.
 */
import { ErrorNotice } from '@/components/ErrorNotice';

export interface AppErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AppErrorBoundary({ reset }: AppErrorBoundaryProps) {
  return (
    <main id="main" className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-12 md:px-6">
      <h1 className="text-xl font-bold text-ink">화면을 표시하지 못했습니다</h1>
      <ErrorNotice code="UNKNOWN" retryable onRetry={reset} retryLabel="화면 다시 시도" />
      <p className="text-sm text-ink-muted">
        문제가 계속되면 페이지를 새로고침해 주세요. 업로드한 문서와 검증 결과는 저장되지 않으므로 다시 업로드해야
        합니다.
      </p>
    </main>
  );
}
