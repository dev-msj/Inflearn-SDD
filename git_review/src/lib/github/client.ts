/**
 * 요청별 Octokit 인스턴스 생성 및 에러 정규화 (TECH_SPEC §4 기능1·3)
 *
 * !! 서버 전용 모듈 !!
 * access token을 인자로 받으므로 클라이언트 번들에 절대 포함되면 안 된다.
 * next.config.ts의 serverExternalPackages에 @octokit/rest를 등록해 이중으로 차단한다.
 *
 * - 인스턴스는 요청마다 새로 만든다. (토큰이 모듈 전역에 남지 않게 하기 위함)
 * - 5xx는 @octokit/plugin-retry가 지수 백오프로 2회 자동 재시도한다.
 * - 모든 호출에 15초 타임아웃을 건다. (TECH_SPEC §7.1 성능 상한 방어)
 */
import 'server-only';

import { Octokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';

import { AppError, toAppError } from '@/lib/errors';
import { createRateLimitError, isRateLimited, parseRateLimit } from '@/lib/github/rateLimit';

/** GitHub 호출 타임아웃 (TECH_SPEC §9 임의 결정 사항 #10) */
export const GITHUB_REQUEST_TIMEOUT_MS = 15_000;

/** 5xx 자동 재시도 횟수 (TECH_SPEC §6.2 GITHUB_UNAVAILABLE) */
export const GITHUB_RETRY_COUNT = 2;

export const GITHUB_USER_AGENT = 'git-review/0.1.0';

const OctokitWithRetry = Octokit.plugin(retry);

/** 타임아웃을 강제하는 fetch 래퍼. AbortSignal.timeout으로 15초 초과 시 중단한다. */
const fetchWithTimeout: typeof fetch = (input, init) => {
  const timeoutSignal = AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  return fetch(input, { ...init, signal });
};

/**
 * 요청 단위 Octokit 인스턴스를 생성한다.
 * 토큰은 이 인스턴스 내부에만 존재하며 반환값 어디에도 노출되지 않는다.
 */
export function createOctokit(accessToken: string): InstanceType<typeof OctokitWithRetry> {
  if (!accessToken) {
    throw new AppError('UNAUTHENTICATED');
  }

  return new OctokitWithRetry({
    auth: accessToken,
    userAgent: GITHUB_USER_AGENT,
    request: { fetch: fetchWithTimeout },
    retry: { doNotRetry: [400, 401, 403, 404, 409, 422] },
    retries: GITHUB_RETRY_COUNT,
  });
}

/** Octokit 예외에서 응답 헤더를 꺼낸다. */
function readErrorHeaders(error: unknown): Record<string, string> {
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

function readErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

/**
 * GitHub 호출 예외를 AppError로 정규화한다.
 * 한도 초과는 초기화 시각을 포함한 RATE_LIMITED로, 그 외는 toAppError() 매핑을 따른다.
 */
export function normalizeGitHubError(error: unknown): AppError {
  const status = readErrorStatus(error);
  const headers = readErrorHeaders(error);

  if (isRateLimited(status, headers)) {
    return createRateLimitError(parseRateLimit(headers), error);
  }

  return toAppError(error);
}

/** GitHub 호출을 감싸 예외를 항상 AppError로 변환한다. */
export async function withGitHubErrorHandling<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw normalizeGitHubError(error);
  }
}
