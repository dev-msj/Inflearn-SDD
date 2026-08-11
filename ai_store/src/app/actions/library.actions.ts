'use server';

import { z } from 'zod';

import { requireUser } from '@/lib/auth-guard';
import { isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { markFirstView } from '@/server/library/library.service';

/**
 * 최초 열람 기록 서버 액션 (F2-AC12 환불 자격 판정의 근거, F3-AC2 진입점).
 *
 * ★전문(body)을 다루지 않는다. 열람 시각만 기록하며 어떤 콘텐츠도 반환하지 않는다.
 *
 * ★왜 서버 컴포넌트가 아니라 액션인가
 *   열람 페이지(RSC) 렌더 중에 기록하면 프리페치·재검증 같은 부수 렌더에서도 시각이 남아
 *   "사용자가 실제로 열어봤다"는 판정이 흔들린다. 화면이 실제로 마운트된 뒤 클라이언트가 1회 호출한다.
 */

/** 성공 여부만 돌려준다. 실패해도 열람 자체를 막지 않는다(기록은 부수 효과). */
export interface MarkFirstViewResult {
  ok: boolean;
}

const templateIdSchema = z.string().uuid();

export async function markFirstViewAction(templateId: string): Promise<MarkFirstViewResult> {
  const parsed = templateIdSchema.safeParse(templateId);
  if (!parsed.success) return { ok: false };

  try {
    const user = await requireUser();
    // markFirstView는 (userId, templateId, status=ACTIVE, firstViewedAt=null) 조건으로만 갱신한다.
    // 소유하지 않은 템플릿 id를 넘겨도 대상 행이 없어 아무 일도 일어나지 않는다.
    await markFirstView(user.id, parsed.data);
    return { ok: true };
  } catch (error) {
    if (isAppError(error)) return { ok: false };

    logger.error('mark_first_view_failed', { templateId: parsed.data }, error);
    return { ok: false };
  }
}
