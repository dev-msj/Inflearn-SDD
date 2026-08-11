import 'server-only';

import { getServerEnv } from '@/lib/env';
import { ProviderApiError } from '@/lib/errors';

/**
 * Paddle Billing API v1 클라이언트.
 *
 * ★TECH_SPEC과 다르게 구현한 부분 (동작하는 코드 우선)
 *   스펙은 `@paddle/paddle-node-sdk` 사용을 명시하지만, SDK는 메이저 버전마다 메서드 시그니처와
 *   응답 래핑이 달라져 타입 안전성을 보장하기 어렵다. 여기서는 Paddle이 문서로 고정한 REST 규격
 *   (Bearer 인증, `{ data }` 래핑, 최소 단위 정수 금액)만 사용해 fetch로 직접 호출한다.
 *   웹훅 서명 검증도 paddle.signature.ts가 자체 구현하므로 SDK 의존이 필요 없다.
 */

const PROVIDER_LABEL = 'PADDLE';

const API_BASE_URL = {
  sandbox: 'https://sandbox-api.paddle.com',
  production: 'https://api.paddle.com',
} as const;

/** Paddle이 요구하는 API 버전 헤더. 응답 스키마가 예고 없이 바뀌는 것을 막는다. */
const PADDLE_API_VERSION = '1';

export interface PaddleTransaction {
  id: string;
  status: string;
  currency_code?: string;
  custom_data?: Record<string, unknown> | null;
  billed_at?: string | null;
  created_at?: string | null;
  details?: {
    totals?: { total?: string; grand_total?: string; currency_code?: string };
  } | null;
  payments?: Array<{
    status?: string;
    method_details?: { type?: string } | null;
    error_code?: string | null;
    captured_at?: string | null;
  }> | null;
  [key: string]: unknown;
}

export interface PaddleAdjustment {
  id: string;
  status: string;
  action: string;
  transaction_id: string;
  [key: string]: unknown;
}

interface PaddleEnvelope<T> {
  data?: T;
  error?: { type?: string; code?: string; detail?: string };
}

/**
 * Decimal 문자열 → Paddle 최소 단위 정수 문자열 (USD는 센트).
 * 부동소수 오차를 피하기 위해 문자열을 직접 다룬다.
 */
export function toMinorUnits(amount: string): string {
  const [whole = '0', fraction = ''] = amount.trim().split('.');
  const paddedFraction = `${fraction}00`.slice(0, 2);
  const normalized = `${whole}${paddedFraction}`.replace(/^(-?)0+(?=\d)/, '$1');
  return normalized === '' ? '0' : normalized;
}

/** Paddle 최소 단위 정수 문자열 → Decimal 문자열. */
export function fromMinorUnits(minor: string): string {
  const negative = minor.startsWith('-');
  const digits = (negative ? minor.slice(1) : minor).padStart(3, '0');
  const whole = digits.slice(0, -2);
  const fraction = digits.slice(-2);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

function apiBaseUrl(): string {
  return API_BASE_URL[getServerEnv().PADDLE_ENV];
}

interface PaddleRequestOptions {
  path: string;
  method: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  nullOnNotFound?: boolean;
}

async function request<T>(options: PaddleRequestOptions): Promise<T | null> {
  const env = getServerEnv();

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${options.path}`, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${env.PADDLE_API_KEY}`,
        'Content-Type': 'application/json',
        'Paddle-Version': PADDLE_API_VERSION,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store',
    });
  } catch (error) {
    throw new ProviderApiError(PROVIDER_LABEL, `Request failed: ${options.method} ${options.path}`, {
      cause: error,
    });
  }

  const text = await response.text();
  let parsed: PaddleEnvelope<T> | null = null;
  try {
    parsed = text ? (JSON.parse(text) as PaddleEnvelope<T>) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    if (options.nullOnNotFound && response.status === 404) return null;
    throw new ProviderApiError(PROVIDER_LABEL, parsed?.error?.detail ?? `HTTP ${response.status}`, {
      status: response.status,
      details: { code: parsed?.error?.code },
    });
  }

  return parsed?.data ?? null;
}

export interface CreateTransactionInput {
  orderNo: string;
  templateId: string;
  templateSlug: string;
  templateTitle: string;
  /** Decimal 문자열(USD) */
  amount: string;
  userId: string;
  customerEmail: string;
  successUrl: string;
  /** 카탈로그에 등록된 price id. 없으면 비카탈로그 가격으로 즉석 생성한다(N4 미결 대응). */
  priceId?: string;
}

export async function createTransaction(input: CreateTransactionInput): Promise<PaddleTransaction> {
  const items = input.priceId
    ? [{ price_id: input.priceId, quantity: 1 }]
    : [
        {
          quantity: 1,
          price: {
            name: input.templateTitle,
            description: input.templateTitle,
            unit_price: { amount: toMinorUnits(input.amount), currency_code: 'USD' },
            product: { name: input.templateTitle, tax_category: 'standard' },
          },
        },
      ];

  const transaction = await request<PaddleTransaction>({
    path: '/transactions',
    method: 'POST',
    body: {
      items,
      // ★orderNo를 custom_data에 실어 웹훅에서 주문을 역추적한다(웹훅 본문 신뢰가 아니라 매칭 용도).
      custom_data: { orderNo: input.orderNo, templateId: input.templateId, userId: input.userId },
      customer: { email: input.customerEmail },
      checkout: { url: input.successUrl },
      collection_mode: 'automatic',
    },
  });

  if (!transaction) {
    throw new ProviderApiError(PROVIDER_LABEL, 'Empty transaction response');
  }
  return transaction;
}

export async function getTransaction(transactionId: string): Promise<PaddleTransaction | null> {
  return request<PaddleTransaction>({
    path: `/transactions/${encodeURIComponent(transactionId)}`,
    method: 'GET',
    nullOnNotFound: true,
  });
}

/** 최근 거래를 한 페이지 읽어 custom_data.orderNo로 찾는다. transaction id를 잃어버린 경우의 보조 경로다. */
export async function findTransactionByOrderNo(orderNo: string): Promise<PaddleTransaction | null> {
  const transactions = await request<PaddleTransaction[]>({
    path: '/transactions?per_page=100&order_by=created_at[DESC]',
    method: 'GET',
    nullOnNotFound: true,
  });
  if (!transactions) return null;

  return transactions.find((tx) => tx.custom_data?.orderNo === orderNo) ?? null;
}

export interface CreateRefundInput {
  transactionId: string;
  reason: string;
}

/** 전액 환불. Paddle은 환불을 adjustment(type=full)로 표현한다. */
export async function createRefundAdjustment(input: CreateRefundInput): Promise<PaddleAdjustment> {
  const adjustment = await request<PaddleAdjustment>({
    path: '/adjustments',
    method: 'POST',
    body: {
      action: 'refund',
      transaction_id: input.transactionId,
      type: 'full',
      reason: input.reason,
    },
  });

  if (!adjustment) {
    throw new ProviderApiError(PROVIDER_LABEL, 'Empty adjustment response');
  }
  return adjustment;
}
