import 'server-only';

import { db } from '@/lib/db';
import { AccessDeniedError } from '@/lib/errors';
import type { AccessDenialReason, LibraryItemStatus } from '@/types/domain';

/**
 * 전문 접근의 단일 게이트 (F1-AC8, F3-AC5, F3-AC9).
 *
 * ★프롬프트 전문(templates.body)을 읽는 **모든** 경로가 반드시 이 함수를 먼저 통과한다.
 *   - 열람 페이지, 다운로드 라우트, 복사 대상 데이터가 전부 동일한 판정을 쓴다.
 *   - 게이트를 통과하지 못하면 body를 조회조차 하지 않으므로, 응답에 원문이 섞일 여지가 없다.
 *
 * 판매 중지·삭제(soft delete) 여부는 여기서 보지 않는다.
 * F1-AC8이 "이미 구매한 사용자는 계속 열람할 수 있다"를 요구하기 때문이다.
 */

/** AccessDenialReason은 `@/types/domain`에 선언되어 있고 여기서는 re-export만 한다. */
export type { AccessDenialReason };

export interface LibraryItemWithOrder {
  id: string;
  userId: string;
  templateId: string;
  orderId: string;
  status: LibraryItemStatus;
  grantedAt: Date;
  firstViewedAt: Date | null;
  firstDownloadedAt: Date | null;
  orderNo: string;
}

/**
 * 소유권 검증.
 *  - 소유 기록 없음  → AccessDeniedError('NOT_OWNED')   → 화면은 템플릿 상세로 안내
 *  - status REVOKED → AccessDeniedError('REFUNDED')    → "환불 처리된 템플릿입니다" 안내
 * 세션 없음(NOT_AUTHENTICATED)은 상위의 requireUser()가 담당한다.
 */
export async function assertTemplateAccess(
  userId: string,
  templateId: string,
): Promise<LibraryItemWithOrder> {
  const item = await db.libraryItem.findUnique({
    where: { userId_templateId: { userId, templateId } },
    select: {
      id: true,
      userId: true,
      templateId: true,
      orderId: true,
      status: true,
      grantedAt: true,
      firstViewedAt: true,
      firstDownloadedAt: true,
      order: { select: { orderNo: true } },
    },
  });

  if (!item) throw new AccessDeniedError('NOT_OWNED');
  if (item.status !== 'ACTIVE') throw new AccessDeniedError('REFUNDED');

  return {
    id: item.id,
    userId: item.userId,
    templateId: item.templateId,
    orderId: item.orderId,
    status: item.status as LibraryItemStatus,
    grantedAt: item.grantedAt,
    firstViewedAt: item.firstViewedAt,
    firstDownloadedAt: item.firstDownloadedAt,
    orderNo: item.order.orderNo,
  };
}

/**
 * 예외를 던지지 않는 조회. 상세 페이지가 "구매하기 / 라이브러리에서 보기" 버튼을 고를 때 쓴다.
 * 접근 통제 판단에는 사용하지 않는다.
 */
export async function getAccessState(
  userId: string | null,
  templateId: string,
): Promise<{ owned: boolean; reason: AccessDenialReason | null }> {
  if (!userId) return { owned: false, reason: 'NOT_AUTHENTICATED' };

  const item = await db.libraryItem.findUnique({
    where: { userId_templateId: { userId, templateId } },
    select: { status: true },
  });

  if (!item) return { owned: false, reason: 'NOT_OWNED' };
  if (item.status !== 'ACTIVE') return { owned: false, reason: 'REFUNDED' };
  return { owned: true, reason: null };
}
