import { z } from 'zod';

import { requireUser } from '@/lib/auth-guard';
import { NotFoundError } from '@/lib/errors';
import { jsonError, NO_STORE_HEADERS } from '@/lib/http';
import { getDownloadPayload } from '@/server/library/library.service';

/**
 * GET /api/library/[templateId]/download — 프롬프트 전문 텍스트 파일 (F3-AC3/5/9).
 *
 * ★소유권 게이트 → 최초 다운로드 기록 → 전송 순서를 `getDownloadPayload()`가 모두 담당한다.
 *   이 라우트가 직접 body를 조회하거나 가공하지 않기 때문에,
 *   화면에 표시된 전문과 파일 내용이 **바이트 단위로 동일**하다(트림·개행 변환 없음).
 *
 * ★거부 응답
 *   미구매 → 403 FORBIDDEN(details.reason='NOT_OWNED'), 환불 완료 → 403(reason='REFUNDED'),
 *   미인증 → 401. 어느 경우에도 body는 조회조차 되지 않는다.
 *
 * ★`Cache-Control: no-store`
 *   전문이 CDN·브라우저·프록시 캐시에 남으면 환불 후에도 파일이 재획득될 수 있다.
 *
 * ★파일명은 서버가 `Content-Disposition`으로 정한다. RFC 5987 형식이라 한글 slug도 안전하다.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** templateId는 uuid다. 형식 검증 없이 조회하면 DB 오류(500)가 난다. */
const templateIdSchema = z.string().uuid();

interface RouteContext {
  params: Promise<{ templateId: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { templateId } = await context.params;

  try {
    const user = await requireUser();

    if (!templateIdSchema.safeParse(templateId).success) {
      throw new NotFoundError('Template not found');
    }

    const payload = await getDownloadPayload(user.id, templateId, user.locale);

    return new Response(payload.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(payload.filename)}`,
        ...NO_STORE_HEADERS,
      },
    });
  } catch (error) {
    return jsonError(error, { route: 'library/download', templateId });
  }
}
