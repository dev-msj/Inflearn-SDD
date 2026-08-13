import { toErrorResponse } from '@/lib/api-error';
import { destroySession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/auth/logout` — 세션 쿠키 파기 후 `204` (AC-1.9).
 *
 * 클라이언트(`Header.tsx`)가 응답을 받은 뒤 `clearSnapshot()` 으로 로컬 스냅샷을 지우고
 * 전체 페이지 이동으로 화면의 활동·분석·콘텐츠 상태까지 폐기한다.
 */
export async function POST(): Promise<Response> {
  try {
    await destroySession();
    return new Response(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
