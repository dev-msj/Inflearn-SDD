'use client';

import { Button } from '@/components/ui/Button';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { toApiError } from '@/lib/api-error';

/**
 * 로그인 전 화면 (AC-1.1, AC-1.3).
 *
 * 활동·분석·생성 영역은 **렌더링 자체를 하지 않는다.** `page.tsx` 가 세션 유무로 분기하고
 * 콜백이 붙인 `?error=` 를 `errorCode` 로 전달한다.
 */

export type LoginErrorCode = 'oauth_denied' | 'oauth_failed' | 'forbidden';

export interface LoginScreenProps {
  errorCode?: LoginErrorCode;
}

const LOGIN_URL = '/api/auth/login';

/** 재시도로 해소될 수 있는 실패 (AC-1.3) */
const OAUTH_FAILURE_MESSAGE = 'GitHub 로그인에 실패했습니다. 다시 시도해 주세요.';

const FEATURES: readonly string[] = [
  'GitHub 공개 활동을 기간별로 모아 봅니다.',
  'AI가 기간의 핵심 작업과 의미를 요약합니다.',
  'LinkedIn·X·블로그 초안을 한 번에 만듭니다.',
];

export function LoginScreen({ errorCode }: LoginScreenProps) {
  const startLogin = () => {
    window.location.assign(LOGIN_URL);
  };

  return (
    <main className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center gap-section px-4 py-16">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Marketing Dashboard</h1>
        <p className="mt-2 text-sm text-ink-muted">
          GitHub 활동을 분석해 마케팅 콘텐츠 초안을 만들어 주는 대시보드입니다.
        </p>
      </div>

      {errorCode !== undefined ? (
        errorCode === 'forbidden' ? (
          <ErrorNotice error={toApiError('FORBIDDEN_USER')} />
        ) : (
          <ErrorNotice error={OAUTH_FAILURE_MESSAGE} onRetry={startLogin} retryLabel="다시 시도" />
        )
      ) : null}

      <ul className="flex flex-col gap-2 text-sm text-ink-muted">
        {FEATURES.map((feature) => (
          <li key={feature} className="flex gap-2">
            <span aria-hidden="true">·</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div>
        <Button onClick={startLogin}>GitHub으로 로그인</Button>
        <p className="mt-3 text-xs text-ink-muted">
          공개 저장소 활동만 조회하며, 저장소 쓰기 권한은 요청하지 않습니다.
        </p>
      </div>
    </main>
  );
}

export default LoginScreen;
