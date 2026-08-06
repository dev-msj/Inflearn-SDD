'use client';

/**
 * LoginGate — 미인증 상태에서 "GitHub으로 로그인" 진입점만 노출
 *
 * 담당 PRD 수용 기준
 *  - 1-1: 로그인하지 않은 상태로 접속하면 로그인 진입점만 노출된다.
 *  - 1-6 (에러): 인증 취소·권한 거부 시 안내 문구를 표시하고 화면 오류 없이 재시도할 수 있다.
 *  - 접근성 1항: 로그인은 앵커 요소이므로 키보드만으로 수행 가능
 *
 * 로그인은 서버 라우트(GET /api/auth/login)로의 이동이므로 링크로 구현한다.
 * 재시도 수단은 아래 로그인 링크 자체다. (TECH_SPEC §6.2 매핑: "LoginGate의 로그인 버튼")
 */
import { Github, LoaderCircle } from 'lucide-react';

import { ErrorNotice } from '@/components/ErrorNotice';
import type { AppErrorCode } from '@/lib/errors';

export interface LoginGateError {
  code: AppErrorCode;
  message?: string;
}

export interface LoginGateProps {
  /** 로그인 진입 경로. 기본값은 GET /api/auth/login */
  loginHref?: string;
  /** 인증 실패·취소 안내. null이면 표시하지 않는다. */
  error?: LoginGateError | null;
  /** 로그인 요청 처리 중 여부 (리다이렉트 대기) */
  isRedirecting?: boolean;
}

export const DEFAULT_LOGIN_HREF = '/api/auth/login';

const LOGIN_LABEL = 'GitHub으로 로그인';
const RETRY_LABEL = 'GitHub으로 다시 로그인';

export function LoginGate({ loginHref = DEFAULT_LOGIN_HREF, error = null, isRedirecting = false }: LoginGateProps) {
  return (
    <section
      aria-labelledby="login-gate-heading"
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-5 rounded-lg border border-line bg-surface px-6 py-10 text-center"
    >
      <h1 id="login-gate-heading" className="text-xl font-bold text-ink">
        GitHub 계정으로 시작하세요
      </h1>
      <p className="max-w-prose text-sm text-ink-muted">
        로그인하면 접근 권한이 있는 저장소 목록을 불러옵니다. 저장소는 읽기 전용으로만 조회하며, 업로드한 문서와 검증
        결과는 어디에도 저장하지 않습니다.
      </p>

      {error ? (
        <ErrorNotice
          code={error.code}
          message={error.message}
          className="text-left"
          retryable={false}
        />
      ) : null}

      <a
        href={loginHref}
        aria-disabled={isRedirecting}
        className="inline-flex items-center gap-2 rounded-md border border-brand bg-brand px-5 py-2.5 text-sm font-semibold text-ink-inverse hover:bg-brand-strong"
      >
        {isRedirecting ? (
          <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
        ) : (
          <Github size={18} aria-hidden="true" />
        )}
        {error ? RETRY_LABEL : LOGIN_LABEL}
      </a>
    </section>
  );
}
