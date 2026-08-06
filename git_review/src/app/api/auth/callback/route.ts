/**
 * GET /api/auth/callback — code↔token 교환 후 세션 생성 (TECH_SPEC §5, §6.2)
 *
 * 담당 PRD 수용 기준
 *  - 1-1: 교환 성공 시 프로필을 세션에 담아 헤더에 계정명·프로필 이미지를 표시할 수 있게 한다.
 *  - 1-6 (에러): 인증 취소·권한 거부(error=access_denied)면 세션을 만들지 않고
 *    `/?error=AUTH_CANCELLED`로 되돌려 로그인 화면에서 안내 문구와 함께 재시도할 수 있게 한다.
 *
 * 토큰은 암호화 세션 쿠키에만 저장하며 응답 바디·리다이렉트 쿼리에 절대 싣지 않는다.
 * code·state 값도 로그나 리다이렉트 URL에 남기지 않는다.
 */
import { NextResponse } from 'next/server';

import { toAppError, type AppErrorCode } from '@/lib/errors';
import {
  OAUTH_ACCESS_DENIED,
  exchangeCodeForToken,
  toTokenExpiresAt,
  verifyState,
} from '@/lib/github/oauth';
import { fetchAuthenticatedUser } from '@/lib/github/user';
import { createSession, destroySession, getSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/** 홈으로 되돌아가는 302 응답. code가 있으면 화면이 안내 문구를 띄울 수 있도록 쿼리에 담는다. */
function redirectHome(request: Request, code?: AppErrorCode): NextResponse {
  const target = new URL('/', request.url);
  if (code !== undefined) {
    target.searchParams.set('error', code);
  }
  return NextResponse.redirect(target, { status: 302, headers: NO_STORE_HEADERS });
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const oauthError = url.searchParams.get('error');

  // 1) 사용자가 인가 화면에서 취소했거나 권한을 거부한 경우
  if (oauthError !== null) {
    await destroySession();
    return redirectHome(request, oauthError === OAUTH_ACCESS_DENIED ? 'AUTH_CANCELLED' : 'AUTH_EXCHANGE_FAILED');
  }

  try {
    const session = await getSession();
    const storedState = session.oauthState;

    // 2) state 대조 (불일치 시 AUTH_STATE_MISMATCH)
    verifyState(url.searchParams.get('state'), storedState);

    // 3) code ↔ token 교환 (서버 시크릿 사용)
    const token = await exchangeCodeForToken(url.searchParams.get('code') ?? '');

    // 4) 프로필 조회 후 세션 생성 (기존 oauthState는 createSession이 폐기한다)
    const user = await fetchAuthenticatedUser(token.accessToken);
    const tokenExpiresAt = toTokenExpiresAt(token.expiresInSec);

    await createSession({
      accessToken: token.accessToken,
      user,
      ...(token.refreshToken !== undefined ? { refreshToken: token.refreshToken } : {}),
      ...(tokenExpiresAt !== undefined ? { tokenExpiresAt } : {}),
    });

    return redirectHome(request);
  } catch (error) {
    const appError = toAppError(error);
    await destroySession();
    return redirectHome(request, appError.code);
  }
}
