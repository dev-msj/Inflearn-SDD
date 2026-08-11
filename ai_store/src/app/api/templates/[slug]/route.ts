import { TemplateNotFoundError } from '@/lib/errors';
import { jsonError, jsonOk } from '@/lib/http';
import { getTemplateDetail } from '@/server/templates/template.service';
import { DEFAULT_LOCALE, isAppLocale } from '@/i18n/routing';
import type { TemplateDetailResponse } from '@/types/api';

/**
 * GET /api/templates/[slug] — 상세(미리보기) (F1-AC4/6/8).
 *
 * ★응답에 프롬프트 전문(body)이 없다.
 *   반환 타입 TemplatePreviewView에 body 필드 자체가 존재하지 않는다(F1-AC6).
 *   전문이 나가는 유일한 경로는 소유권 게이트를 통과한 라이브러리 다운로드 라우트다.
 *
 * ★판매 중지·삭제된 템플릿도 메타는 반환하되 `isPurchasable=false`로 알린다(F1-AC8).
 *   존재하지 않는 slug만 404 `TEMPLATE_NOT_FOUND`다.
 */
export const dynamic = 'force-dynamic';

interface RouteContext {
  // Next.js 15: params는 Promise다.
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { slug } = await context.params;

  try {
    const localeParam = new URL(request.url).searchParams.get('locale');
    const locale = isAppLocale(localeParam) ? localeParam : DEFAULT_LOCALE;

    const detail = await getTemplateDetail(slug, locale);
    if (!detail) throw new TemplateNotFoundError(slug);

    return jsonOk<TemplateDetailResponse>(detail);
  } catch (error) {
    return jsonError(error, { route: 'templates/detail', slug });
  }
}
