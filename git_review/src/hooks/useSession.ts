'use client';

/**
 * 세션 조회 · 로그아웃 · 세션 만료 감지 (TECH_SPEC §4 기능1)
 *
 * 담당 PRD 수용 기준
 *  - 1-1: authenticated 값으로 로그인 진입점/대시보드를 가른다.
 *  - 1-7 (에러): 로그아웃 성공 또는 401 응답 시 RESET_ALL로 화면 전체를 초기화한다.
 *
 * /api/session 응답에는 토큰이 포함되지 않으며, 이 훅도 토큰을 다루지 않는다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { type AppError, toAppError } from '@/lib/errors';
import { useAppApi, useAppDispatch, useAppState } from '@/state/AppStateProvider';
import type { LogoutResponse, SessionResponse } from '@/types/api';
import type { GitHubUser } from '@/types/github';

export const SESSION_ENDPOINT = '/api/session';
export const LOGOUT_ENDPOINT = '/api/auth/logout';

export interface UseSessionResult {
  user: GitHubUser | null;
  authenticated: boolean;
  /** 최초 세션 확인이 끝나지 않았는지 여부 */
  isLoading: boolean;
  isLoggingOut: boolean;
  error: AppError | null;
  /** 세션 상태를 다시 조회한다. */
  refresh(): Promise<void>;
  logout(): Promise<void>;
}

export function useSession(): UseSessionResult {
  const { authStatus, user } = useAppState();
  const dispatch = useAppDispatch();
  const api = useAppApi();

  const [error, setError] = useState<AppError | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const hasRequestedRef = useRef(false);

  const refresh = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const session = await api.requestJson<SessionResponse>(SESSION_ENDPOINT);
      if (session.authenticated && session.user) {
        dispatch({ type: 'SET_USER', user: session.user });
      } else {
        dispatch({ type: 'SET_UNAUTHENTICATED' });
      }
    } catch (caught) {
      // 401은 래퍼가 이미 RESET_ALL을 디스패치했다. 그 외 실패도 미인증으로 확정한다.
      dispatch({ type: 'SET_UNAUTHENTICATED' });
      setError(toAppError(caught));
    }
  }, [api, dispatch]);

  // 최초 마운트 시 1회만 세션을 확인한다.
  useEffect(() => {
    if (hasRequestedRef.current) return;
    hasRequestedRef.current = true;
    void refresh();
  }, [refresh]);

  const logout = useCallback(async (): Promise<void> => {
    setIsLoggingOut(true);
    setError(null);
    try {
      await api.requestJson<LogoutResponse>(LOGOUT_ENDPOINT, { method: 'POST' });
    } catch (caught) {
      setError(toAppError(caught));
    } finally {
      // 서버 응답과 무관하게 화면의 계정·저장소·문서·산출물·결과를 모두 제거한다. (수용 기준 1-7)
      dispatch({ type: 'RESET_ALL' });
      setIsLoggingOut(false);
    }
  }, [api, dispatch]);

  return {
    user,
    authenticated: authStatus === 'authenticated',
    isLoading: authStatus === 'unknown',
    isLoggingOut,
    error,
    refresh,
    logout,
  };
}
