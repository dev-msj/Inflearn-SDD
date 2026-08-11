import 'server-only';

import { getServerEnv } from '@/lib/env';
import { ProviderApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';

/**
 * 토스페이먼츠 Payments API v1 클라이언트.
 *
 * - 인증: `Authorization: Basic base64(secretKey + ':')` (시크릿 키는 서버에서만 읽는다)
 * - 조회 API(`/v1/payments/orders/{orderNo}`)는 paymentKey를 확보하지 못한 상황에서도 호출할 수 있어
 *   재조회 배치의 핵심 수단이 된다(D5).
 * - 승인(confirm)에는 Idempotency-Key를 붙인다. 배치와 리디렉션이 같은 주문을 동시에 승인해도
 *   이중 매입이 발생하지 않게 하기 위함이다(N3 대응).
 */

const PROVIDER_LABEL = 'TOSS';

/** 결제사 응답 중 스토어가 사용하는 필드만 선언한다. 나머지는 raw_snapshot으로만 보존한다. */
export interface TossPayment {
  paymentKey: string;
  orderId: string;
  status: string;
  totalAmount: number;
  balanceAmount?: number;
  currency?: string;
  method?: string | null;
  approvedAt?: string | null;
  requestedAt?: string | null;
  failure?: { code?: string; message?: string } | null;
  cancels?: Array<{ transactionKey?: string; cancelAmount?: number; canceledAt?: string }> | null;
  [key: string]: unknown;
}

interface TossErrorBody {
  code?: string;
  message?: string;
}

/** 조회 대상 결제가 아직 없을 때 토스가 돌려주는 코드. 이 경우만 null로 정규화한다. */
const NOT_FOUND_CODES = new Set(['NOT_FOUND_PAYMENT', 'NOT_FOUND_PAYMENT_SESSION']);

/**
 * raw_snapshot 저장 전 민감 필드를 제거한다 (비기능 요구: 카드정보 미보관).
 * 키 이름 기반 재귀 삭제라, 응답 스펙이 바뀌어도 새 필드가 그대로 새지 않는다.
 */
const SENSITIVE_KEYS = new Set([
  'number',
  'cardnumber',
  'accountnumber',
  'customermobilephone',
  'customeremail',
  'customername',
  'secret',
  'receipturl',
]);

export function sanitizeTossPayment(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeTossPayment(item, depth + 1));

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : sanitizeTossPayment(item, depth + 1);
  }
  return output;
}

function authorizationHeader(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
}

interface TossRequestOptions {
  path: string;
  method: 'GET' | 'POST';
  body?: unknown;
  idempotencyKey?: string;
  /** true면 404/NOT_FOUND 계열 응답을 예외 대신 null로 반환한다. */
  nullOnNotFound?: boolean;
}

async function request(options: TossRequestOptions): Promise<TossPayment | null> {
  const env = getServerEnv();
  const url = `${env.TOSS_API_BASE_URL}${options.path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method,
      headers: {
        Authorization: authorizationHeader(env.TOSS_SECRET_KEY),
        'Content-Type': 'application/json',
        ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      // 결제사 응답은 절대 캐시하지 않는다.
      cache: 'no-store',
    });
  } catch (error) {
    throw new ProviderApiError(PROVIDER_LABEL, `Request failed: ${options.method} ${options.path}`, {
      cause: error,
    });
  }

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const errorBody = (parsed ?? {}) as TossErrorBody;
    if (options.nullOnNotFound && (response.status === 404 || NOT_FOUND_CODES.has(errorBody.code ?? ''))) {
      return null;
    }
    throw new ProviderApiError(PROVIDER_LABEL, errorBody.message ?? `HTTP ${response.status}`, {
      status: response.status,
      details: { code: errorBody.code },
    });
  }

  return parsed as TossPayment;
}

/** 주문번호(orderNo)로 결제 조회. paymentKey를 모르는 배치 경로의 진입점이다. */
export async function getPaymentByOrderNo(orderNo: string): Promise<TossPayment | null> {
  return request({
    path: `/v1/payments/orders/${encodeURIComponent(orderNo)}`,
    method: 'GET',
    nullOnNotFound: true,
  });
}

export async function getPaymentByKey(paymentKey: string): Promise<TossPayment | null> {
  return request({
    path: `/v1/payments/${encodeURIComponent(paymentKey)}`,
    method: 'GET',
    nullOnNotFound: true,
  });
}

export interface ConfirmPaymentInput {
  paymentKey: string;
  orderNo: string;
  amount: number;
}

/**
 * 승인(매입) API.
 * ★이 호출은 "결제 승인"일 뿐 "주문 확정"이 아니다. 주문 상태는 여전히 CONFIRMING이며,
 *   PAID 전이는 웹훅/배치가 조회 API로 재확인한 뒤에만 일어난다(F2-AC5).
 */
export async function confirmPayment(input: ConfirmPaymentInput): Promise<TossPayment> {
  const payment = await request({
    path: '/v1/payments/confirm',
    method: 'POST',
    body: { paymentKey: input.paymentKey, orderId: input.orderNo, amount: input.amount },
    idempotencyKey: `confirm:${input.orderNo}`,
  });

  if (!payment) {
    throw new ProviderApiError(PROVIDER_LABEL, 'Empty confirm response');
  }
  logger.info('toss_payment_confirmed', { orderNo: input.orderNo, provider: PROVIDER_LABEL });
  return payment;
}

export interface CancelPaymentInput {
  paymentKey: string;
  orderNo: string;
  reason: string;
}

/** 전액 취소(환불). 부분 취소는 MVP 범위 밖이라 cancelAmount를 보내지 않는다. */
export async function cancelPayment(input: CancelPaymentInput): Promise<TossPayment> {
  const payment = await request({
    path: `/v1/payments/${encodeURIComponent(input.paymentKey)}/cancel`,
    method: 'POST',
    body: { cancelReason: input.reason },
    idempotencyKey: `cancel:${input.orderNo}`,
  });

  if (!payment) {
    throw new ProviderApiError(PROVIDER_LABEL, 'Empty cancel response');
  }
  return payment;
}
