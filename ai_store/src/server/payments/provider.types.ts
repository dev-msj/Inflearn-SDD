import 'server-only';

import type { ClientCheckoutPayload, Currency, PaymentProviderId } from '@/types/domain';

/**
 * 결제사 공통 추상화 (TECH_SPEC 5장).
 *
 * 토스페이먼츠(KRW)와 Paddle(USD)의 차이를 이 인터페이스 뒤로 숨겨,
 * order.service·webhook.handler·배치가 결제사를 몰라도 동작하게 만든다(F2-AC2).
 *
 * ★ClientCheckoutPayload는 `@/types/domain`에 선언되어 있고 여기서는 re-export만 한다.
 *   값이 클라이언트 컴포넌트(CheckoutButton / PaddleCheckoutLauncher)까지 전달되어야 하는데,
 *   이 모듈은 `server-only`라 클라이언트가 타입을 import 할 수 없기 때문이다.
 */
export type { ClientCheckoutPayload };

export interface CreateCheckoutInput {
  /** provider_order_ref로 사용된다. 결제사·스토어가 같은 값을 본다. */
  orderNo: string;
  /** Decimal 문자열. 결제 화면 표시 금액 스냅샷과 동일한 값이어야 한다(F2-AC8). */
  amount: string;
  currency: Currency;
  templateId: string;
  /** Paddle price id 매핑(PADDLE_PRICE_ID_MAP_JSON)의 키. TECH_SPEC 원안에 없던 필드를 추가했다. */
  templateSlug: string;
  templateTitle: string;
  buyer: { userId: string; email: string; locale: 'ko' | 'en' };
  successUrl: string;
  failUrl: string;
  expiresAt: Date;
}

export interface CheckoutSession {
  provider: PaymentProviderId;
  providerOrderRef: string;
  /** 결제 시작 시점에 결제사가 거래 식별자를 주는 경우(Paddle)만 채워진다. Toss는 결제 후에 생긴다. */
  providerPaymentId: string | null;
  clientPayload: ClientCheckoutPayload;
  expiresAt: Date;
}

/** Prisma의 ProviderPaymentStatus enum과 값이 1:1로 일치해야 한다(payments 테이블에 그대로 저장). */
export type ProviderPaymentStatus =
  | 'PENDING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELED'
  | 'EXPIRED'
  | 'REFUNDED'
  | 'UNKNOWN';

export interface ProviderPaymentSnapshot {
  providerPaymentId: string;
  status: ProviderPaymentStatus;
  currency: Currency;
  /** 결제사가 실제 승인한 금액(Decimal 문자열). orders.amount와 대조한다(F2-AC8). */
  amount: string;
  method: string | null;
  approvedAt: Date | null;
  failureCode: string | null;
  failureMessage: string | null;
  /** payments.raw_snapshot에 그대로 저장한다. 카드번호 등 민감 필드는 구현체가 제거한 뒤 넘긴다. */
  raw: unknown;
}

export type WebhookIntent =
  | 'PAYMENT_SUCCEEDED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_CANCELED'
  | 'PAYMENT_EXPIRED'
  | 'REFUND_COMPLETED'
  | 'IGNORED';

export interface RawWebhookRequest {
  /** ★서명 검증 대상은 파싱 전 원문이다. JSON.parse 후 재직렬화하면 바이트가 달라져 검증이 깨진다. */
  rawBody: string;
  headers: Headers;
}

export interface NormalizedWebhookEvent {
  /** 결제사 고유 이벤트 ID. webhook_events UNIQUE(provider, event_id)의 멱등 키가 된다(F2-AC6). */
  eventId: string;
  eventType: string;
  intent: WebhookIntent;
  providerOrderRef: string | null;
  providerPaymentId: string | null;
  /** 실패/취소 안내 문구 구성용. 확정 판단에는 쓰지 않는다. */
  failureCode?: string | null;
  failureMessage?: string | null;
}

export interface RefundInput {
  orderNo: string;
  providerPaymentId: string;
  amount: string;
  currency: Currency;
  reason: string;
}

export interface RefundResult {
  providerRefundId: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
}

export interface FetchPaymentRef {
  providerOrderRef: string;
  providerPaymentId?: string | null;
  /**
   * 주문 스냅샷 금액(F2-AC8의 기준값).
   *
   * 승인(confirm)을 대행할 때 결제사에 **이 금액을 그대로 전달**해야 한다. 결제사가 보관 중인
   * 금액을 되돌려 보내면 "가맹점이 의도한 금액과 실제 결제 금액이 다르면 결제사가 거부한다"는
   * 방어 장치가 항상 일치로 통과해 무력화된다. 그 경우 확정은 assertAmountMatches()가 막지만,
   * 사용자 카드에서는 이미 승인·매입이 끝난 뒤라 수동 환불이 필요한 금전 사고가 된다.
   */
  expectedAmount: string;
}

/** 토스페이먼츠·Paddle을 동일하게 다루기 위한 공통 인터페이스. */
export interface PaymentProvider {
  readonly id: PaymentProviderId;
  readonly currency: Currency;

  /** 결제 시작: 결제사에 거래를 생성하고 클라이언트 결제창 payload를 반환한다. */
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;

  /** 웹훅 서명·발신자 검증 후 정규화. 실패 시 WebhookSignatureError를 던진다. */
  verifyAndParseWebhook(req: RawWebhookRequest): Promise<NormalizedWebhookEvent>;

  /**
   * ★확정의 유일한 근거. 웹훅 본문이 아니라 이 결과로만 상태를 전이한다.
   * 거래를 찾지 못하면 null을 반환한다(아직 결제 시도가 없는 경우).
   */
  fetchPayment(ref: FetchPaymentRef): Promise<ProviderPaymentSnapshot | null>;

  /** 전액 환불. MVP는 부분 환불을 지원하지 않는다. */
  refund(input: RefundInput): Promise<RefundResult>;
}
