import type {
  AccessDenialReason,
  Currency,
  OrderEventSource,
  OrderStatus,
  RefundIneligibleReason,
} from '@/types/domain';

/**
 * AppError 계층.
 *
 * 설계 원칙
 *  1) 도메인 규칙 위반은 예외로 표현하고, HTTP 상태·오류 코드를 예외가 스스로 알고 있게 한다.
 *     → Route Handler는 `jsonError(e)` 한 줄로 TECH_SPEC 7장 응답 규격을 만족한다.
 *  2) `expose`가 false인 예외의 message는 클라이언트로 내보내지 않는다(내부 구조 노출 방지).
 *  3) 사용자 안내 문구는 서버 message가 아니라 messages/{ko,en}.json의 `errors.codes.<code>` 키로
 *     렌더한다. 서버 message는 로그·디버깅용이다.
 */

export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'TEMPLATE_NOT_FOUND'
  | 'TEMPLATE_NOT_PURCHASABLE'
  | 'ALREADY_OWNED'
  | 'POLICY_NOT_AGREED'
  | 'EMAIL_TAKEN'
  | 'ORDER_NOT_FOUND'
  | 'INVALID_ORDER_TRANSITION'
  | 'REFUND_INELIGIBLE'
  | 'AMOUNT_MISMATCH'
  | 'WEBHOOK_SIGNATURE_INVALID'
  | 'CRON_UNAUTHORIZED'
  | 'PROVIDER_API_ERROR'
  | 'INTERNAL_ERROR';

export interface AppErrorOptions {
  details?: unknown;
  cause?: unknown;
  /** message를 클라이언트 응답에 포함해도 되는지. 기본값은 status < 500 */
  expose?: boolean;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(code: AppErrorCode, status: number, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = options.details;
    this.expose = options.expose ?? status < 500;
  }
}

// ─────────────────────────────────────────────────────────────
// 일반 오류
// ─────────────────────────────────────────────────────────────

export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', details?: unknown) {
    super('VALIDATION_ERROR', 400, message, { details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super('FORBIDDEN', 403, message);
  }
}

/**
 * 리소스가 없거나, 존재하더라도 요청자에게 보여줄 수 없는 경우 모두 이 예외를 쓴다.
 * 타인의 주문을 403이 아닌 404로 응답해야 주문 존재 여부가 노출되지 않는다(비기능 보안 요구).
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code: AppErrorCode = 'NOT_FOUND') {
    super(code, 404, message);
  }
}

export class InternalError extends AppError {
  constructor(message = 'Internal server error', cause?: unknown) {
    super('INTERNAL_ERROR', 500, message, { cause, expose: false });
  }
}

// ─────────────────────────────────────────────────────────────
// 카탈로그 · 계정
// ─────────────────────────────────────────────────────────────

export class TemplateNotFoundError extends AppError {
  constructor(readonly slugOrId: string) {
    super('TEMPLATE_NOT_FOUND', 404, `Template not found: ${slugOrId}`);
  }
}

/** 판매 중지·삭제된 템플릿의 결제 시도 (F1-AC8, F2-AC7 보조). */
export class TemplateNotPurchasableError extends AppError {
  constructor(readonly templateSlug: string) {
    super('TEMPLATE_NOT_PURCHASABLE', 409, `Template is not purchasable: ${templateSlug}`);
  }
}

export class EmailTakenError extends AppError {
  constructor() {
    // 이메일 원문은 message에 담지 않는다(로그·응답을 통한 계정 열거 방지).
    super('EMAIL_TAKEN', 409, 'Email is already registered');
  }
}

// ─────────────────────────────────────────────────────────────
// 결제 · 주문
// ─────────────────────────────────────────────────────────────

/**
 * 이미 보유한 템플릿의 재구매 시도 (F2-AC7).
 * 화면은 이 오류를 받아 "이미 보유한 템플릿입니다" 안내 + 라이브러리 이동 경로를 제공한다.
 */
export class AlreadyOwnedError extends AppError {
  constructor(readonly templateId: string) {
    super('ALREADY_OWNED', 409, 'Template is already owned', { details: { templateId } });
  }
}

/** 환불 정책 미동의 상태의 결제 시도 (F2-AC12). */
export class PolicyNotAgreedError extends AppError {
  constructor() {
    super('POLICY_NOT_AGREED', 400, 'Refund policy must be agreed before checkout');
  }
}

export class OrderNotFoundError extends AppError {
  constructor(readonly orderNo: string) {
    super('ORDER_NOT_FOUND', 404, `Order not found: ${orderNo}`);
  }
}

/**
 * 상태 머신이 허용하지 않는 전이 (TECH_SPEC 2.4).
 * 웹훅 경로에서는 이 예외를 잡아 200 + webhook_events.status='SKIPPED'로 기록한다.
 * 결제사에 5xx를 돌려주면 무한 재시도를 유발하기 때문이다.
 */
export class InvalidOrderTransitionError extends AppError {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
    readonly source: OrderEventSource,
  ) {
    super('INVALID_ORDER_TRANSITION', 409, `Invalid order transition: ${from} -> ${to} (${source})`, {
      details: { from, to, source },
    });
  }
}

/**
 * 결제사 승인 금액과 주문 스냅샷 금액 불일치 (F2-AC8).
 * TECH_SPEC 11장 N7 가정: 자동 환불하지 않고 확정을 보류한 뒤 reconcile_state='INCIDENT'로 기록한다.
 * 자동 환불로 정책이 바뀌면 이 예외를 잡는 곳(order.service.confirmOrderPaid)만 수정하면 된다.
 */
export class AmountMismatchError extends AppError {
  constructor(
    readonly orderNo: string,
    readonly expected: { amount: string; currency: Currency },
    readonly actual: { amount: string; currency: Currency },
  ) {
    super('AMOUNT_MISMATCH', 409, `Payment amount mismatch for order ${orderNo}`, {
      details: { expected, actual },
      expose: false,
    });
  }
}

/** 웹훅 서명·발신자 검증 실패. 이 경우에만 401을 반환하고 어떤 상태도 전이하지 않는다. */
export class WebhookSignatureError extends AppError {
  constructor(message = 'Webhook signature verification failed') {
    super('WEBHOOK_SIGNATURE_INVALID', 401, message, { expose: false });
  }
}

/** /api/cron/* 의 x-cron-secret 불일치. */
export class CronAuthError extends AppError {
  constructor() {
    super('CRON_UNAUTHORIZED', 401, 'Invalid cron secret', { expose: false });
  }
}

/** 결제사 API 호출 실패. 재조회 배치가 재시도하므로 사용자에게는 일시적 오류로 안내한다. */
export class ProviderApiError extends AppError {
  constructor(
    readonly provider: string,
    message: string,
    options: { status?: number; details?: unknown; cause?: unknown } = {},
  ) {
    super('PROVIDER_API_ERROR', 502, `[${provider}] ${message}`, {
      details: options.details,
      cause: options.cause,
      expose: false,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// 라이브러리 · 환불
// ─────────────────────────────────────────────────────────────

/**
 * 전문 접근 게이트(assertTemplateAccess)의 단일 실패 예외 (F3-AC5, F3-AC9).
 * reason에 따라 화면이 분기한다:
 *   NOT_AUTHENTICATED → 로그인 화면(callbackUrl 유지)
 *   NOT_OWNED         → 템플릿 상세 페이지
 *   REFUNDED          → "환불 처리된 템플릿입니다" 안내
 * 어느 경우에도 body는 조회조차 하지 않는다.
 */
export class AccessDeniedError extends AppError {
  constructor(readonly reason: AccessDenialReason) {
    super(reason === 'NOT_AUTHENTICATED' ? 'UNAUTHORIZED' : 'FORBIDDEN', reason === 'NOT_AUTHENTICATED' ? 401 : 403, `Access denied: ${reason}`, {
      details: { reason },
    });
  }
}

/** 환불 자격 미충족 (F2-AC12). 422로 응답하며 details.reason으로 사유를 전달한다. */
export class RefundIneligibleError extends AppError {
  constructor(readonly reason: RefundIneligibleReason) {
    super('REFUND_INELIGIBLE', 422, `Refund is not eligible: ${reason}`, { details: { reason } });
  }
}

// ─────────────────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────────────────

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** 알 수 없는 예외를 AppError로 정규화한다. 원본 메시지는 cause로만 보존한다. */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (error instanceof Error) return new InternalError(error.message, error);
  return new InternalError('Unknown error', error);
}
