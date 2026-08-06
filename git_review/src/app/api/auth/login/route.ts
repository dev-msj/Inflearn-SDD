/**
 * GET /api/auth/login — state 발급 후 GitHub 인가 페이지로 302 (TECH_SPEC §5)
 *
 * state는 암호화 세션 쿠키에 저장하고 콜백에서 대조한다. (CSRF 방지)
 * client_secret은 이 라우트에서 사용하지 않는다. (교환은 callback 라우트 전용)
 */
import { NextResponse } from 'next/server';

import { toAppError } from '@/lib/errors';
import { buildAuthorizeUrl, generateState } from '@/lib/github/oauth';
import { saveSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const state = generateState();
    await saveSession({ oauthState: state });

    return NextResponse.redirect(buildAuthorizeUrl(state), {
      status: 302,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    // 환경변수 누락 등으로 인가 URL을 만들지 못하면 오류 코드와 함께 로그인 화면으로 되돌린다.
    const appError = toAppError(error);
    const fallback = new URL('/', request.url);
    fallback.searchParams.set('error', appError.code);
    return NextResponse.redirect(fallback, { status: 302, headers: NO_STORE_HEADERS });
  }
}
