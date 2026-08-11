import { requireUser } from '@/lib/auth-guard';
import { jsonError, jsonOk, NO_STORE_HEADERS } from '@/lib/http';
import { listMyLibrary } from '@/server/library/library.service';
import { isAppLocale } from '@/i18n/routing';
import type { LibraryListResponse } from '@/types/api';

/**
 * GET /api/library — 내 라이브러리 목록 (F3-AC1/4).
 *
 * ★응답에 프롬프트 전문(body)이 없다. LibraryListItem 타입에 필드 자체가 존재하지 않는다.
 *
 * ★조회 대상은 항상 세션 사용자 본인의 데이터다.
 *   userId를 요청에서 받지 않으므로 다른 사용자의 라이브러리를 조회할 방법이 없다.
 *
 * ★`no-store`: 구매 목록이 공용 캐시에 남으면 다른 사용자에게 노출될 수 있다.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser();

    // 카테고리명 표기용. 값이 없거나 지원하지 않는 값이면 사용자 계정의 언어를 쓴다.
    const localeParam = new URL(request.url).searchParams.get('locale');
    const locale = isAppLocale(localeParam) ? localeParam : user.locale;

    const items = await listMyLibrary(user.id, locale);

    return jsonOk<LibraryListResponse>({ items }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error, { route: 'library/list' });
  }
}
