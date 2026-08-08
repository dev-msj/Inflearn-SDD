/**
 * OAuth App 인증 코드 흐름 (TECH_SPEC §4 기능1 "OAuth 흐름")
 *
 * !! 서버 전용 모듈 !!
 * client_secret과 code↔token 교환을 다루므로 브라우저에서 호출할 수 없다.
 *
 * scope 파라미터를 보내지 않는다(= 스코프 없는 사용자 토큰).
 * OAuth App의 `repo`/`public_repo` 스코프는 읽기와 쓰기가 묶여 있어,
 * 하나라도 요청하면 PRD 보안 요구 3항("읽기 목적 이외의 저장소 변경은 일어나지 않는다")을
 * 기술적으로 보장할 수 없다. 스코프를 비우면 공개 저장소의 공개 데이터만 읽을 수 있으므로
 * 읽기 전용이 구조적으로 강제된다. 그 대가로 비공개 저장소는 검증 대상에서 제외된다.
 */
import 'server-only';

import { randomBytes, timingSafeEqual } from 'node:crypto';

import { buildAppUrl, getEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';

export const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
export const GITHUB_ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';

/** OAuth App 설정의 Authorization callback URL과 반드시 일치해야 하는 경로 */
export const OAUTH_CALLBACK_PATH = '/api/auth/callback';

/** state 바이트 길이 (hex 32자) */
export const OAUTH_STATE_BYTES = 16;

/** 토큰 교환 요청 타임아웃 */
export const OAUTH_REQUEST_TIMEOUT_MS = 15_000;

/** GitHub이 인가 취소 시 돌려주는 error 코드 */
export const OAUTH_ACCESS_DENIED = 'access_denied';

/** redirect_uri (인가 요청과 토큰 교환에서 동일한 값을 사용해야 한다) */
export function buildRedirectUri(): string {
  return buildAppUrl(OAUTH_CALLBACK_PATH);
}

/** CSRF 방지용 state 생성 */
export function generateState(): string {
  return randomBytes(OAUTH_STATE_BYTES).toString('hex');
}

/**
 * 인가 URL 생성.
 * scope 파라미터를 의도적으로 생략한다. (모듈 상단 주석의 읽기 전용 근거 참조)
 */
export function buildAuthorizeUrl(state: string): string {
  const env = getEnv();
  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set('client_id', env.GITHUB_OAUTH_CLIENT_ID);
  url.searchParams.set('redirect_uri', buildRedirectUri());
  url.searchParams.set('state', state);
  return url.toString();
}

/** state 비교. 불일치 시 AUTH_STATE_MISMATCH. 타이밍 공격 방지를 위해 상수 시간 비교를 사용한다. */
export function verifyState(received: string | null, stored: string | undefined): void {
  if (!received || !stored) {
    throw new AppError('AUTH_STATE_MISMATCH');
  }

  const receivedBuffer = Buffer.from(received, 'utf8');
  const storedBuffer = Buffer.from(stored, 'utf8');

  if (receivedBuffer.length !== storedBuffer.length || !timingSafeEqual(receivedBuffer, storedBuffer)) {
    throw new AppError('AUTH_STATE_MISMATCH');
  }
}

export interface TokenExchangeResult {
  accessToken: string;
  refreshToken?: string;
  expiresInSec?: number;
}

interface GitHubTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

/**
 * 서버에서만 실행. client_secret이 필요하므로 브라우저에서 호출 불가.
 * 실패(네트워크·error 필드·access_token 부재)는 모두 AUTH_EXCHANGE_FAILED로 정규화한다.
 * code와 secret은 예외 메시지·로그에 절대 포함하지 않는다.
 */
export async function exchangeCodeForToken(code: string): Promise<TokenExchangeResult> {
  const env = getEnv();

  if (!code) {
    throw new AppError('AUTH_EXCHANGE_FAILED');
  }

  let payload: GitHubTokenResponse;
  try {
    const response = await fetch(GITHUB_ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: env.GITHUB_OAUTH_CLIENT_ID,
        client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
        code,
        redirect_uri: buildRedirectUri(),
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new AppError('AUTH_EXCHANGE_FAILED', { details: { status: response.status } });
    }

    payload = (await response.json()) as GitHubTokenResponse;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('AUTH_EXCHANGE_FAILED', { cause: error });
  }

  if (payload.error || !payload.access_token) {
    throw new AppError('AUTH_EXCHANGE_FAILED', { details: { reason: payload.error ?? 'no_access_token' } });
  }

  const result: TokenExchangeResult = { accessToken: payload.access_token };
  if (payload.refresh_token) result.refreshToken = payload.refresh_token;
  if (typeof payload.expires_in === 'number') result.expiresInSec = payload.expires_in;

  return result;
}

/** 토큰 만료 시각(ISO8601) 계산. expires_in이 없으면 undefined. */
export function toTokenExpiresAt(expiresInSec: number | undefined, now: Date = new Date()): string | undefined {
  if (typeof expiresInSec !== 'number' || !Number.isFinite(expiresInSec)) return undefined;
  return new Date(now.getTime() + expiresInSec * 1000).toISOString();
}
