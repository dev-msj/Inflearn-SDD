import 'server-only';

import { Prisma } from '@prisma/client';

import { generateOrderNo } from './order-number';
import {
  assertTransition,
  isTerminalStatus,
} from './order.state-machine';
import {
  attachProviderPaymentId,
  createLibraryItem,
  createPendingOrder,
  findLibraryItemIdByOrder,
  findOrderStatusForUser as findOrderStatusRow,
  hasActiveLibraryItem,
  insertOrderEvent,
  isUniqueViolation,
  lockOrderForUpdate,
  markOrderConfirmingStatus,
  markOrderExpiredStatus,
  markOrderFailedStatus,
  markOrderPaid,
  markReconcileState,
  upsertPayment,
  type LockedOrder,
} from './order.repository';
import { getProviderForCurrency, getProviderIdForCurrency } from '@/server/payments/provider.registry';
import type { ProviderPaymentSnapshot } from '@/server/payments/provider.types';
import { getPurchasableTemplate } from '@/server/templates/template.service';
import { CONFIRM_TX_OPTIONS, db } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import {
  AlreadyOwnedError,
  AmountMismatchError,
  InvalidOrderTransitionError,
  OrderNotFoundError,
  PolicyNotAgreedError,
} from '@/lib/errors';
import { orderLogger } from '@/lib/logger';
import type {
  ClientCheckoutPayload,
  Currency,
  OrderEventSource,
  OrderStatusView,
  PaymentProviderId,
} from '@/types/domain';

/**
 * 주문 서비스 (F2-AC1/3/6/7/8/9/10/11).
 *
 * 계층 규칙: 리디렉션 라우트·웹훅 핸들러·재조회 배치가 **모두 이 파일의 함수만** 호출한다.
 * 경로마다 다른 확정 로직이 생기면 "웹훅으로는 지급됐는데 배치로는 안 됨" 같은 불일치가 생기기 때문이다.
 *
 * ★로그에는 주문번호·금액·상태만 남긴다. 프롬프트 전문(body)은 이 파일이 조회조차 하지 않는다.
 */

/** 결제 확인 대기 화면의 폴링 주기(ms). 확정 후 60초 내 반영이라는 비기능 기준을 만족한다. */
const POLL_INTERVAL_MS = 3_000;
/** 종료 상태에서는 폴링을 멈춘다. */
const POLL_STOP_MS = 0;

export interface StartCheckoutInput {
  userId: string;
  userEmail: string;
  templateSlug: string;
  currency: Currency;
  /** 환불 정책 동의 없이는 결제를 시작할 수 없다(F2-AC12). */
  policyAgreed: boolean;
  locale: 'ko' | 'en';
}

export interface StartCheckoutResult {
  orderNo: string;
  provider: PaymentProviderId;
  amount: string;
  currency: Currency;
  clientPayload: ClientCheckoutPayload;
  expiresAt: string;
}

function buildReturnUrls(providerId: PaymentProviderId): { successUrl: string; failUrl: string } {
  const base = getServerEnv().APP_BASE_URL.replace(/\/$/, '');
  if (providerId === 'TOSS') {
    return {
      successUrl: `${base}/api/checkout/toss/return`,
      failUrl: `${base}/api/checkout/toss/fail`,
    };
  }
  return {
    successUrl: `${base}/api/checkout/paddle/return`,
    failUrl: `${base}/api/checkout/paddle/return`,
  };
}

/**
 * 결제 시작 (F2-AC1/2/7/8/9/12).
 *
 * 1) 템플릿 판매 상태 확인 → 판매 불가면 TemplateNotPurchasableError
 * 2) 이미 보유 여부 확인 → AlreadyOwnedError (DB의 uq_orders_paid_owner가 최종 방어선)
 * 3) 현재가를 amount로 **스냅샷**해 PENDING 주문 생성 (이후 가격이 바뀌어도 이 금액으로 결제된다)
 * 4) 통화에 매핑된 결제사의 결제창 payload 생성
 */
export async function startCheckout(input: StartCheckoutInput): Promise<StartCheckoutResult> {
  if (!input.policyAgreed) throw new PolicyNotAgreedError();

  const env = getServerEnv();
  const template = await getPurchasableTemplate(input.templateSlug);

  if (await hasActiveLibraryItem(input.userId, template.id)) {
    throw new AlreadyOwnedError(template.id);
  }

  const providerId = getProviderIdForCurrency(input.currency);
  const provider = getProviderForCurrency(input.currency);
  const amount = input.currency === 'KRW' ? template.priceKrw.toFixed(2) : template.priceUsd;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.ORDER_EXPIRE_MINUTES * 60 * 1000);
  const orderNo = generateOrderNo(now);

  const order = await createPendingOrder({
    orderNo,
    userId: input.userId,
    templateId: template.id,
    currency: input.currency,
    amount,
    provider: providerId,
    refundPolicyAgreedAt: now,
    expiresAt,
  });

  const log = orderLogger(orderNo, { userId: input.userId, provider: providerId });

  const urls = buildReturnUrls(providerId);
  let session;
  try {
    session = await provider.createCheckout({
      orderNo,
      amount,
      currency: input.currency,
      templateId: template.id,
      templateSlug: template.slug,
      templateTitle: template.title,
      buyer: { userId: input.userId, email: input.userEmail, locale: input.locale },
      successUrl: urls.successUrl,
      failUrl: urls.failUrl,
      expiresAt,
    });
  } catch (error) {
    // 주문은 PENDING으로 남겨 둔다. 상태 머신상 SYSTEM은 FAILED 전이를 일으킬 수 없고,
    // 만료 배치가 30분 뒤 정리하므로 결제되지 않은 주문이 방치되지 않는다(F2-AC9).
    log.error('checkout_create_failed', {}, error);
    throw error;
  }

  if (session.providerPaymentId) {
    await attachProviderPaymentId(order.id, session.providerPaymentId);
  }

  log.info('checkout_started', { currency: input.currency, amount });

  return {
    orderNo,
    provider: providerId,
    amount,
    currency: input.currency,
    clientPayload: session.clientPayload,
    expiresAt: expiresAt.toISOString(),
  };
}

export interface ConfirmOrderPaidArgs {
  orderNo: string;
  snapshot: ProviderPaymentSnapshot;
  source: OrderEventSource;
}

export interface ConfirmOrderPaidResult {
  orderId: string;
  /** true면 중복 웹훅/중복 배치이므로 메일을 재발송하지 않는다(F2-AC4). */
  alreadyConfirmed: boolean;
  libraryItemId: string;
}

/**
 * ★주문 확정의 단일 진입점 (F2-AC3/6/8).
 *
 * 트랜잭션 내부에서
 *   SELECT ... FOR UPDATE → 상태 재확인(이미 PAID면 no-op) → 금액·통화 대조
 *   → orders UPDATE(PAID) → payments UPSERT → library_items INSERT → order_events INSERT
 * 를 원자적으로 수행한다.
 *
 * ★확정 트랜잭션 안에서는 결제사 API를 호출하지 않는다. 호출자가 미리 조회한 snapshot만 받는다.
 *   외부 호출이 트랜잭션 안에 있으면 네트워크 지연만큼 행 잠금이 길어져 동시 결제가 막힌다.
 */
export async function confirmOrderPaid(args: ConfirmOrderPaidArgs): Promise<ConfirmOrderPaidResult> {
  const log = orderLogger(args.orderNo, { source: args.source });

  try {
    const result = await db.$transaction(async (tx) => {
      const order = await lockOrderForUpdate(tx, args.orderNo);
      if (!order) throw new OrderNotFoundError(args.orderNo);

      // 이미 확정된 주문. 중복 웹훅이므로 아무것도 바꾸지 않는다(멱등 2차 방어).
      if (order.status === 'PAID') {
        const existingItemId = await findLibraryItemIdByOrder(tx, order.id);
        return { orderId: order.id, alreadyConfirmed: true, libraryItemId: existingItemId ?? '' };
      }

      assertTransition(order.status, 'PAID', args.source);
      assertAmountMatches(order, args.snapshot);

      const paidAt = args.snapshot.approvedAt ?? new Date();

      await markOrderPaid(tx, {
        orderId: order.id,
        providerPaymentId: args.snapshot.providerPaymentId,
        paidAt,
      });

      await upsertPayment(tx, {
        orderId: order.id,
        provider: order.provider,
        providerPaymentId: args.snapshot.providerPaymentId,
        status: args.snapshot.status,
        amount: args.snapshot.amount,
        currency: args.snapshot.currency,
        method: args.snapshot.method,
        approvedAt: args.snapshot.approvedAt,
        rawSnapshot: (args.snapshot.raw ?? {}) as Prisma.InputJsonValue,
      });

      const libraryItemId = await createLibraryItem(tx, {
        userId: order.userId,
        templateId: order.templateId,
        orderId: order.id,
        grantedAt: paidAt,
      });

      await insertOrderEvent(tx, {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: 'PAID',
        source: args.source,
        actor: args.source,
        meta: {
          providerPaymentId: args.snapshot.providerPaymentId,
          amount: args.snapshot.amount,
          currency: args.snapshot.currency,
        },
      });

      return { orderId: order.id, alreadyConfirmed: false, libraryItemId };
    }, CONFIRM_TX_OPTIONS);

    if (!result.alreadyConfirmed) {
      log.info('order_confirmed', { amount: args.snapshot.amount, currency: args.snapshot.currency });
    }
    return result;
  } catch (error) {
    // N7: 결제사 승인 금액과 주문 스냅샷 금액이 다르면 자동 환불하지 않고 확정을 보류한다.
    //     사람이 확인해야 하는 금전 사고 경로이므로 INCIDENT로 남긴다(F2-AC11 리포트에 포함).
    if (error instanceof AmountMismatchError) {
      await markIncidentByOrderNo(args.orderNo);
      log.error('order_amount_mismatch', {}, error);
      throw error;
    }

    // N8: 서로 다른 통화의 주문이 동시에 성공해 uq_orders_paid_owner / uq_library_owner를 위반한 경우.
    //     후속 건은 지급할 수 없으므로 확정을 보류하고 자동 환불 대상으로 표시한다.
    if (isUniqueViolation(error)) {
      await markIncidentByOrderNo(args.orderNo);
      log.error('order_duplicate_ownership', { constraint: String(error.meta?.target ?? '') }, error);
      throw new AlreadyOwnedError(args.orderNo);
    }

    // 이미 종료된 주문(EXPIRED/FAILED/REFUNDED 등)에 뒤늦은 결제 성공이 도착한 경우.
    //
    // 만료 시각은 결제사에 전달되지 않으므로 30분이 지난 뒤에도 결제는 성사될 수 있다.
    // 그 사이 만료 배치가 EXPIRED를 확정했다면 여기서 전이가 거부되는데, 이때 예외를 그냥
    // 재던지면 웹훅 핸들러는 FAILED 기록 + 200 응답으로 끝나고 재조회 배치도 종료 상태를
    // 스캔하지 않는다. 결과적으로 **대금은 승인됐는데 지급되지 않은 건이 아무 기록 없이 사라진다**.
    // 사람이 반드시 확인해야 하는 금전 사고이므로 INCIDENT로 승격해 운영자 리포트에 남긴다(F2-AC11).
    if (error instanceof InvalidOrderTransitionError && isTerminalStatus(error.from)) {
      await markIncidentByOrderNo(args.orderNo);
      log.error('order_confirm_after_terminal', { from: error.from, to: error.to }, error);
      throw error;
    }

    throw error;
  }
}

/** 금액·통화 대조 (F2-AC8). 결제 화면에 표시한 스냅샷 금액이 유일한 기준이다. */
function assertAmountMatches(order: LockedOrder, snapshot: ProviderPaymentSnapshot): void {
  const expected = new Prisma.Decimal(order.amount);
  const actual = new Prisma.Decimal(snapshot.amount);

  if (order.currency !== snapshot.currency || !expected.equals(actual)) {
    throw new AmountMismatchError(
      order.orderNo,
      { amount: expected.toFixed(2), currency: order.currency },
      { amount: actual.toFixed(2), currency: snapshot.currency },
    );
  }
}

async function markIncidentByOrderNo(orderNo: string): Promise<void> {
  const order = await db.order.findUnique({ where: { orderNo }, select: { id: true } });
  if (order) await markReconcileState(order.id, 'INCIDENT');
}

/**
 * "결제 확인 중" 전이 (F2-AC5).
 * 리디렉션 복귀가 호출하는 유일한 상태 변경이며, 여기서 PAID로 갈 수 있는 경로는 존재하지 않는다.
 */
export async function markOrderConfirming(
  orderNo: string,
  source: OrderEventSource,
  providerPaymentId?: string | null,
): Promise<void> {
  const log = orderLogger(orderNo, { source });

  await db.$transaction(async (tx) => {
    const order = await lockOrderForUpdate(tx, orderNo);
    if (!order) throw new OrderNotFoundError(orderNo);

    // 이미 확정됐거나 종료된 주문이면 아무것도 하지 않는다(웹훅이 리디렉션보다 먼저 도착한 경우).
    if (order.status !== 'PENDING') {
      log.info('order_confirming_skipped', { status: order.status });
      return;
    }

    assertTransition(order.status, 'CONFIRMING', source);
    await markOrderConfirmingStatus(tx, order.id, providerPaymentId ?? order.providerPaymentId);
    await insertOrderEvent(tx, {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: 'CONFIRMING',
      source,
      actor: source,
      meta: { providerPaymentId: providerPaymentId ?? null },
    });
  }, CONFIRM_TX_OPTIONS);
}

export interface MarkOrderFailedArgs {
  orderNo: string;
  code: string;
  message: string;
  source: OrderEventSource;
}

/**
 * 결제 실패 처리 (F2-AC10).
 * 지급 코드는 confirmOrderPaid()에만 존재하므로, 이 경로에서는 라이브러리 항목이 생길 수 없다.
 */
export async function markOrderFailed(args: MarkOrderFailedArgs): Promise<void> {
  const log = orderLogger(args.orderNo, { source: args.source });

  await db.$transaction(async (tx) => {
    const order = await lockOrderForUpdate(tx, args.orderNo);
    if (!order) throw new OrderNotFoundError(args.orderNo);

    // 이미 확정된 주문을 실패로 되돌리지 않는다. 결제사 재전송 순서가 뒤바뀌어도 지급이 회수되면 안 된다.
    if (order.status === 'PAID' || isTerminalStatus(order.status)) {
      log.info('order_failed_skipped', { status: order.status });
      return;
    }

    assertTransition(order.status, 'FAILED', args.source);
    await markOrderFailedStatus(tx, {
      orderId: order.id,
      code: args.code,
      message: args.message,
      failedAt: new Date(),
    });
    await insertOrderEvent(tx, {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: 'FAILED',
      source: args.source,
      actor: args.source,
      meta: { code: args.code },
    });
  }, CONFIRM_TX_OPTIONS);

  log.info('order_failed', { code: args.code });
}

/**
 * 30분 만료 처리 (F2-AC9).
 * 호출 전에 배치가 결제사 조회로 "성공이 아님"을 확인해야 한다. EXPIRED는 종료 상태라 되돌릴 수 없다.
 */
export async function expireOrder(orderNo: string): Promise<boolean> {
  const log = orderLogger(orderNo, { source: 'BATCH' });

  return db.$transaction(async (tx) => {
    const order = await lockOrderForUpdate(tx, orderNo);
    if (!order) throw new OrderNotFoundError(orderNo);

    if (order.status !== 'PENDING') {
      log.info('order_expire_skipped', { status: order.status });
      return false;
    }

    assertTransition(order.status, 'EXPIRED', 'BATCH');
    await markOrderExpiredStatus(tx, order.id, new Date());
    await insertOrderEvent(tx, {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: 'EXPIRED',
      source: 'BATCH',
      actor: 'BATCH',
      meta: { expiresAt: order.expiresAt.toISOString() },
    });
    return true;
  }, CONFIRM_TX_OPTIONS);
}

/** 확정 지연·금액 불일치 표시. 상태는 그대로 두고 감시 플래그만 올린다(F2-AC11). */
export async function markOrderIncident(orderId: string): Promise<void> {
  await markReconcileState(orderId, 'INCIDENT');
}

/**
 * 주문 상태 폴링 (F2-AC5/10/11).
 * ★본인 주문이 아니면 NotFoundError를 던진다. 403을 주면 "그 주문이 존재한다"는 사실이 노출된다.
 */
export async function getOrderStatusForUser(orderNo: string, userId: string): Promise<OrderStatusView> {
  const row = await findOrderStatusRow(orderNo, userId);
  if (!row) throw new OrderNotFoundError(orderNo);

  const settled = row.status === 'PAID' || isTerminalStatus(row.status);

  return {
    orderNo: row.orderNo,
    status: row.status,
    currency: row.currency,
    amount: row.amount,
    templateId: row.templateId,
    templateSlug: row.templateSlug,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
    // "확인 중, 최대 24시간 내 처리" 안내 조건.
    delayed: row.status === 'CONFIRMING' && row.reconcileState === 'INCIDENT',
    pollAfterMs: settled ? POLL_STOP_MS : POLL_INTERVAL_MS,
  };
}
