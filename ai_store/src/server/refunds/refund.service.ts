import 'server-only';

import { evaluateRefundEligibility } from './refund.policy';
import type { RefundReasonCode } from './refund.policy';
import {
  findOrderWithLibraryItem,
  insertOrderEvent,
  lockOrderForUpdate,
  markOrderPaidAgain,
  markOrderRefundRequestedStatus,
  markOrderRefundedStatus,
  markReconcileState,
  revokeLibraryItem,
} from '@/server/orders/order.repository';
import { assertTransition } from '@/server/orders/order.state-machine';
import { getProviderById } from '@/server/payments/provider.registry';
import { CONFIRM_TX_OPTIONS, db } from '@/lib/db';
import { NotFoundError, RefundIneligibleError } from '@/lib/errors';
import { orderLogger } from '@/lib/logger';
import type { OrderEventSource, RefundStatus } from '@/types/domain';

/**
 * 환불 서비스 (F2-AC12, F3-AC9).
 *
 * 흐름
 *   requestRefund()  : 정책 판정 → refunds INSERT + orders REFUND_REQUESTED → (커밋 후) 결제사 환불 호출
 *   completeRefund() : 결제사 환불 완료 → orders REFUNDED + library_items REVOKED (즉시 열람 차단)
 *
 * ★결제사 API 호출은 트랜잭션 밖에서 한다. 외부 호출이 잠금 구간에 들어가면 주문 행이 길게 잠긴다.
 */

/** 결제사에 전달할 환불 사유. 사용자가 입력한 상세 사유는 개인정보가 섞일 수 있어 넘기지 않는다. */
const PROVIDER_REFUND_REASON = 'Customer requested refund';

/** 활성 환불로 간주하는 상태. 마이그레이션의 uq_refunds_active 조건과 동일하게 유지한다. */
const ACTIVE_REFUND_STATUSES: RefundStatus[] = ['REQUESTED', 'APPROVED', 'COMPLETED'];

export interface RequestRefundInput {
  orderNo: string;
  userId: string;
  reasonCode: RefundReasonCode;
  reasonText?: string;
}

export interface RequestRefundResult {
  refundId: string;
  status: RefundStatus;
}

/**
 * 환불 요청 접수 (F2-AC12).
 * 타인의 주문이면 403이 아니라 404를 던진다(주문 존재 여부 노출 금지).
 */
export async function requestRefund(input: RequestRefundInput): Promise<RequestRefundResult> {
  const log = orderLogger(input.orderNo, { userId: input.userId, source: 'USER' });

  const order = await findOrderWithLibraryItem(input.orderNo);
  if (!order || order.userId !== input.userId) {
    throw new NotFoundError('Order not found');
  }

  const activeRefundCount = await db.refund.count({
    where: { orderId: order.id, status: { in: ACTIVE_REFUND_STATUSES } },
  });

  const eligibility = evaluateRefundEligibility({
    order: { status: order.status, paidAt: order.paidAt },
    libraryItem: order.libraryItem,
    hasActiveRefund: activeRefundCount > 0,
  });

  if (!eligibility.eligible) {
    log.info('refund_rejected_by_policy', { reason: eligibility.reason });
    throw new RefundIneligibleError(eligibility.reason);
  }

  const refund = await db.$transaction(async (tx) => {
    const locked = await lockOrderForUpdate(tx, input.orderNo);
    if (!locked) throw new NotFoundError('Order not found');

    // 잠금 대기 중에 다른 요청이 상태를 바꿨을 수 있으므로 다시 확인한다.
    assertTransition(locked.status, 'REFUND_REQUESTED', 'USER');

    const created = await tx.refund.create({
      data: {
        orderId: locked.id,
        status: 'REQUESTED',
        reasonCode: input.reasonCode,
        reasonText: input.reasonText,
        amount: locked.amount,
        currency: locked.currency,
      },
      select: { id: true, status: true },
    });

    await markOrderRefundRequestedStatus(tx, locked.id);
    await insertOrderEvent(tx, {
      orderId: locked.id,
      fromStatus: locked.status,
      toStatus: 'REFUND_REQUESTED',
      source: 'USER',
      actor: input.userId,
      meta: { reasonCode: input.reasonCode, refundId: created.id },
    });

    return created;
  }, CONFIRM_TX_OPTIONS);

  log.info('refund_requested', { refundId: refund.id });

  // 커밋 후 결제사 환불 호출. 실패해도 접수 자체는 유효하며, 완료는 웹훅 또는 운영자 재시도가 담당한다.
  if (order.providerPaymentId) {
    try {
      const provider = getProviderById(order.provider);
      const result = await provider.refund({
        orderNo: order.orderNo,
        providerPaymentId: order.providerPaymentId,
        amount: order.amount,
        currency: order.currency,
        reason: PROVIDER_REFUND_REASON,
      });

      await db.refund.update({
        where: { id: refund.id },
        data: {
          providerRefundId: result.providerRefundId,
          status: result.status === 'COMPLETED' ? 'APPROVED' : 'REQUESTED',
        },
      });

      if (result.status === 'COMPLETED') {
        // 결제사가 동기적으로 환불을 끝낸 경우(토스 취소). 웹훅을 기다리지 않고 즉시 회수한다.
        await completeRefund({
          orderNo: order.orderNo,
          source: 'SYSTEM',
          providerRefundId: result.providerRefundId,
        });
      }
    } catch (error) {
      // 결제사 환불 호출 실패를 로그로만 남기면, 사용자 화면에는 "접수되었습니다"가 뜨는데
      // 실제로는 환불되지 않고 재시도 주체도 없다(재조회 배치는 진행 중인 주문만 스캔한다).
      // INCIDENT로 승격해 운영자 리포트에 노출시킨다.
      await markReconcileState(order.id, 'INCIDENT');
      log.error('refund_provider_call_failed', { refundId: refund.id }, error);
    }
  } else {
    // 결제사 결제 식별자가 없으면 환불 API를 호출할 수단 자체가 없다(리디렉션 유실 등으로
    // paymentKey가 끝내 저장되지 않은 경우). 접수만 된 채 방치되지 않도록 동일하게 INCIDENT로 남긴다.
    await markReconcileState(order.id, 'INCIDENT');
    log.error('refund_provider_payment_id_missing', { refundId: refund.id });
  }

  return { refundId: refund.id, status: 'REQUESTED' };
}

export interface CompleteRefundInput {
  orderNo: string;
  source: OrderEventSource;
  providerRefundId?: string | null;
}

/**
 * 환불 완료 처리 (F2-AC12, F3-AC9).
 * ★library_items.status를 REVOKED로 바꾸는 즉시 assertTemplateAccess()가 열람을 차단한다.
 */
export async function completeRefund(input: CompleteRefundInput): Promise<void> {
  const log = orderLogger(input.orderNo, { source: input.source });

  await db.$transaction(async (tx) => {
    const locked = await lockOrderForUpdate(tx, input.orderNo);
    if (!locked) throw new NotFoundError('Order not found');

    // 이미 환불 완료된 주문이면 멱등하게 종료한다(환불 완료 웹훅 중복 수신).
    if (locked.status === 'REFUNDED') {
      log.info('refund_complete_skipped', { status: locked.status });
      return;
    }

    assertTransition(locked.status, 'REFUNDED', input.source);

    const now = new Date();
    await markOrderRefundedStatus(tx, locked.id, now);

    await tx.refund.updateMany({
      where: { orderId: locked.id, status: { in: ['REQUESTED', 'APPROVED'] } },
      data: {
        status: 'COMPLETED',
        completedAt: now,
        ...(input.providerRefundId ? { providerRefundId: input.providerRefundId } : {}),
      },
    });

    const libraryItem = await tx.libraryItem.findUnique({
      where: { orderId: locked.id },
      select: { id: true },
    });
    if (libraryItem) {
      await revokeLibraryItem(tx, libraryItem.id, now);
    }

    await insertOrderEvent(tx, {
      orderId: locked.id,
      fromStatus: locked.status,
      toStatus: 'REFUNDED',
      source: input.source,
      actor: input.source,
      meta: { providerRefundId: input.providerRefundId ?? null },
    });
  }, CONFIRM_TX_OPTIONS);

  log.info('refund_completed');
}

export interface RejectRefundInput {
  orderNo: string;
  reason: string;
}

/**
 * 환불 반려. 전이표의 `REFUND_REQUESTED → PAID`(복귀)에 해당한다.
 * 반려해도 지급은 유지되므로 library_items는 건드리지 않는다.
 */
export async function rejectRefund(input: RejectRefundInput): Promise<void> {
  await db.$transaction(async (tx) => {
    const locked = await lockOrderForUpdate(tx, input.orderNo);
    if (!locked) throw new NotFoundError('Order not found');
    if (locked.status !== 'REFUND_REQUESTED') return;

    assertTransition(locked.status, 'PAID', 'SYSTEM');

    await markOrderPaidAgain(tx, locked.id);
    await tx.refund.updateMany({
      where: { orderId: locked.id, status: { in: ['REQUESTED', 'APPROVED'] } },
      data: { status: 'REJECTED' },
    });
    await insertOrderEvent(tx, {
      orderId: locked.id,
      fromStatus: locked.status,
      toStatus: 'PAID',
      source: 'SYSTEM',
      actor: 'SYSTEM',
      meta: { reason: input.reason },
    });
  }, CONFIRM_TX_OPTIONS);
}
