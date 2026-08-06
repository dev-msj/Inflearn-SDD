/**
 * 애플리케이션 공통 에러 정의 (TECH_SPEC §3.4, §6)
 *
 * 처리 원칙:
 *  1. 모든 에러는 AppErrorCode로 표현하고, 사용자 문구는 ERROR_CATALOG에서만 관리한다.
 *  2. 서버 예외는 Route Handler 최외곽에서 toAppError()로 변환한다.
 *  3. GitHub 응답 원문·토큰은 사용자 메시지에 절대 포함하지 않는다.
 *
 * 이 모듈은 서버·클라이언트 양쪽에서 사용한다. (토큰을 다루지 않으므로 server-only가 아니다)
 */

export type AppErrorCode =
  // 인증/세션
  | 'AUTH_CANCELLED'
  | 'AUTH_STATE_MISMATCH'
  | 'AUTH_EXCHANGE_FAILED'
  | 'UNAUTHENTICATED'
  | 'SESSION_EXPIRED'
  | 'NO_INSTALLATION'
  // 저장소/GitHub
  | 'REPO_FORBIDDEN'
  | 'REPO_NOT_FOUND'
  | 'REPO_EMPTY'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'GITHUB_UNAVAILABLE'
  | 'TREE_TRUNCATED'
  // 업로드/추출
  | 'UPLOAD_INVALID_EXTENSION'
  | 'UPLOAD_TOO_LARGE'
  | 'UPLOAD_TOO_MANY'
  | 'EXTRACTION_EMPTY'
  // 기타
  | 'INVALID_REQUEST'
  | 'UNKNOWN';

export interface ErrorCatalogEntry {
  httpStatus: number;
  /**
   * 화면에 그대로 노출되는 한국어 문구.
   * `{key}` 형태의 자리표시자는 AppError 생성 시 `details[key]` 값으로 치환된다.
   * details에 값이 없으면 ERROR_MESSAGE_FALLBACKS의 기본값이 사용된다.
   */
  userMessage: string;
  retryable: boolean;
}

/**
 * 코드별 HTTP 상태·사용자 문구·재시도 가능 여부 단일 정의.
 *
 * httpStatus가 200인 코드(NO_INSTALLATION, REPO_EMPTY, TREE_TRUNCATED, EXTRACTION_EMPTY)는
 * "안내용" 코드다. 예외 응답으로 반환되지 않고 화면 안내 문구를 얻는 용도로만 사용한다.
 */
export const ERROR_CATALOG: Record<AppErrorCode, ErrorCatalogEntry> = {
  AUTH_CANCELLED: {
    httpStatus: 401,
    userMessage: '인증이 취소되었습니다. 다시 시도해 주세요',
    retryable: true,
  },
  AUTH_STATE_MISMATCH: {
    httpStatus: 400,
    userMessage: '인증 요청을 확인할 수 없습니다. 처음부터 다시 시도해 주세요',
    retryable: true,
  },
  AUTH_EXCHANGE_FAILED: {
    httpStatus: 502,
    userMessage: 'GitHub 인증에 실패했습니다. 잠시 후 다시 시도해 주세요',
    retryable: true,
  },
  UNAUTHENTICATED: {
    httpStatus: 401,
    userMessage: '로그인이 필요합니다. GitHub으로 로그인해 주세요',
    retryable: true,
  },
  SESSION_EXPIRED: {
    httpStatus: 401,
    userMessage: '세션이 만료되었습니다. 다시 로그인해 주세요',
    retryable: true,
  },
  NO_INSTALLATION: {
    httpStatus: 200,
    userMessage: '검증할 저장소가 없습니다. GitHub App에 저장소 접근을 허용하면 목록에 표시됩니다',
    retryable: false,
  },
  REPO_FORBIDDEN: {
    httpStatus: 403,
    userMessage: '이 저장소를 조회할 권한이 없습니다. 접근 권한을 확인해 주세요',
    retryable: true,
  },
  REPO_NOT_FOUND: {
    httpStatus: 404,
    userMessage: '저장소를 찾을 수 없습니다. 저장소 이름과 접근 권한을 확인해 주세요',
    retryable: false,
  },
  REPO_EMPTY: {
    httpStatus: 200,
    userMessage: '저장소에 파일이 없습니다',
    retryable: false,
  },
  RATE_LIMITED: {
    httpStatus: 403,
    userMessage: 'GitHub 요청 한도를 초과했습니다. {resetAtText} 다시 시도해 주세요',
    retryable: true,
  },
  NETWORK_ERROR: {
    httpStatus: 503,
    userMessage: '네트워크 연결이 불안정합니다. 연결 확인 후 다시 시도해 주세요',
    retryable: true,
  },
  GITHUB_UNAVAILABLE: {
    httpStatus: 502,
    userMessage: 'GitHub 서비스에 일시적인 문제가 있습니다',
    retryable: true,
  },
  TREE_TRUNCATED: {
    httpStatus: 200,
    userMessage: '저장소가 매우 커서 일부 파일만 조회되었습니다. 결과가 실제와 다를 수 있습니다',
    retryable: false,
  },
  UPLOAD_INVALID_EXTENSION: {
    httpStatus: 400,
    userMessage: '마크다운(.md) 파일만 업로드할 수 있습니다: {fileName}',
    retryable: false,
  },
  UPLOAD_TOO_LARGE: {
    httpStatus: 400,
    userMessage: '파일 크기는 최대 1MB까지 지원합니다: {fileName} ({sizeText})',
    retryable: false,
  },
  UPLOAD_TOO_MANY: {
    httpStatus: 400,
    userMessage: '문서는 최대 2개까지 업로드할 수 있습니다',
    retryable: false,
  },
  EXTRACTION_EMPTY: {
    httpStatus: 200,
    userMessage: '기대 산출물을 찾지 못했습니다. 검증할 경로를 직접 추가해 주세요',
    retryable: false,
  },
  INVALID_REQUEST: {
    httpStatus: 400,
    userMessage: '요청 형식이 올바르지 않습니다',
    retryable: false,
  },
  UNKNOWN: {
    httpStatus: 500,
    userMessage: '알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요',
    retryable: true,
  },
};

/** userMessage 자리표시자의 기본값. details에 값이 없을 때 사용한다. */
export const ERROR_MESSAGE_FALLBACKS: Readonly<Record<string, string>> = {
  resetAtText: '잠시 후',
  fileName: '해당 파일',
  sizeText: '크기 초과',
};

const PLACEHOLDER_RE = /\{(\w+)\}/g;

/** 카탈로그 문구의 `{key}` 자리표시자를 details 값으로 치환한다. */
export function formatUserMessage(template: string, details?: Record<string, unknown>): string {
  return template.replace(PLACEHOLDER_RE, (match, key: string) => {
    const value = details?.[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number') return String(value);
    return ERROR_MESSAGE_FALLBACKS[key] ?? match;
  });
}

export interface AppErrorOptions {
  details?: Record<string, unknown>;
  cause?: unknown;
}

/** 애플리케이션 전역 에러. 화면 문구와 HTTP 상태를 코드 하나로 결정한다. */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly httpStatus: number;
  readonly userMessage: string;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(code: AppErrorCode, options?: AppErrorOptions) {
    // 카탈로그에 없는 코드(서버 스트림이 보낸 미지의 값 등)로도 생성될 수 있으므로 폴백한다.
    // 폴백이 없으면 entry가 undefined가 되어 생성자에서 TypeError가 난다.
    const entry = ERROR_CATALOG[code] ?? ERROR_CATALOG.UNKNOWN;
    const userMessage = formatUserMessage(entry.userMessage, options?.details);
    super(`${code}: ${userMessage}`, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = entry.httpStatus;
    this.userMessage = userMessage;
    this.retryable = entry.retryable;
    if (options?.details !== undefined) {
      this.details = options.details;
    }
  }

  /** API 응답 본문(ApiErrorBody)에 넣을 수 있는 안전한 형태로 직렬화한다. (토큰·원문 미포함) */
  toBody(): { error: { code: AppErrorCode; message: string; retryable: boolean } } {
    return {
      error: { code: this.code, message: this.userMessage, retryable: this.retryable },
    };
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** 에러 객체에서 HTTP 상태 코드를 추출한다. (Octokit RequestError는 status 필드를 갖는다) */
function readStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

/** 에러 객체에서 응답 헤더를 추출한다. */
function readHeaders(error: unknown): Record<string, string> {
  if (typeof error !== 'object' || error === null) return {};
  const response = (error as { response?: { headers?: unknown } }).response;
  const headers = response?.headers;
  if (typeof headers !== 'object' || headers === null) return {};
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (value !== undefined && value !== null) normalized[key.toLowerCase()] = String(value);
  }
  return normalized;
}

const NETWORK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

function isNetworkError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { name?: unknown; code?: unknown; message?: unknown };
  if (candidate.name === 'AbortError' || candidate.name === 'TimeoutError') return true;
  if (typeof candidate.code === 'string' && NETWORK_ERROR_CODES.has(candidate.code)) return true;
  if (typeof candidate.message === 'string') {
    const message = candidate.message.toLowerCase();
    if (
      message.includes('fetch failed') ||
      message.includes('network') ||
      message.includes('socket hang up') ||
      message.includes('timeout')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * 임의의 예외를 AppError로 정규화한다. (Octokit 에러 → 코드 매핑 포함)
 *
 * 매핑 규칙:
 *   401                          → UNAUTHENTICATED
 *   403 + x-ratelimit-remaining:0 / 429 → RATE_LIMITED
 *   403                          → REPO_FORBIDDEN
 *   404                          → REPO_NOT_FOUND
 *   409                          → REPO_EMPTY (빈 저장소)
 *   5xx                          → GITHUB_UNAVAILABLE
 *   네트워크/타임아웃 예외          → NETWORK_ERROR
 *   그 외                         → UNKNOWN
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;

  const status = readStatus(error);
  const headers = readHeaders(error);

  if (status !== undefined) {
    if (status === 401) return new AppError('UNAUTHENTICATED', { cause: error });
    if (status === 429) return new AppError('RATE_LIMITED', { cause: error });
    if (status === 403) {
      const remaining = headers['x-ratelimit-remaining'];
      if (remaining === '0') return new AppError('RATE_LIMITED', { cause: error });
      return new AppError('REPO_FORBIDDEN', { cause: error });
    }
    if (status === 404) return new AppError('REPO_NOT_FOUND', { cause: error });
    if (status === 409) return new AppError('REPO_EMPTY', { cause: error });
    if (status >= 500) return new AppError('GITHUB_UNAVAILABLE', { cause: error });
    if (status === 400 || status === 422) return new AppError('INVALID_REQUEST', { cause: error });
  }

  if (isNetworkError(error)) return new AppError('NETWORK_ERROR', { cause: error });

  return new AppError('UNKNOWN', { cause: error });
}
