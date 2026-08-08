/**
 * GET /api/repos — 접근 가능 저장소 목록 페이지 조회 (TECH_SPEC §5)
 *
 * 담당 PRD 수용 기준
 *  - 1-2: sort=pushed&direction=desc로 최근 수정일 내림차순을 서버에서 보장한다.
 *  - 1-5 (엣지): Link 헤더 기반 hasNext로 순차 로드를 지원한다.
 *
 * accessToken은 세션에서 꺼내 GitHub 호출 인자로만 쓰이며 응답에 포함되지 않는다.
 * 토큰에 스코프가 없으므로 GitHub은 공개 저장소만 돌려준다. (OAuth App 읽기 전용 전제)
 */
import { NextResponse } from 'next/server';

import { toAppError } from '@/lib/errors';
import { REPOS_PER_PAGE, listAccessibleRepos } from '@/lib/github/repos';
import { requireSession } from '@/lib/session';
import type { ApiErrorBody, ReposResponse } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/** 쿼리 파라미터를 숫자로 읽는다. 값이 없거나 숫자가 아니면 기본값을 사용한다. */
function readNumberParam(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: Request): Promise<NextResponse<ReposResponse | ApiErrorBody>> {
  try {
    const session = await requireSession();
    const url = new URL(request.url);

    // 범위 정규화(1 이상, 최대 100)는 listAccessibleRepos가 수행한다.
    const page = readNumberParam(url.searchParams.get('page'), 1);
    const perPage = readNumberParam(url.searchParams.get('perPage'), REPOS_PER_PAGE);

    const result = await listAccessibleRepos(session.accessToken, { page, perPage });

    return NextResponse.json<ReposResponse>(
      { page: result.page, rateLimit: result.rateLimit },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const appError = toAppError(error);
    return NextResponse.json<ApiErrorBody>(appError.toBody(), {
      status: appError.httpStatus,
      headers: NO_STORE_HEADERS,
    });
  }
}
