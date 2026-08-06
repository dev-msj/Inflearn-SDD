/**
 * GitHub 요청 한도(rate limit) 파싱 및 초과 판정 (TECH_SPEC §6.2)
 *
 * 응답 헤더만 다루며 access token을 취급하지 않는다.
 * 안내 문구에 사용할 초기화 시각은 한국 시각(Asia/Seoul) HH:mm으로 포맷한다.
 */
import { AppError } from '@/lib/errors';
import type { RateLimitInfo } from '@/types/github';

export const RATE_LIMIT_HEADER = {
  limit: 'x-ratelimit-limit',
  remaining: 'x-ratelimit-remaining',
  reset: 'x-ratelimit-reset',
} as const;

/** 한도 표시 시각의 기준 시간대 */
export const RATE_LIMIT_TIME_ZONE = 'Asia/Seoul';

/**
 * 헤더가 없어 한도를 알 수 없을 때 사용하는 값.
 * 음수는 "알 수 없음"을 의미하며 초과 판정 대상에서 제외된다.
 */
export const UNKNOWN_RATE_LIMIT: RateLimitInfo = {
  limit: -1,
  remaining: -1,
  resetAt: new Date(0).toISOString(),
};

/** Octokit ResponseHeaders, fetch Headers, 평범한 객체를 모두 받는다. */
export type RateLimitHeaderSource =
  | Headers
  | Record<string, string | number | undefined>
  | undefined
  | null;

function readHeader(source: RateLimitHeaderSource, name: string): string | undefined {
  if (!source) return undefined;
  if (typeof Headers !== 'undefined' && source instanceof Headers) {
    return source.get(name) ?? undefined;
  }
  const record = source as Record<string, string | number | undefined>;
  const direct = record[name] ?? record[name.toLowerCase()];
  if (direct !== undefined && direct !== null) return String(direct);
  for (const [key, value] of Object.entries(record)) {
    if (key.toLowerCase() === name && value !== undefined && value !== null) return String(value);
  }
  return undefined;
}

function toInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** 응답 헤더에서 잔여 한도를 파싱한다. 필수 헤더가 없으면 null. */
export function parseRateLimit(headers: RateLimitHeaderSource): RateLimitInfo | null {
  const limit = toInt(readHeader(headers, RATE_LIMIT_HEADER.limit));
  const remaining = toInt(readHeader(headers, RATE_LIMIT_HEADER.remaining));
  const resetEpochSec = toInt(readHeader(headers, RATE_LIMIT_HEADER.reset));

  if (limit === undefined || remaining === undefined || resetEpochSec === undefined) {
    return null;
  }

  return {
    limit,
    remaining,
    resetAt: new Date(resetEpochSec * 1000).toISOString(),
  };
}

/** 헤더 파싱 결과가 없으면 UNKNOWN_RATE_LIMIT을 돌려준다. (응답 스키마상 null을 허용하지 않는 곳에서 사용) */
export function parseRateLimitOrUnknown(headers: RateLimitHeaderSource): RateLimitInfo {
  return parseRateLimit(headers) ?? UNKNOWN_RATE_LIMIT;
}

/** 잔여 한도 소진 여부. remaining이 음수(알 수 없음)면 false. */
export function isRateLimitExceeded(info: RateLimitInfo | null): boolean {
  if (!info) return false;
  return info.remaining >= 0 && info.remaining === 0;
}

/**
 * 응답이 "요청 한도 초과"인지 판정한다.
 * GitHub은 한도 초과를 403 또는 429로 응답하며, 이때 x-ratelimit-remaining이 0이다.
 */
export function isRateLimited(status: number | undefined, headers: RateLimitHeaderSource): boolean {
  if (status === 429) return true;
  if (status !== 403) return false;
  return readHeader(headers, RATE_LIMIT_HEADER.remaining) === '0';
}

/** 한도 초기화 시각을 안내 문구용 문자열("14:30 이후")로 포맷한다. */
export function formatResetAtText(resetAt: string | undefined): string | undefined {
  if (!resetAt) return undefined;
  const time = Date.parse(resetAt);
  if (Number.isNaN(time) || time <= 0) return undefined;

  const formatted = new Intl.DateTimeFormat('ko-KR', {
    timeZone: RATE_LIMIT_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(time));

  return `${formatted} 이후`;
}

/** RATE_LIMITED AppError를 초기화 시각 안내와 함께 생성한다. */
export function createRateLimitError(info: RateLimitInfo | null, cause?: unknown): AppError {
  const resetAtText = formatResetAtText(info?.resetAt);
  return new AppError('RATE_LIMITED', {
    details: {
      resetAt: info?.resetAt,
      resetAtText,
      limit: info?.limit,
      remaining: info?.remaining,
    },
    cause,
  });
}
