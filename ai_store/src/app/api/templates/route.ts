import { z } from 'zod';

import { jsonError, jsonOk } from '@/lib/http';
import { listTemplates } from '@/server/templates/template.service';
import { DEFAULT_LOCALE, isAppLocale, LOCALES } from '@/i18n/routing';
import { DEFAULT_PAGE_SIZE, type ListTemplatesResponse } from '@/types/api';

/**
 * GET /api/templates — 목록·검색·카테고리 필터 (F1-AC1/2/3/6).
 *
 * ★응답 타입(TemplateCardView[])에 프롬프트 전문(body)도 미리보기(previewText)도 없다.
 *   레포지토리의 select에 body가 존재하지 않으므로, 실수로 실으려 하면 컴파일이 실패한다(F1-AC6).
 *
 * ★`locale`은 카테고리명 표기용 선택 파라미터다.
 *   이 라우트는 `[locale]` 세그먼트 밖에 있어 경로에서 로케일을 알 수 없고,
 *   미들웨어도 `/api/*`를 처리하지 않는다. 값이 없으면 기본 로케일을 쓴다.
 *   ※통화·결제사 결정에는 어떤 지역 정보도 사용하지 않는다(F2-AC2). 여기서도 IP를 보지 않는다.
 */
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(DEFAULT_PAGE_SIZE),
  locale: z.enum(LOCALES).optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const raw = Object.fromEntries(url.searchParams.entries());

    const query = querySchema.parse({
      q: raw.q || undefined,
      category: raw.category || undefined,
      page: raw.page || undefined,
      pageSize: raw.pageSize || undefined,
      locale: isAppLocale(raw.locale) ? raw.locale : undefined,
    });

    const result = await listTemplates({
      q: query.q,
      categorySlug: query.category,
      page: query.page,
      pageSize: query.pageSize,
      locale: query.locale ?? DEFAULT_LOCALE,
    });

    return jsonOk<ListTemplatesResponse>(result);
  } catch (error) {
    return jsonError(error, { route: 'templates/list' });
  }
}
