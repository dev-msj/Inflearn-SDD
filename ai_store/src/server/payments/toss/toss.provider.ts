import 'server-only';

import {
  cancelPayment,
  confirmPayment,
  getPaymentByKey,
  getPaymentByOrderNo,
  sanitizeTossPayment,
  type TossPayment,
} from './toss.client';
import { readTossTransmissionId, verifyTossSignature } from './toss.signature';
import { getClientEnv } from '@/lib/env';
import { ProviderApiError } from '@/lib/errors';
import { orderLogger } from '@/lib/logger';
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
} from '../provider.types';

/**
 * 토스페이먼츠(KRW) PaymentProvider 구현 (F2-AC2/3/10/12).
 *
 * 결제 시작은 서버 호출이 필요 없다. 서버가 orderNo·금액을 확정하고 클라이언트 SDK가 결제창을 연다.
 * 승인(confirm)은 리디렉션 복귀 시점 또는 재조회 배치가 수행한다(N3).
 */

const PROVIDER_LABEL = 'TOSS';

/** 토스 결제 상태 → 공통 상태. 확정(PAID)은 SUCCEEDED에서만 일어난다. */
function mapStatus(status: string): ProviderPaymentStatus {
  switch (status) {
    case 'DONE':
      return 'SUCCEEDED';
    case 'CANCELED':
    case 'PARTIAL_CANCELED':
      return 'CANCELED';
    case 'ABORTED':
      return 'FAILED';
    case 'EXPIRED':
      return 'EXPIRED';
    case 'READY':
    case 'IN_PROGRESS':
    case 'WAITING_FOR_DEPOSIT':
      return 'PENDING';
    default:
      return 'UNKNOWN';
  }
}

function toSnapshot(payment: TossPayment): ProviderPaymentSnapshot {
  return {
    providerPaymentId: payment.paymentKey,
    status: mapStatus(payment.status),
    currency: 'KRW',
    // KRW는 정수 원 단위지만, orders.amount가 numeric(12,2)이므로 소수 2자리 문자열로 정규화한다.
    amount: payment.totalAmount.toFixed(2),
    method: payment.method ?? null,
    approvedAt: payment.approvedAt ? new Date(payment.approvedAt) : null,
    failureCode: payment.failure?.code ?? null,
    failureMessage: payment.failure?.message ?? null,
    raw: sanitizeTossPayment(payment),
  };
}

/** 웹훅 본문에서 결제 데이터를 꺼낸다. 토스는 `data` 래핑과 평면 구조가 모두 존재한다. */
interface TossWebhookBody {
  eventType?: string;
  createdAt?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

function readString(source: Record<string, unknown> | undefined, key: string): string | null {
  const value = source?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function mapIntent(status: string | null): NormalizedWebhookEvent['intent'] {
  switch (status) {
    case 'DONE':
      return 'PAYMENT_SUCCEEDED';
    case 'CANCELED':
    case 'PARTIAL_CANCELED':
      // 승인 후 취소는 환불 완료로 본다. 미승인 취소는 조회 결과가 SUCCEEDED가 아니므로 확정되지 않는다.
      return 'REFUND_COMPLETED';
    case 'ABORTED':
      return 'PAYMENT_FAILED';
    case 'EXPIRED':
      return 'PAYMENT_EXPIRED';
    default:
      return 'IGNORED';
  }
}

export const tossProvider: PaymentProvider = {
  id: 'TOSS',
  currency: 'KRW',

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    // 토스 표준 결제는 결제창 호출 전 서버 API가 필요 없다.
    // 클라이언트에 넘기는 값은 전부 공개 가능한 값(clientKey 등)이며 시크릿은 포함하지 않는다.
    const clientEnv = getClientEnv();

    return {
      provider: 'TOSS',
      providerOrderRef: input.orderNo,
      // paymentKey는 사용자가 결제를 마친 뒤에 생기므로 이 시점에는 없다.
      providerPaymentId: null,
      clientPayload: {
        kind: 'TOSS_WIDGET',
        clientKey: clientEnv.NEXT_PUBLIC_TOSS_CLIENT_KEY,
        orderId: input.orderNo,
        orderName: input.templateTitle,
        // 토스 결제창은 정수 원 금액을 요구한다.
        amount: Math.round(Number(input.amount)),
        customerEmail: input.buyer.email,
        successUrl: input.successUrl,
        failUrl: input.failUrl,
      },
      expiresAt: input.expiresAt,
    };
  },

  async verifyAndParseWebhook(req: RawWebhookRequest): Promise<NormalizedWebhookEvent> {
    verifyTossSignature(req);

    let body: TossWebhookBody;
    try {
      body = JSON.parse(req.rawBody) as TossWebhookBody;
    } catch (error) {
      throw new ProviderApiError(PROVIDER_LABEL, 'Malformed webhook body', { cause: error });
    }

    const data = (body.data ?? body) as Record<string, unknown>;
    const status = readString(data, 'status');
    const orderNo = readString(data, 'orderId');
    const paymentKey = readString(data, 'paymentKey');
    const eventType = body.eventType ?? 'PAYMENT_STATUS_CHANGED';

    // 멱등 키: 전송 ID가 있으면 그것을 쓰고, 없으면 주문+상태+시각 조합으로 결정적 키를 만든다.
    const transmissionId = readTossTransmissionId(req.headers);
    const eventId = transmissionId ?? `${orderNo ?? 'unknown'}:${status ?? 'unknown'}:${body.createdAt ?? ''}`;

    return {
      eventId,
      eventType,
      intent: mapIntent(status),
      providerOrderRef: orderNo,
      providerPaymentId: paymentKey,
      failureCode: readString(data, 'code'),
      failureMessage: readString(data, 'message'),
    };
  },

  /**
   * ★확정의 유일한 근거.
   *
   * N3 대응: 사용자가 리디렉션 전에 브라우저를 닫아 승인(confirm)이 누락되면 토스 결제는
   * IN_PROGRESS 상태로 남고 일정 시간 뒤 자동 취소된다. 이 경우 **배치가 승인까지 대행**하도록
   * 여기서 confirm을 호출한다.
   *
   * ★승인 금액은 반드시 주문 스냅샷 금액(ref.expectedAmount)을 보낸다. 결제사가 보관 중인
   *   totalAmount를 되돌려 보내면 항상 일치해, 토스가 제공하는 금액 불일치 거부가 무력화된다.
   *   스냅샷 금액을 보내면 변조된 결제는 **승인 자체가 일어나지 않는다**(매입 전 차단).
   */
  async fetchPayment(ref: FetchPaymentRef): Promise<ProviderPaymentSnapshot | null> {
    const log = orderLogger(ref.providerOrderRef, { provider: PROVIDER_LABEL });

    let payment = await getPaymentByOrderNo(ref.providerOrderRef);
    if (!payment && ref.providerPaymentId) {
      payment = await getPaymentByKey(ref.providerPaymentId);
    }
    if (!payment) return null;

    if (payment.status === 'IN_PROGRESS' && payment.paymentKey) {
      log.info('toss_confirm_delegated', { reason: 'redirect_missing' });
      payment = await confirmPayment({
        paymentKey: payment.paymentKey,
        orderNo: ref.providerOrderRef,
        // 토스 결제창과 동일하게 정수 원 금액으로 보낸다(createCheckout의 amount와 같은 기준).
        amount: Math.round(Number(ref.expectedAmount)),
      });
    }

    return toSnapshot(payment);
  },

  async refund(input: RefundInput): Promise<RefundResult> {
    const payment = await cancelPayment({
      paymentKey: input.providerPaymentId,
      orderNo: input.orderNo,
      reason: input.reason,
    });

    const cancelKey = payment.cancels?.[0]?.transactionKey ?? payment.paymentKey;
    return {
      providerRefundId: cancelKey,
      // 토스 취소 API는 동기적으로 완료된다. 상태가 예상과 다르면 웹훅이 뒤이어 정정한다.
      status: mapStatus(payment.status) === 'CANCELED' ? 'COMPLETED' : 'PENDING',
    };
  },
};
