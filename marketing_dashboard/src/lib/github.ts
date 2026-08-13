import 'server-only';
import { ApiException } from '@/lib/api-error';
import { GITHUB_EVENTS_MAX_PAGES, GITHUB_EVENTS_PER_PAGE } from '@/lib/constants';
import { env } from '@/lib/env';
import type { ApiErrorCode } from '@/types/api';

/**
 * GitHub REST 호출 전담 모듈 (TECH_SPEC 3. 기능 1 > 1-B).
 *
 * - 공개 저장소 활동만 다룬다 (Q1): scope 는 `read:user`, 수집은 `/users/{login}/events/public`.
 * - 캐싱 레이어를 도입하지 않으므로 모든 호출에 `cache: 'no-store'` 를 고정한다 (PRD 5.1).
 * - 실패는 전부 `classifyGitHubError()` 로 코드화해 `ApiException` 으로 던진다 (AC-1.8).
 */

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';

/** OAuth CSRF 방지용 state 쿠키 (login → callback 에서 대조) */
export const GITHUB_OAUTH_STATE_COOKIE = 'md_oauth_state';
/** state 쿠키 수명 (초) */
export const GITHUB_OAUTH_STATE_MAX_AGE = 600;
/** 요청 scope. 공개 저장소만 조회하므로 `repo` 를 요청하지 않는다 (Q1) */
export const GITHUB_OAUTH_SCOPE = 'read:user';

// ── 타입 ────────────────────────────────────────────────

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
}

/** 이벤트 payload 중 집계에 필요한 필드만 선언한다 */
export interface GitHubEventCommit {
  sha: string;
  message: string;
}

export interface GitHubEventPullRequest {
  number: number;
  title: string;
  html_url: string;
  merged?: boolean;
}

export interface GitHubEventIssue {
  number: number;
  title: string;
  html_url: string;
}

export interface GitHubEventPayload {
  action?: string;
  commits?: GitHubEventCommit[];
  pull_request?: GitHubEventPullRequest;
  issue?: GitHubEventIssue;
}

export interface GitHubEvent {
  id: string;
  type: string | null;
  created_at: string;
  repo: { name: string };
  payload: GitHubEventPayload;
}

// ── 공통 ────────────────────────────────────────────────

function githubHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'marketing-dashboard',
  };
}

/**
 * 응답 상태·헤더로 실패 원인을 `ApiErrorCode` 로 분류한다 (AC-1.8).
 * - 401 → `GITHUB_TOKEN_INVALID`
 * - 403·429 이면서 `x-ratelimit-remaining === '0'` → `GITHUB_RATE_LIMIT`
 * - 그 외 → `GITHUB_ERROR`
 */
export function classifyGitHubError(res: Response): ApiErrorCode {
  if (res.status === 401) return 'GITHUB_TOKEN_INVALID';

  const isRateLimited =
    (res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0';
  if (isRateLimited) return 'GITHUB_RATE_LIMIT';

  return 'GITHUB_ERROR';
}

// ── OAuth ───────────────────────────────────────────────

/** GitHub authorize 페이지 URL (`GET /api/auth/login` 리다이렉트 대상) */
export function buildAuthorizeUrl(state: string): string {
  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  url.searchParams.set('redirect_uri', env.GITHUB_OAUTH_REDIRECT_URI);
  url.searchParams.set('scope', GITHUB_OAUTH_SCOPE);
  url.searchParams.set('state', state);
  return url.toString();
}

interface AccessTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

/**
 * authorization code → access token 교환.
 * 실패 시 예외를 던지고, 콜백 라우트가 이를 `302 /?error=oauth_failed` 로 변환한다 (AC-1.3).
 */
export async function exchangeCodeForAccessToken(code: string): Promise<string> {
  const res = await fetch(GITHUB_ACCESS_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'marketing-dashboard',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: env.GITHUB_OAUTH_REDIRECT_URI,
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new ApiException(classifyGitHubError(res));
  }

  const body = (await res.json()) as AccessTokenResponse;
  if (typeof body.access_token !== 'string' || body.access_token === '') {
    // GitHub 은 교환 실패도 200 으로 응답하고 본문에 error 를 담는다
    throw new ApiException('GITHUB_ERROR', body.error_description ?? 'access token 교환에 실패했습니다.');
  }

  return body.access_token;
}

// ── 조회 ────────────────────────────────────────────────

/** 인증 사용자 프로필. 콜백에서 세션 생성에 사용 (AC-1.2) */
export async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
  const res = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: githubHeaders(accessToken),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new ApiException(classifyGitHubError(res));
  }

  const body = (await res.json()) as Partial<GitHubUser>;
  if (typeof body.login !== 'string' || body.login === '') {
    throw new ApiException('GITHUB_ERROR');
  }

  return {
    login: body.login,
    name: typeof body.name === 'string' ? body.name : null,
    avatar_url: typeof body.avatar_url === 'string' ? body.avatar_url : '',
  };
}

/**
 * 공개 이벤트를 최대 3페이지(=300건) 수집한다 (C2).
 * `since` 이전 이벤트가 나오면 그 페이지까지만 모으고 조기 종료한다.
 *
 * `truncated` 는 **상한 3페이지를 모두 채웠는데도 `since` 이전 이벤트에 닿지 못한** 경우에만 true 다.
 * 즉 기간 내 활동이 더 있을 수 있다는 신호다.
 */
export async function fetchPublicEvents(
  accessToken: string,
  login: string,
  since: Date,
): Promise<{ events: GitHubEvent[]; truncated: boolean }> {
  const sinceMs = since.getTime();
  const events: GitHubEvent[] = [];

  for (let page = 1; page <= GITHUB_EVENTS_MAX_PAGES; page += 1) {
    const url = new URL(`${GITHUB_API_BASE}/users/${encodeURIComponent(login)}/events/public`);
    url.searchParams.set('per_page', String(GITHUB_EVENTS_PER_PAGE));
    url.searchParams.set('page', String(page));

    const res = await fetch(url, {
      headers: githubHeaders(accessToken),
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new ApiException(classifyGitHubError(res));
    }

    const batch = (await res.json()) as unknown;
    if (!Array.isArray(batch) || batch.length === 0) {
      return { events, truncated: false };
    }

    const pageEvents = batch as GitHubEvent[];
    events.push(...pageEvents);

    // 기간 시작점 이전 이벤트를 만났다 = 기간 내 이벤트를 모두 확보했다
    const reachedSince = pageEvents.some((event) => Date.parse(event.created_at) < sinceMs);
    if (reachedSince) {
      return { events, truncated: false };
    }

    // 마지막 페이지(응답이 per_page 미만) = GitHub 이 더 줄 것이 없다
    if (pageEvents.length < GITHUB_EVENTS_PER_PAGE) {
      return { events, truncated: false };
    }
  }

  return { events, truncated: true };
}
