'use client';

import { Button } from '@/components/ui/Button';
import { errorAction, userMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import type { ApiError } from '@/types/api';

export interface ErrorNoticeProps {
  /** `ApiError` 또는 화면 전용 문자열 메시지 */
  error: ApiError | string;
  /** 제공되면 재시도 버튼을 노출한다 */
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/**
 * 오류 메시지 + 액션 (TECH_SPEC 4.1).
 * 코드별 액션: `login` → 로그인 버튼 / `retry` → 재시도 버튼 / `none` → 액션 없음.
 */
export function ErrorNotice({
  error,
  onRetry,
  retryLabel = '다시 시도',
  className,
}: ErrorNoticeProps) {
  const isApiError = typeof error !== 'string';
  const message = isApiError ? (error.message || userMessage(error.code)) : error;
  const action = isApiError ? errorAction(error.code) : 'retry';

  const showLogin = action === 'login';
  const showRetry = action === 'retry' && onRetry !== undefined;

  return (
    <div
      role="alert"
      className={cn(
        'rounded-card border border-danger-border bg-danger-surface p-4 text-sm text-danger',
        className,
      )}
    >
      <p className="font-medium">{message}</p>

      {showLogin || showRetry ? (
        <div className="mt-3 flex gap-2">
          {showLogin ? (
            <a
              href="/api/auth/login"
              className="inline-flex h-8 items-center justify-center rounded-control bg-brand px-3 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
            >
              GitHub으로 로그인
            </a>
          ) : null}
          {showRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default ErrorNotice;
