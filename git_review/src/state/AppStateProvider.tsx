'use client';

/**
 * 세션 스코프 전역 상태 Context (TECH_SPEC §2 state/AppStateProvider.tsx)
 *
 * 메모리 전용이다. 브라우저 스토리지에 쓰지 않으므로 새로고침 시 상태가 사라지는 것은
 * 의도된 설계다. (PRD 보안 요구 2항 / TECH_SPEC §9 임의 결정 사항 11)
 *
 * 이 파일은 상태 Context와 함께, 모든 훅이 공유하는 API 요청 래퍼를 제공한다.
 * 래퍼는 401 응답을 감지하면 RESET_ALL을 디스패치해
 * "로그아웃·세션 만료 시 화면 전체 초기화"(수용 기준 1-7)를 한 곳에서 보장한다.
 */
import { createContext, useCallback, useContext, useMemo, useReducer } from 'react';
import type { Dispatch, ReactNode } from 'react';

import { AppError, type AppErrorCode } from '@/lib/errors';
import { INITIAL_APP_STATE, appReducer, type AppAction, type AppState } from '@/state/appReducer';
import type { ApiErrorBody } from '@/types/api';

const AppStateContext = createContext<AppState | null>(null);
const AppDispatchContext = createContext<Dispatch<AppAction> | null>(null);

export interface AppStateProviderProps {
  children: ReactNode;
}

export function AppStateProvider({ children }: AppStateProviderProps) {
  const [state, dispatch] = useReducer(appReducer, INITIAL_APP_STATE);

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>{children}</AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppState {
  const state = useContext(AppStateContext);
  if (state === null) {
    throw new Error('useAppState는 AppStateProvider 내부에서만 사용할 수 있습니다.');
  }
  return state;
}

export function useAppDispatch(): Dispatch<AppAction> {
  const dispatch = useContext(AppDispatchContext);
  if (dispatch === null) {
    throw new Error('useAppDispatch는 AppStateProvider 내부에서만 사용할 수 있습니다.');
  }
  return dispatch;
}

/**
 * 서버가 이미 완성한 안내 문구를 보존하는 AppError를 만든다.
 * ERROR_CATALOG의 자리표시자({resetAtText} 등)는 서버에서 이미 치환되므로
 * 그 결과 문자열을 details.serverMessage에 담아 화면까지 그대로 전달한다.
 */
export function createClientError(code: AppErrorCode, message?: string, cause?: unknown): AppError {
  return new AppError(code, {
    details: message !== undefined && message.length > 0 ? { serverMessage: message } : undefined,
    cause,
  });
}

/** 화면에 표시할 최종 문구. 서버 문구가 있으면 그것을, 없으면 카탈로그 문구를 쓴다. */
export function resolveErrorMessage(error: AppError): string {
  const serverMessage = error.details?.serverMessage;
  return typeof serverMessage === 'string' && serverMessage.length > 0 ? serverMessage : error.userMessage;
}

/** 상태 코드만으로 에러 코드를 추정한다. (응답 본문이 JSON이 아닐 때의 대비책) */
function codeFromStatus(status: number): AppErrorCode {
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'REPO_FORBIDDEN';
  if (status === 404) return 'REPO_NOT_FOUND';
  if (status === 400) return 'INVALID_REQUEST';
  if (status >= 500) return 'GITHUB_UNAVAILABLE';
  return 'UNKNOWN';
}

/** 실패 응답 본문(ApiErrorBody)을 AppError로 변환한다. */
async function toApiError(response: Response): Promise<AppError> {
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>;
    const error = body.error;
    if (error && typeof error.code === 'string') {
      return createClientError(error.code, error.message);
    }
  } catch {
    // 본문이 비었거나 JSON이 아니면 상태 코드로만 판단한다.
  }
  return createClientError(codeFromStatus(response.status));
}

export interface AppApi {
  /** 원본 Response를 반환한다. (NDJSON 스트림 소비용) */
  request(input: string, init?: RequestInit): Promise<Response>;
  /** JSON 본문을 파싱해 반환한다. */
  requestJson<T>(input: string, init?: RequestInit): Promise<T>;
}

/** 앱 공통 fetch 래퍼. 실패는 항상 AppError로 정규화하고 401은 전체 초기화로 이어진다. */
export function useAppApi(): AppApi {
  const dispatch = useAppDispatch();

  const request = useCallback(
    async (input: string, init?: RequestInit): Promise<Response> => {
      let response: Response;
      try {
        response = await fetch(input, {
          cache: 'no-store',
          credentials: 'same-origin',
          ...init,
        });
      } catch (cause) {
        throw createClientError('NETWORK_ERROR', undefined, cause);
      }

      if (!response.ok) {
        const error = await toApiError(response);
        if (response.status === 401) {
          dispatch({ type: 'RESET_ALL' });
        }
        throw error;
      }

      return response;
    },
    [dispatch],
  );

  const requestJson = useCallback(
    async <T,>(input: string, init?: RequestInit): Promise<T> => {
      const response = await request(input, init);
      try {
        return (await response.json()) as T;
      } catch (cause) {
        throw createClientError('UNKNOWN', undefined, cause);
      }
    },
    [request],
  );

  return useMemo(() => ({ request, requestJson }), [request, requestJson]);
}
