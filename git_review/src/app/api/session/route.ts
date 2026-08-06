/**
 * GET /api/session — 로그인 여부와 프로필만 반환 (TECH_SPEC §5)
 *
 * 담당 PRD 수용 기준
 *  - 1-1: 로그인 상태에 따라 로그인 진입점/대시보드를 가르는 단일 판단 근거
 *  - 1-7 (에러): 토큰이 만료되었으면 세션을 파기하고 미인증으로 응답한다.
 *
 * !! accessToken은 어떤 경우에도 응답에 포함하지 않는다. (TECH_SPEC §5 보안 규칙 1항)
 *    GitHubUser(login/name/avatarUrl)만 노출한다.
 */
import { NextResponse } from 'next/server';

import { getSession, isAuthenticated, isSessionExpired } from '@/lib/session';
import type { SessionResponse } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UNAUTHENTICATED_BODY: SessionResponse = { authenticated: false, user: null };

const RESPONSE_INIT = { status: 200, headers: { 'Cache-Control': 'no-store' } } as const;

export async function GET(): Promise<NextResponse<SessionResponse>> {
  try {
    const session = await getSession();

    if (!isAuthenticated(session)) {
      return NextResponse.json<SessionResponse>(UNAUTHENTICATED_BODY, RESPONSE_INIT);
    }

    if (isSessionExpired(session)) {
      session.destroy();
      return NextResponse.json<SessionResponse>(UNAUTHENTICATED_BODY, RESPONSE_INIT);
    }

    return NextResponse.json<SessionResponse>(
      {
        authenticated: true,
        // 세션의 다른 필드(accessToken 등)가 섞이지 않도록 필요한 3개 필드만 재구성한다.
        user: {
          login: session.user.login,
          name: session.user.name,
          avatarUrl: session.user.avatarUrl,
        },
      },
      RESPONSE_INIT,
    );
  } catch {
    // 쿠키 복호화 실패·환경변수 누락 등은 "미인증"으로 취급한다. (원인은 화면에 노출하지 않는다)
    return NextResponse.json<SessionResponse>(UNAUTHENTICATED_BODY, RESPONSE_INIT);
  }
}
