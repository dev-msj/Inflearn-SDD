import type { ApiError, ApiErrorCode, ApiErrorResponse } from '@/types/api';

/**
 * 오류 코드 → HTTP 상태·사용자 메시지·액션 매핑 (TECH_SPEC 4.1).
 * 서버(Route Handler)와 클라이언트(ErrorNotice)가 함께 사용하므로 server-only 가 아니다.
 */

/** 오류 알림에서 사용자에게 제시할 액션 */
export type ApiErrorAction = 'login' | 'retry' | 'none';

interface ApiErrorSpec {
  status: number;
  message: string;
  retryable: boolean;
  action: ApiErrorAction;
}

const ERROR_SPECS: Record<ApiErrorCode, ApiErrorSpec> = {
  UNAUTHORIZED: {
    status: 401,
    message: '로그인이 필요합니다.',
    retryable: false,
    action: 'login',
  },
  FORBIDDEN_USER: {
    status: 403,
    message: '이 계정은 접근이 허용되지 않았습니다.',
    retryable: false,
    action: 'none',
  },
  INVALID_REQUEST: {
    status: 400,
    message: '요청이 올바르지 않습니다.',
    retryable: true,
    action: 'retry',
  },
  GITHUB_TOKEN_INVALID: {
    status: 401,
    message: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
    retryable: false,
    action: 'login',
  },
  GITHUB_RATE_LIMIT: {
    status: 429,
    message: 'GitHub API 호출 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.',
    retryable: true,
    action: 'retry',
  },
  GITHUB_ERROR: {
    status: 502,
    message: '활동 데이터를 불러오지 못했습니다.',
    retryable: true,
    action: 'retry',
  },
  AI_TIMEOUT: {
    status: 504,
    message: '분석에 시간이 너무 오래 걸립니다. 기간을 줄이거나 다시 시도해 주세요.',
    retryable: true,
    action: 'retry',
  },
  AI_ERROR: {
    status: 502,
    message: 'AI 분석에 실패했습니다.',
    retryable: true,
    action: 'retry',
  },
  INTERNAL: {
    status: 500,
    message: '알 수 없는 오류가 발생했습니다.',
    retryable: true,
    action: 'retry',
  },
};

/** Route Handler 내부에서 던지는 도메인 예외 */
export class ApiException extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message?: string) {
    super(message ?? ERROR_SPECS[code].message);
    this.name = 'ApiException';
    this.code = code;
  }
}

/** 4.1 표의 한국어 사용자 메시지 */
export function userMessage(code: ApiErrorCode): string {
  return ERROR_SPECS[code].message;
}

/** 코드별 HTTP 상태 */
export function httpStatus(code: ApiErrorCode): number {
  return ERROR_SPECS[code].status;
}

/** 재시도로 해소될 수 있는 오류인지 */
export function isRetryable(code: ApiErrorCode): boolean {
  return ERROR_SPECS[code].retryable;
}

/** 오류 알림이 제시할 액션 (로그인 / 재시도 / 없음) */
export function errorAction(code: ApiErrorCode): ApiErrorAction {
  return ERROR_SPECS[code].action;
}

/** 코드로 `ApiError` 본문을 만든다. `message` 를 주면 기본 메시지를 대체 */
export function toApiError(code: ApiErrorCode, message?: string): ApiError {
  const spec = ERROR_SPECS[code];
  return { code, message: message ?? spec.message, retryable: spec.retryable };
}

/** 임의의 예외를 `ApiError` 로 정규화. 알 수 없는 예외는 `INTERNAL` */
export function normalizeError(e: unknown): ApiError {
  if (e instanceof ApiException) {
    return toApiError(e.code, e.message);
  }
  return toApiError('INTERNAL');
}

/**
 * 항상 `{ error: ApiError }` JSON 을 반환한다.
 * 모든 Route Handler 를 `try { ... } catch (e) { return toErrorResponse(e) }` 로 감싸
 * 처리되지 않은 예외로 인한 흰 화면을 0건으로 만든다 (M8).
 */
export function toErrorResponse(e: unknown): Response {
  const error = normalizeError(e);
  const body: ApiErrorResponse = { error };
  return new Response(JSON.stringify(body), {
    status: httpStatus(error.code),
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
