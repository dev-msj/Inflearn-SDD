import 'server-only';

import { Prisma } from '@prisma/client';

import { db } from '@/lib/db';
import type {
  Currency,
  LibraryItemStatus,
  OrderEventSource,
  OrderStatus,
  PaymentProviderId,
  ReconcileState,
} from '@/types/domain';
import type { ProviderPaymentStatus } from '@/server/payments/provider.types';

/**
 * 주문 영속화 레포지토리 (F2-AC3/6/8/11).
 *
 * ★중복 지급 방지의 2차 방어선(TECH_SPEC "3중 방어" 중 상태 계층)이 여기 있다.
 *   `lockOrderForUpdate()`가 `SELECT ... FOR UPDATE`로 주문 행을 잠그기 때문에,
 *   같은 주문에 대한 웹훅과 배치가 동시에 들어와도 한쪽이 커밋될 때까지 다른 쪽이 대기하고,
 *   대기가 풀린 뒤에는 이미 PAID로 바뀐 상태를 다시 읽게 되어 두 번 지급될 수 없다.
 *
 * 이 파일은 도메인 판단(전이 가능 여부, 금액 대조)을 하지 않는다. 판단은 order.service.ts가 한다.
 */

export type OrderTx = Prisma.TransactionClient;

/** FOR UPDATE로 잠근 주문 행. 확정 판단에 필요한 컬럼만 읽는다. */
export interface LockedOrder {
  id: string;
  orderNo: string;
  userId: string;
  templateId: string;
  currency: Currency;
  amount: Prisma.Decimal;
  provider: PaymentProviderId;
  status: OrderStatus;
  providerPaymentId: string | null;
  expiresAt: Date;
  paidAt: Date | null;
  reconcileState: ReconcileState;
  reconcileAttempts: number;
  createdAt: Date;
}

/**
 * 주문 행 잠금.
 * ★반드시 트랜잭션 클라이언트로 호출해야 한다. 트랜잭션 밖의 FOR UPDATE는 즉시 잠금이 해제되어 무의미하다.
 */
export async function lockOrderForUpdate(tx: OrderTx, orderNo: string): Promise<LockedOrder | null> {
  const rows = await tx.$queryRaw<LockedOrder[]>`
    SELECT
      id,
      order_no             AS "orderNo",
      user_id              AS "userId",
      template_id          AS "templateId",
      currency::text       AS "currency",
      amount,
      provider::text       AS "provider",
      status::text         AS "status",
      provider_payment_id  AS "providerPaymentId",
      expires_at           AS "expiresAt",
      paid_at              AS "paidAt",
      reconcile_state::text AS "reconcileState",
      reconcile_attempts   AS "reconcileAttempts",
      created_at           AS "createdAt"
    FROM orders
    WHERE order_no = ${orderNo}
    FOR UPDATE
  `;

  return rows[0] ?? null;
}

export interface CreateOrderInput {
  orderNo: string;
  userId: string;
  templateId: string;
  currency: Currency;
  /** 결제 화면 표시 금액 스냅샷(F2-AC8). 이후 어떤 경로로도 재계산하지 않는다. */
  amount: string;
  provider: PaymentProviderId;
  refundPolicyAgreedAt: Date;
  expiresAt: Date;
}

export interface CreatedOrder {
  id: string;
  orderNo: string;
}

/** PENDING 주문 생성 + 최초 감사 이벤트 기록. */
export async function createPendingOrder(input: CreateOrderInput): Promise<CreatedOrder> {
  return db.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        orderNo: input.orderNo,
        userId: input.userId,
        templateId: input.templateId,
        currency: input.currency,
        amount: new Prisma.Decimal(input.amount),
        provider: input.provider,
        status: 'PENDING',
        providerOrderRef: input.orderNo,
        refundPolicyAgreedAt: input.refundPolicyAgreedAt,
        expiresAt: input.expiresAt,
      },
      select: { id: true, orderNo: true },
    });

    await insertOrderEvent(tx, {
      orderId: order.id,
      fromStatus: null,
      toStatus: 'PENDING',
      source: 'USER',
      actor: input.userId,
      meta: { currency: input.currency, amount: input.amount, provider: input.provider },
    });

    return order;
  });
}

/** 결제사 거래 식별자 연결(Paddle transaction id 등). 결제창 생성 직후 1회. */
export async function attachProviderPaymentId(orderId: string, providerPaymentId: string): Promise<void> {
  await db.order.update({ where: { id: orderId }, data: { providerPaymentId } });
}

export interface OrderEventInput {
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  source: OrderEventSource;
  actor?: string | null;
  meta?: Prisma.InputJsonValue;
}

/** 모든 상태 전이의 감사 로그. 전이와 같은 트랜잭션에서 기록해야 기록 누락이 없다. */
export async function insertOrderEvent(tx: OrderTx, input: OrderEventInput): Promise<void> {
  await tx.orderEvent.create({
    data: {
      orderId: input.orderId,
      fromStatus: input.fromStatus ?? undefined,
      toStatus: input.toStatus,
      source: input.source,
      actor: input.actor ?? undefined,
      meta: input.meta,
    },
  });
}

export interface MarkPaidInput {
  orderId: string;
  providerPaymentId: string | null;
  paidAt: Date;
}

export async function markOrderPaid(tx: OrderTx, input: MarkPaidInput): Promise<void> {
  await tx.order.update({
    where: { id: input.orderId },
    data: {
      status: 'PAID',
      paidAt: input.paidAt,
      providerPaymentId: input.providerPaymentId ?? undefined,
      failureCode: null,
      failureMessage: null,
      // 확정되었으므로 재조회 감시 대상에서 내린다.
      reconcileState: 'RESOLVED',
      lastReconciledAt: input.paidAt,
    },
  });
}

export async function markOrderConfirmingStatus(tx: OrderTx, orderId: string, providerPaymentId: string | null): Promise<void> {
  await tx.order.update({
    where: { id: orderId },
    data: {
      status: 'CONFIRMING',
      providerPaymentId: providerPaymentId ?? undefined,
      // 웹훅이 오지 않아도 배치가 구제하도록 감시 상태로 전환한다(F2-AC11).
      reconcileState: 'WATCHING',
    },
  });
}

export interface MarkFailedInput {
  orderId: string;
  code: string;
  message: string;
  failedAt: Date;
}

export async function markOrderFailedStatus(tx: OrderTx, input: MarkFailedInput): Promise<void> {
  await tx.order.update({
    where: { id: input.orderId },
    data: {
      status: 'FAILED',
      failedAt: input.failedAt,
      failureCode: input.code,
      failureMessage: input.message,
      reconcileState: 'RESOLVED',
    },
  });
}

export async function markOrderExpiredStatus(tx: OrderTx, orderId: string, expiredAt: Date): Promise<void> {
  await tx.order.update({
    where: { id: orderId },
    data: { status: 'EXPIRED', expiredAt, reconcileState: 'RESOLVED' },
  });
}

export async function markOrderRefundRequestedStatus(tx: OrderTx, orderId: string): Promise<void> {
  await tx.order.update({ where: { id: orderId }, data: { status: 'REFUND_REQUESTED' } });
}

export async function markOrderRefundedStatus(tx: OrderTx, orderId: string, refundedAt: Date): Promise<void> {
  await tx.order.update({ where: { id: orderId }, data: { status: 'REFUNDED', refundedAt } });
}

export async function markOrderPaidAgain(tx: OrderTx, orderId: string): Promise<void> {
  // 환불 반려 시 PAID로 복귀. refundedAt은 채워진 적이 없으므로 건드리지 않는다.
  await tx.order.update({ where: { id: orderId }, data: { status: 'PAID' } });
}

export interface UpsertPaymentInput {
  orderId: string;
  provider: PaymentProviderId;
  providerPaymentId: string;
  status: ProviderPaymentStatus;
  amount: string;
  currency: Currency;
  method: string | null;
  approvedAt: Date | null;
  rawSnapshot: Prisma.InputJsonValue;
}

/**
 * 결제사 원본 스냅샷 저장.
 * UNIQUE(provider, provider_payment_id)라 같은 결제 건이 두 번 들어와도 한 행만 유지된다.
 */
export async function upsertPayment(tx: OrderTx, input: UpsertPaymentInput): Promise<void> {
  const data = {
    orderId: input.orderId,
    provider: input.provider,
    providerPaymentId: input.providerPaymentId,
    status: input.status,
    amount: new Prisma.Decimal(input.amount),
    currency: input.currency,
    method: input.method,
    approvedAt: input.approvedAt,
    rawSnapshot: input.rawSnapshot,
  };

  await tx.payment.upsert({
    where: {
      provider_providerPaymentId: {
        provider: input.provider,
        providerPaymentId: input.providerPaymentId,
      },
    },
    create: data,
    update: data,
  });
}

export interface CreateLibraryItemInput {
  userId: string;
  templateId: string;
  orderId: string;
  grantedAt: Date;
}

/**
 * 라이브러리 지급 (F2-AC3).
 * ★중복 지급 방지의 3차 방어선. UNIQUE(user_id, template_id)와 UNIQUE(order_id)가 걸려 있어
 *   어떤 경로로 두 번 호출되어도 두 번째는 P2002로 롤백된다.
 */
export async function createLibraryItem(tx: OrderTx, input: CreateLibraryItemInput): Promise<string> {
  const item = await tx.libraryItem.create({
    data: {
      userId: input.userId,
      templateId: input.templateId,
      orderId: input.orderId,
      status: 'ACTIVE',
      grantedAt: input.grantedAt,
    },
    select: { id: true },
  });
  return item.id;
}

export async function findLibraryItemIdByOrder(tx: OrderTx, orderId: string): Promise<string | null> {
  const item = await tx.libraryItem.findUnique({ where: { orderId }, select: { id: true } });
  return item?.id ?? null;
}

/** 주문 상태 폴링용 조회. 본인 주문이 아니면 null을 반환해 서비스가 404로 변환한다. */
export interface OrderStatusRow {
  orderNo: string;
  status: OrderStatus;
  currency: Currency;
  amount: string;
  templateId: string;
  templateSlug: string;
  failureCode: string | null;
  failureMessage: string | null;
  reconcileState: ReconcileState;
}

export async function findOrderStatusForUser(orderNo: string, userId: string): Promise<OrderStatusRow | null> {
  const row = await db.order.findFirst({
    where: { orderNo, userId },
    select: {
      orderNo: true,
      status: true,
      currency: true,
      amount: true,
      templateId: true,
      failureCode: true,
      failureMessage: true,
      reconcileState: true,
      template: { select: { slug: true } },
    },
  });
  if (!row) return null;

  return {
    orderNo: row.orderNo,
    status: row.status as OrderStatus,
    currency: row.currency as Currency,
    amount: row.amount.toFixed(2),
    templateId: row.templateId,
    templateSlug: row.template.slug,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
    reconcileState: row.reconcileState as ReconcileState,
  };
}

/** 구매 확인 메일 발송에 필요한 정보 (F2-AC4). 프롬프트 전문은 포함하지 않는다. */
export interface OrderMailRow {
  orderId: string;
  orderNo: string;
  currency: Currency;
  amount: string;
  paidAt: Date | null;
  userEmail: string;
  userLocale: string;
  templateTitle: string;
  templateId: string;
}

export async function findOrderForMail(orderId: string): Promise<OrderMailRow | null> {
  const row = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNo: true,
      currency: true,
      amount: true,
      paidAt: true,
      templateId: true,
      user: { select: { email: true, locale: true } },
      template: { select: { title: true } },
    },
  });
  if (!row) return null;

  return {
    orderId: row.id,
    orderNo: row.orderNo,
    currency: row.currency as Currency,
    amount: row.amount.toFixed(2),
    paidAt: row.paidAt,
    userEmail: row.user.email,
    userLocale: row.user.locale,
    templateTitle: row.template.title,
    templateId: row.templateId,
  };
}

/** 배치가 스캔할 미확정 주문. */
export interface ReconcileCandidate {
  id: string;
  orderNo: string;
  status: OrderStatus;
  provider: PaymentProviderId;
  currency: Currency;
  amount: string;
  providerPaymentId: string | null;
  expiresAt: Date;
  createdAt: Date;
  reconcileState: ReconcileState;
  reconcileAttempts: number;
  lastReconciledAt: Date | null;
}

export interface FindReconcileCandidatesParams {
  /** created_at > now - lookbackHours 인 주문만 본다. 오래된 건은 배치가 계속 붙잡지 않는다. */
  since: Date;
  limit: number;
}

export async function findReconcileCandidates(
  params: FindReconcileCandidatesParams,
): Promise<ReconcileCandidate[]> {
  const rows = await db.order.findMany({
    where: {
      status: { in: ['PENDING', 'CONFIRMING'] },
      createdAt: { gt: params.since },
    },
    select: {
      id: true,
      orderNo: true,
      status: true,
      provider: true,
      currency: true,
      amount: true,
      providerPaymentId: true,
      expiresAt: true,
      createdAt: true,
      reconcileState: true,
      reconcileAttempts: true,
      lastReconciledAt: true,
    },
    // 한 번도 조회하지 않은 건을 먼저 처리한다(idx_orders_reconcile와 동일한 정렬).
    orderBy: [{ lastReconciledAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    take: params.limit,
  });

  return rows.map((row) => ({
    id: row.id,
    orderNo: row.orderNo,
    status: row.status as OrderStatus,
    provider: row.provider as PaymentProviderId,
    currency: row.currency as Currency,
    amount: row.amount.toFixed(2),
    providerPaymentId: row.providerPaymentId,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    reconcileState: row.reconcileState as ReconcileState,
    reconcileAttempts: row.reconcileAttempts,
    lastReconciledAt: row.lastReconciledAt,
  }));
}

/** 만료 배치 대상: expires_at이 지난 PENDING 주문. */
export async function findExpiredPendingOrders(now: Date, limit: number): Promise<ReconcileCandidate[]> {
  const rows = await db.order.findMany({
    where: { status: 'PENDING', expiresAt: { lt: now } },
    select: {
      id: true,
      orderNo: true,
      status: true,
      provider: true,
      currency: true,
      amount: true,
      providerPaymentId: true,
      expiresAt: true,
      createdAt: true,
      reconcileState: true,
      reconcileAttempts: true,
      lastReconciledAt: true,
    },
    orderBy: [{ expiresAt: 'asc' }],
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    orderNo: row.orderNo,
    status: row.status as OrderStatus,
    provider: row.provider as PaymentProviderId,
    currency: row.currency as Currency,
    amount: row.amount.toFixed(2),
    providerPaymentId: row.providerPaymentId,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    reconcileState: row.reconcileState as ReconcileState,
    reconcileAttempts: row.reconcileAttempts,
    lastReconciledAt: row.lastReconciledAt,
  }));
}

/** 재조회 시도 기록. 백오프 계산의 기준값이 된다. */
export async function recordReconcileAttempt(orderId: string, now: Date): Promise<void> {
  await db.order.update({
    where: { id: orderId },
    data: { reconcileAttempts: { increment: 1 }, lastReconciledAt: now },
  });
}

/**
 * 확정 보류 표시 (F2-AC11, N7/N8).
 * 상태(status)는 바꾸지 않는다. 자동으로 실패 처리하면 "결제는 됐는데 미지급"이 확정되기 때문이다.
 */
export async function markReconcileState(orderId: string, state: ReconcileState): Promise<void> {
  await db.order.update({ where: { id: orderId }, data: { reconcileState: state } });
}

/** INCIDENT 주문 목록(운영자 리포트용). */
export interface IncidentRow {
  orderNo: string;
  status: OrderStatus;
  provider: PaymentProviderId;
  currency: Currency;
  amount: string;
  createdAt: Date;
  reconcileAttempts: number;
}

export async function findIncidentOrders(limit: number): Promise<IncidentRow[]> {
  const rows = await db.order.findMany({
    // status로 좁히지 않는다. 사람이 확인해야 하는 금전 사고는 진행 중인 주문에만 생기지 않는다.
    //   - EXPIRED/FAILED로 종료된 뒤 결제가 성사된 건(대금은 승인, 지급은 불가)
    //   - REFUND_REQUESTED에서 결제사 환불 호출이 실패한 건(사용자에겐 접수 완료로 보임)
    // 이들을 제외하면 정작 돈이 걸린 건들이 리포트에서 조용히 빠진다.
    where: { reconcileState: 'INCIDENT' },
    select: {
      orderNo: true,
      status: true,
      provider: true,
      currency: true,
      amount: true,
      createdAt: true,
      reconcileAttempts: true,
    },
    orderBy: [{ createdAt: 'asc' }],
    take: limit,
  });

  return rows.map((row) => ({
    orderNo: row.orderNo,
    status: row.status as OrderStatus,
    provider: row.provider as PaymentProviderId,
    currency: row.currency as Currency,
    amount: row.amount.toFixed(2),
    createdAt: row.createdAt,
    reconcileAttempts: row.reconcileAttempts,
  }));
}

/**
 * 결제사 거래 식별자로 주문번호를 찾는다.
 * Paddle 환불 이벤트처럼 custom_data(orderNo)가 실리지 않는 웹훅을 주문에 연결할 때 쓴다.
 */
export async function findOrderNoByProviderPaymentId(
  provider: PaymentProviderId,
  providerPaymentId: string,
): Promise<string | null> {
  const row = await db.order.findFirst({
    where: { provider, providerPaymentId },
    select: { orderNo: true },
    orderBy: { createdAt: 'desc' },
  });
  return row?.orderNo ?? null;
}

/**
 * 확정 경로용 주문 참조. 금액을 함께 돌려준다.
 *
 * 승인(confirm) 대행 시 결제사에 전달할 기준 금액이 필요하므로, 확정 직전 조회는
 * id만으로는 부족하다. FetchPaymentRef.expectedAmount에 이 값을 넘긴다.
 */
export async function findOrderConfirmRefByNo(
  orderNo: string,
): Promise<{ id: string; amount: string } | null> {
  const row = await db.order.findUnique({
    where: { orderNo },
    select: { id: true, amount: true },
  });
  return row ? { id: row.id, amount: row.amount.toFixed(2) } : null;
}

/** 환불 처리에 필요한 주문 + 지급 정보. */
export interface OrderWithLibraryItem {
  id: string;
  orderNo: string;
  userId: string;
  templateId: string;
  status: OrderStatus;
  currency: Currency;
  amount: string;
  provider: PaymentProviderId;
  providerPaymentId: string | null;
  paidAt: Date | null;
  libraryItem: {
    id: string;
    status: LibraryItemStatus;
    firstViewedAt: Date | null;
    firstDownloadedAt: Date | null;
  } | null;
}

export async function findOrderWithLibraryItem(orderNo: string): Promise<OrderWithLibraryItem | null> {
  const row = await db.order.findUnique({
    where: { orderNo },
    select: {
      id: true,
      orderNo: true,
      userId: true,
      templateId: true,
      status: true,
      currency: true,
      amount: true,
      provider: true,
      providerPaymentId: true,
      paidAt: true,
      libraryItem: {
        select: { id: true, status: true, firstViewedAt: true, firstDownloadedAt: true },
      },
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    orderNo: row.orderNo,
    userId: row.userId,
    templateId: row.templateId,
    status: row.status as OrderStatus,
    currency: row.currency as Currency,
    amount: row.amount.toFixed(2),
    provider: row.provider as PaymentProviderId,
    providerPaymentId: row.providerPaymentId,
    paidAt: row.paidAt,
    libraryItem: row.libraryItem
      ? {
          id: row.libraryItem.id,
          status: row.libraryItem.status as LibraryItemStatus,
          firstViewedAt: row.libraryItem.firstViewedAt,
          firstDownloadedAt: row.libraryItem.firstDownloadedAt,
        }
      : null,
  };
}

/** 이미 보유한 템플릿인지 (F2-AC7). REVOKED(환불 완료)는 보유로 보지 않는다. */
export async function hasActiveLibraryItem(userId: string, templateId: string): Promise<boolean> {
  const item = await db.libraryItem.findUnique({
    where: { userId_templateId: { userId, templateId } },
    select: { status: true },
  });
  return item?.status === 'ACTIVE';
}

/** 환불 완료 시 지급 회수 (F2-AC12, F3-AC9). */
export async function revokeLibraryItem(tx: OrderTx, libraryItemId: string, revokedAt: Date): Promise<void> {
  await tx.libraryItem.update({
    where: { id: libraryItemId },
    data: { status: 'REVOKED', revokedAt },
  });
}

/** Prisma 유니크 제약 위반(P2002) 판별. 멱등 처리 분기에 쓰인다. */
export function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
