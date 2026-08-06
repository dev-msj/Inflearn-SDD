/**
 * GET /api/repos — 접근 가능 저장소 목록 페이지 조회 (TECH_SPEC §5)
 *
 * 담당 PRD 수용 기준
 *  - 1-2: sort=pushed&direction=desc로 최근 수정일 내림차순을 서버에서 보장한다.
 *  - 1-4 (엣지): 저장소 0개일 때 화면이 안내할 GitHub App 설치 링크(installUrl)를 함께 내려준다.
 *    (buildInstallUrl은 server-only 모듈이므로 클라이언트가 직접 호출할 수 없다)
 *  - 1-5 (엣지): Link 헤더 기반 hasNext로 순차 로드를 지원한다.
 *
 * accessToken은 세션에서 꺼내 GitHub 호출 인자로만 쓰이며 응답에 포함되지 않는다.
 */
import { NextResponse } from 'next/server';

import { toAppError } from '@/lib/errors';
import { buildInstallUrl } from '@/lib/github/oauth';
import { REPOS_PER_PAGE, listAccessibleRepos } from '@/lib/github/repos';
import { requireSession } from '@/lib/session';
import type { ApiErrorBody, ReposResponse } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 응답 스키마 = ReposResponse + 설치 안내 링크 */
interface ReposRouteResponse extends ReposResponse {
  installUrl: string;
}

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/** 쿼리 파라미터를 숫자로 읽는다. 값이 없거나 숫자가 아니면 기본값을 사용한다. */
function readNumberParam(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: Request): Promise<NextResponse<ReposRouteResponse | ApiErrorBody>> {
  try {
    const session = await requireSession();
    const url = new URL(request.url);

    // 범위 정규화(1 이상, 최대 100)는 listAccessibleRepos가 수행한다.
    const page = readNumberParam(url.searchParams.get('page'), 1);
    const perPage = readNumberParam(url.searchParams.get('perPage'), REPOS_PER_PAGE);

    const result = await listAccessibleRepos(session.accessToken, { page, perPage });

    return NextResponse.json<ReposRouteResponse>(
      { page: result.page, rateLimit: result.rateLimit, installUrl: buildInstallUrl() },
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
