import 'server-only';

import type { OrderStatus, RefundIneligibleReason, RefundReasonCode } from '@/types/domain';

/**
 * 환불 자격 판정 (F2-AC12).
 *
 * 국내 전자상거래법상 디지털 콘텐츠 청약철회 제한 규정에 근거한 정책이다.
 *  - 구매일(paid_at)로부터 7일 이내이고
 *  - 프롬프트 전문을 아직 열람·다운로드하지 않은 경우에만 접수한다.
 * PRD Q1 초안대로 **열람과 다운로드 모두를 "열람"으로 간주**한다.
 *
 * 이 함수는 순수 함수다. DB·시간·세션에 의존하지 않아 단위 테스트로 경계를 고정할 수 있다.
 */

/** 정책 문구(messages의 refundPolicy.body)와 반드시 같은 값을 써야 한다. */
export const REFUND_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 사유 코드/불가 사유 타입은 `@/types/domain`에 선언되어 있고 여기서는 re-export만 한다. */
export type { RefundIneligibleReason, RefundReasonCode };

export interface RefundEligibilityInput {
  order: { status: OrderStatus; paidAt: Date | null };
  libraryItem: { firstViewedAt: Date | null; firstDownloadedAt: Date | null } | null;
  /** REQUESTED/APPROVED/COMPLETED 상태의 환불이 이미 있는지 (uq_refunds_active와 같은 조건). */
  hasActiveRefund?: boolean;
  now?: Date;
}

export type RefundEligibility =
  | { eligible: true }
  | { eligible: false; reason: RefundIneligibleReason };

export function evaluateRefundEligibility(input: RefundEligibilityInput): RefundEligibility {
  const now = input.now ?? new Date();

  // 1) 이미 접수된 요청이 있으면 중복 접수를 막는다. 상태가 REFUND_REQUESTED/REFUNDED인 경우도 동일하다.
  if (input.hasActiveRefund || input.order.status === 'REFUND_REQUESTED' || input.order.status === 'REFUNDED') {
    return { eligible: false, reason: 'ALREADY_REQUESTED' };
  }

  // 2) 결제가 확정된 주문만 환불 대상이다.
  if (input.order.status !== 'PAID' || !input.order.paidAt) {
    return { eligible: false, reason: 'ORDER_NOT_PAID' };
  }

  // 3) 구매일로부터 7일 이내인지. 경계(정확히 7일 0초)는 포함으로 본다.
  const elapsedMs = now.getTime() - input.order.paidAt.getTime();
  if (elapsedMs > REFUND_WINDOW_DAYS * DAY_MS) {
    return { eligible: false, reason: 'WINDOW_EXPIRED' };
  }

  // 4) 전문을 한 번이라도 열람·다운로드했으면 청약철회가 제한된다.
  if (input.libraryItem?.firstViewedAt) {
    return { eligible: false, reason: 'ALREADY_VIEWED' };
  }
  if (input.libraryItem?.firstDownloadedAt) {
    return { eligible: false, reason: 'ALREADY_DOWNLOADED' };
  }

  return { eligible: true };
}
