import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/api-error';
import { env } from '@/lib/env';
import {
  buildAuthorizeUrl,
  GITHUB_OAUTH_STATE_COOKIE,
  GITHUB_OAUTH_STATE_MAX_AGE,
} from '@/lib/github';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/auth/login` — GitHub authorize 로 302 (AC-1.1, AC-1.2).
 *
 * CSRF 방지용 `state` 를 발급해 httpOnly 쿠키에 담고 authorize URL 에도 실어 보낸다.
 * 콜백에서 두 값을 대조한다. scope 는 `read:user` 고정 (Q1: 공개 저장소만).
 */
export async function GET(): Promise<Response> {
  try {
    const state = crypto.randomUUID();
    const response = NextResponse.redirect(buildAuthorizeUrl(state), 302);

    response.cookies.set({
      name: GITHUB_OAUTH_STATE_COOKIE,
      value: state,
      httpOnly: true,
      sameSite: 'lax',
      secure: env.isProduction,
      path: '/',
      maxAge: GITHUB_OAUTH_STATE_MAX_AGE,
    });
    response.headers.set('Cache-Control', 'no-store');

    return response;
  } catch (e) {
    return toErrorResponse(e);
  }
}
