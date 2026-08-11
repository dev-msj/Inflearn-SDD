import 'server-only';

import {
  createRefundAdjustment,
  createTransaction,
  findTransactionByOrderNo,
  fromMinorUnits,
  getTransaction,
  type PaddleTransaction,
} from './paddle.client';
import { verifyPaddleSignature } from './paddle.signature';
import { getClientEnv, getServerEnv } from '@/lib/env';
import { ProviderApiError } from '@/lib/errors';
import type {
  CheckoutSession,
  CreateCheckoutInput,
  FetchPaymentRef,
  NormalizedWebhookEvent,
  PaymentProvider,
  ProviderPaymentSnapshot,
  ProviderPaymentStatus,
  RawWebhookRequest,
  RefundInput,
  RefundResult,
  WebhookIntent,
} from '../provider.types';

/**
 * Paddle(USD) PaymentProvider 구현 (F2-AC2/3/10/12).
 *
 * Paddle은 Merchant of Record 구조라 세금 처리를 대행한다. 스토어는 거래를 생성하고
 * 클라이언트가 Paddle.js 오버레이를 열며, 확정은 스토어가 조회 API로 재확인한 뒤에만 수행한다.
 */

const PROVIDER_LABEL = 'PADDLE';

/** Paddle transaction status → 공통 상태. */
function mapStatus(status: string): ProviderPaymentStatus {
  switch (status) {
    case 'completed':
    case 'paid':
      return 'SUCCEEDED';
    case 'billed':
    case 'ready':
    case 'draft':
    case 'past_due':
      return 'PENDING';
    case 'canceled':
      return 'CANCELED';
    default:
      return 'UNKNOWN';
  }
}

function readTotal(transaction: PaddleTransaction): string {
  const totals = transaction.details?.totals;
  const minor = totals?.grand_total ?? totals?.total;
  return minor ? fromMinorUnits(minor) : '0.00';
}

function readMethod(transaction: PaddleTransaction): string | null {
  return transaction.payments?.[0]?.method_details?.type ?? null;
}

function readFailure(transaction: PaddleTransaction): { code: string | null; message: string | null } {
  const errorCode = transaction.payments?.[0]?.error_code ?? null;
  return { code: errorCode, message: errorCode };
}

function toSnapshot(transaction: PaddleTransaction): ProviderPaymentSnapshot {
  const failure = readFailure(transaction);
  const billedAt = transaction.billed_at ?? transaction.payments?.[0]?.captured_at ?? null;

  return {
    providerPaymentId: transaction.id,
    status: mapStatus(transaction.status),
    currency: 'USD',
    amount: readTotal(transaction),
    method: readMethod(transaction),
    approvedAt: billedAt ? new Date(billedAt) : null,
    failureCode: failure.code,
    failureMessage: failure.message,
    // Paddle 응답은 카드 원번호를 포함하지 않는다(마지막 4자리와 타입만 제공).
    raw: transaction as unknown,
  };
}

interface PaddleWebhookBody {
  event_id?: string;
  event_type?: string;
  occurred_at?: string;
  data?: Record<string, unknown>;
}

function mapIntent(eventType: string, data: Record<string, unknown> | undefined): WebhookIntent {
  switch (eventType) {
    case 'transaction.completed':
    case 'transaction.paid':
      return 'PAYMENT_SUCCEEDED';
    case 'transaction.payment_failed':
      return 'PAYMENT_FAILED';
    case 'transaction.canceled':
      return 'PAYMENT_CANCELED';
    case 'adjustment.created':
    case 'adjustment.updated': {
      const action = typeof data?.action === 'string' ? data.action : '';
      const status = typeof data?.status === 'string' ? data.status : '';
      return action === 'refund' && status === 'approved' ? 'REFUND_COMPLETED' : 'IGNORED';
    }
    default:
      return 'IGNORED';
  }
}

/** 이벤트 본문에서 스토어 주문번호를 찾는다. adjustment 이벤트에는 custom_data가 없어 null이 된다. */
function readOrderNo(data: Record<string, unknown> | undefined): string | null {
  const customData = data?.custom_data;
  if (customData && typeof customData === 'object') {
    const orderNo = (customData as Record<string, unknown>).orderNo;
    if (typeof orderNo === 'string' && orderNo.length > 0) return orderNo;
  }
  return null;
}

function readTransactionId(data: Record<string, unknown> | undefined): string | null {
  const direct = data?.id;
  if (typeof direct === 'string' && direct.startsWith('txn_')) return direct;
  const related = data?.transaction_id;
  return typeof related === 'string' && related.length > 0 ? related : null;
}

export const paddleProvider: PaymentProvider = {
  id: 'PADDLE',
  currency: 'USD',

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const serverEnv = getServerEnv();
    const clientEnv = getClientEnv();

    // N4 미결: 템플릿 slug ↔ Paddle price id 매핑이 있으면 카탈로그 가격을 쓰고,
    // 없으면 스토어 DB의 USD 고정가(D4)로 비카탈로그 가격을 즉석 생성한다.
    const priceId = serverEnv.PADDLE_PRICE_ID_MAP_JSON[input.templateSlug];

    const transaction = await createTransaction({
      orderNo: input.orderNo,
      templateId: input.templateId,
      templateSlug: input.templateSlug,
      templateTitle: input.templateTitle,
      amount: input.amount,
      userId: input.buyer.userId,
      customerEmail: input.buyer.email,
      successUrl: input.successUrl,
      priceId,
    });

    return {
      provider: 'PADDLE',
      providerOrderRef: input.orderNo,
      // Paddle은 결제 시작 시점에 거래 식별자를 준다. 이후 재조회의 1순위 키가 된다.
      providerPaymentId: transaction.id,
      clientPayload: {
        kind: 'PADDLE_OVERLAY',
        clientToken: clientEnv.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
        transactionId: transaction.id,
        environment: clientEnv.NEXT_PUBLIC_PADDLE_ENV,
      },
      expiresAt: input.expiresAt,
    };
  },

  async verifyAndParseWebhook(req: RawWebhookRequest): Promise<NormalizedWebhookEvent> {
    verifyPaddleSignature(req);

    let body: PaddleWebhookBody;
    try {
      body = JSON.parse(req.rawBody) as PaddleWebhookBody;
    } catch (error) {
      throw new ProviderApiError(PROVIDER_LABEL, 'Malformed webhook body', { cause: error });
    }

    const eventType = body.event_type ?? 'unknown';
    const data = body.data;

    return {
      // Paddle은 이벤트마다 고유한 event_id를 준다. 없으면 재전송 판별이 불가능하므로 대체 키를 만든다.
      eventId: body.event_id ?? `${eventType}:${body.occurred_at ?? ''}:${readTransactionId(data) ?? ''}`,
      eventType,
      intent: mapIntent(eventType, data),
      providerOrderRef: readOrderNo(data),
      providerPaymentId: readTransactionId(data),
    };
  },

  async fetchPayment(ref: FetchPaymentRef): Promise<ProviderPaymentSnapshot | null> {
    // 1순위: 결제 시작 시 저장해 둔 transaction id. 2순위: custom_data.orderNo로 최근 거래 탐색.
    const transaction = ref.providerPaymentId
      ? await getTransaction(ref.providerPaymentId)
      : await findTransactionByOrderNo(ref.providerOrderRef);

    if (!transaction) return null;
    return toSnapshot(transaction);
  },

  async refund(input: RefundInput): Promise<RefundResult> {
    const adjustment = await createRefundAdjustment({
      transactionId: input.providerPaymentId,
      reason: input.reason,
    });

    return {
      providerRefundId: adjustment.id,
      // Paddle 환불은 승인 절차를 거칠 수 있어 즉시 완료가 아니다. 완료는 adjustment 웹훅이 알려 준다.
      status: adjustment.status === 'approved' ? 'COMPLETED' : 'PENDING',
    };
  },
};
