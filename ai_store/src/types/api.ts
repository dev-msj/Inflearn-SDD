/**
 * API 요청/응답 DTO (TECH_SPEC 7장).
 *
 * ★모든 공개 응답 타입에 body(프롬프트 전문) 필드가 존재하지 않는다(F1-AC6).
 *   전문이 나가는 유일한 경로는 라이브러리 다운로드 라우트의 text/plain 응답이며,
 *   그 경로는 JSON DTO를 사용하지 않는다.
 * 이 파일도 클라이언트에서 import 되므로 domain.ts 외의 의존을 두지 않는다.
 */

import type {
  ClientCheckoutPayload,
  Currency,
  LibraryListItem,
  OrderStatus,
  OrderStatusView,
  PaymentProviderId,
  RefundIneligibleReason,
  RefundReasonCode,
  RefundStatus,
  TemplateCardView,
  TemplatePreviewView,
} from './domain';

// ─────────────────────────────────────────────────────────────
// 공통
// ─────────────────────────────────────────────────────────────

/** 모든 오류 응답 형식: `{ "error": { "code", "message", "details"? } }` */
export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  error: ApiErrorPayload;
}

/** 목록 응답 공통 페이지네이션 필드. */
export interface Paginated {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─────────────────────────────────────────────────────────────
// 공개 API — 템플릿
// ─────────────────────────────────────────────────────────────

/** GET /api/templates 쿼리. 파싱·기본값 적용은 Zod 스키마가 담당한다. */
export interface ListTemplatesQuery {
  q?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}

/** 한 페이지 기본 크기. PRD F1-AC1의 "20개 단위" 요구를 상수로 고정한다. */
export const DEFAULT_PAGE_SIZE = 20;

export interface ListTemplatesResponse extends Paginated {
  items: TemplateCardView[];
}

/** GET /api/templates/[slug] */
export interface TemplateDetailResponse {
  template: TemplatePreviewView;
  /** status === 'ON_SALE' && deletedAt === null (F1-AC8) */
  isPurchasable: boolean;
}

// ─────────────────────────────────────────────────────────────
// 인증
// ─────────────────────────────────────────────────────────────

/** POST /api/auth/signup */
export interface SignupRequest {
  email: string;
  password: string;
  name?: string;
  locale: 'ko' | 'en';
}

export interface SignupResponse {
  userId: string;
}

// ─────────────────────────────────────────────────────────────
// 결제 · 주문
// ─────────────────────────────────────────────────────────────

/** POST /api/checkout */
export interface CreateCheckoutRequest {
  templateSlug: string;
  currency: Currency;
  /** 환불 정책 동의 없이는 결제를 시작할 수 없다(F2-AC12). true 외의 값은 400 POLICY_NOT_AGREED. */
  policyAgreed: true;
}

/** 201 응답. order.service.startCheckout()의 반환값과 동일한 형태다. */
export interface CreateCheckoutResponse {
  orderNo: string;
  provider: PaymentProviderId;
  /** Decimal 직렬화 문자열. 결제 화면 표시 금액 스냅샷(F2-AC8) */
  amount: string;
  currency: Currency;
  clientPayload: ClientCheckoutPayload;
  expiresAt: string;
}

/** GET /api/orders/[orderNo] — 타인 주문도 404로 응답한다(존재 여부 노출 금지). */
export type OrderStatusResponse = OrderStatusView;

/** POST /api/orders/[orderNo]/refund */
export interface RefundRequestBody {
  reasonCode: RefundReasonCode;
  reasonText?: string;
}

export interface RefundAcceptedResponse {
  refundId: string;
  status: RefundStatus;
}

/** 422 REFUND_INELIGIBLE 응답의 details. 화면은 reason으로 안내 문구를 선택한다. */
export interface RefundIneligibleDetails {
  reason: RefundIneligibleReason;
}

// ─────────────────────────────────────────────────────────────
// 라이브러리
// ─────────────────────────────────────────────────────────────

/** GET /api/library */
export interface LibraryListResponse {
  items: LibraryListItem[];
}

// ─────────────────────────────────────────────────────────────
// 웹훅 · 배치
// ─────────────────────────────────────────────────────────────

/**
 * 웹훅 응답. 처리 중 내부 오류가 나도 200 + ok:true로 응답해 결제사 재시도 폭주를 막고,
 * 실패는 webhook_events.status='FAILED'로 기록해 재조회 배치가 구제한다.
 */
export interface WebhookAckResponse {
  ok: boolean;
  /** UNIQUE(provider, event_id) 위반으로 중복 이벤트임이 확인된 경우 true (F2-AC6) */
  deduped?: boolean;
}

/** POST /api/cron/reconcile-payments */
export interface ReconcilePaymentsResponse {
  scanned: number;
  confirmed: number;
  failed: number;
  expired: number;
  /** 24시간 초과 미확정 건수 (F2-AC11) */
  incidents: number;
}

/** POST /api/cron/expire-orders */
export interface ExpireOrdersResponse {
  expired: number;
}

// ─────────────────────────────────────────────────────────────
// 재수출 (클라이언트가 DTO만 import 해도 되도록)
// ─────────────────────────────────────────────────────────────

export type { OrderStatus, TemplateCardView, TemplatePreviewView, LibraryListItem };
