import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import {
  exchangeCodeForAccessToken,
  fetchGitHubUser,
  GITHUB_OAUTH_STATE_COOKIE,
} from '@/lib/github';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `page.tsx` 가 `LoginScreen.errorCode` 로 전달하는 값 (AC-1.3) */
type CallbackErrorCode = 'oauth_denied' | 'oauth_failed' | 'forbidden';

function redirectToRoot(origin: string, errorCode?: CallbackErrorCode): Response {
  const target = new URL('/', origin);
  if (errorCode !== undefined) {
    target.searchParams.set('error', errorCode);
  }

  const response = NextResponse.redirect(target, 302);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/**
 * `GET /api/auth/callback` — code 교환 → 프로필 조회 → 화이트리스트 → 세션 저장 (AC-1.2, AC-1.3).
 *
 * **어떤 실패 경로에서도 예외를 던진 채 종료하지 않는다.** 모든 실패는 `302 /?error=...` 로 끝내
 * 사용자가 흰 화면 대신 로그인 화면의 오류 메시지를 보게 한다 (AC-1.3, M8).
 */
export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;

  try {
    const cookieStore = await cookies();
    const expectedState = cookieStore.get(GITHUB_OAUTH_STATE_COOKIE)?.value;
    // 성공·실패와 무관하게 1회용 state 는 즉시 폐기한다
    cookieStore.delete(GITHUB_OAUTH_STATE_COOKIE);

    // ① 사용자가 GitHub 화면에서 권한을 거부한 경우
    if (requestUrl.searchParams.get('error') !== null) {
      return redirectToRoot(origin, 'oauth_denied');
    }

    // ② state 불일치 (CSRF 의심 또는 쿠키 만료)
    const state = requestUrl.searchParams.get('state');
    if (state === null || expectedState === undefined || state !== expectedState) {
      return redirectToRoot(origin, 'oauth_failed');
    }

    const code = requestUrl.searchParams.get('code');
    if (code === null || code === '') {
      return redirectToRoot(origin, 'oauth_failed');
    }

    // ③ code → access token
    const accessToken = await exchangeCodeForAccessToken(code);

    // ④ 프로필 조회
    const profile = await fetchGitHubUser(accessToken);

    // ⑤ 화이트리스트 검사 (Q7). 비어 있으면 전체 허용 = 로컬 전용 모드
    const allowedLogins = env.allowedLogins;
    const isAllowed =
      allowedLogins.length === 0 ||
      allowedLogins.some((login) => login.toLowerCase() === profile.login.toLowerCase());
    if (!isAllowed) {
      return redirectToRoot(origin, 'forbidden');
    }

    // ⑥ 세션 저장 후 대시보드로
    const session = await getSession();
    session.accessToken = accessToken;
    session.user = {
      login: profile.login,
      name: profile.name,
      avatarUrl: profile.avatar_url,
    };
    session.createdAt = Date.now();
    await session.save();

    return redirectToRoot(origin);
  } catch {
    // 토큰 교환·프로필 조회·세션 저장 중 어떤 예외든 로그인 실패로 수렴시킨다
    return redirectToRoot(origin, 'oauth_failed');
  }
}
