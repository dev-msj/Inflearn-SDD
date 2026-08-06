/**
 * POST /api/auth/logout — 세션 쿠키 파기 (TECH_SPEC §5)
 *
 * 담당 PRD 수용 기준
 *  - 1-7 (에러): 서버는 토큰이 담긴 세션 쿠키를 즉시 폐기하고,
 *    클라이언트는 200 응답을 받으면 RESET_ALL로 화면 상태를 전부 비운다.
 *
 * GET을 허용하지 않는다. (링크 프리페치나 외부 이미지 요청으로 세션이 끊기지 않도록)
 */
import { NextResponse } from 'next/server';

import type { LogoutResponse } from '@/types/api';
import { destroySession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse<LogoutResponse>> {
  try {
    await destroySession();
  } catch {
    // 쿠키를 읽지 못하는 상황(환경변수 누락 등)에서도 로그아웃은 성공으로 응답한다.
    // 클라이언트는 이 응답과 무관하게 화면 상태를 초기화한다.
  }

  return NextResponse.json<LogoutResponse>(
    { ok: true },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
