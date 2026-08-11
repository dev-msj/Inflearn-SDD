import { createHmac } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 웹훅 멱등성 단위 테스트 (F2-AC6).
 *
 * PRD: "동일 웹훅이 중복 수신되어도 주문과 라이브러리 항목은 1건만 생성된다(중복 지급 없음)."
 *
 * DB·결제사 샌드박스 없이 돌아야 하므로
 *  - `@/lib/db` 는 `webhook_events UNIQUE(provider, event_id)` 를 흉내 내는 인메모리 저장소로 대체하고
 *    (중복 INSERT 시 실제 Prisma P2002 예외를 던져 `isUniqueViolation` 경로를 그대로 태운다)
 *  - 결제사 클라이언트(toss.client / paddle.client)는 고정 스냅샷을 돌려주도록 대체한다.
 * 서명 검증·정규화·파이프라인 분기는 **실제 구현을 그대로** 사용한다.
 */

// ─────────────────────────────────────────────────────────────
// 인메모리 상태 (vi.mock 팩토리는 호이스팅되므로 vi.hoisted로 먼저 만든다)
// ─────────────────────────────────────────────────────────────

interface WebhookEventRow {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  signatureVerified: boolean;
  status: string;
  orderId: string | null;
  error: string | null;
}

const store = vi.hoisted(() => ({
  rows: new Map<string, WebhookEventRow>(),
  sequence: 0,
  /** 조회 API가 돌려줄 결제 상태. 테스트별로 바꿔 확정 가능/불가 경로를 만든다. */
  tossStatus: 'DONE',
  paddleStatus: 'completed',
  /** confirmOrderPaid 가 이미 확정한 주문 (order.service의 FOR UPDATE 상태 가드를 흉내). */
  confirmedOrders: new Set<string>(),
}));

const spies = vi.hoisted(() => ({
  confirmOrderPaid: vi.fn(),
  markOrderFailed: vi.fn(),
  completeRefund: vi.fn(),
  sendPurchaseConfirmationEmail: vi.fn(),
}));

// ─────────────────────────────────────────────────────────────
// 모킹
// ─────────────────────────────────────────────────────────────

const TOSS_WEBHOOK_SECRET = 'whsec_toss_idempotency_test';
const PADDLE_NOTIFICATION_SECRET = 'pdl_ntfset_idempotency_test';

vi.mock('@/lib/env', () => ({
  getServerEnv: () => ({
    TOSS_WEBHOOK_SECRET,
    TOSS_WEBHOOK_ALLOWED_IPS: undefined,
    PADDLE_NOTIFICATION_SECRET,
    PADDLE_PRICE_ID_MAP_JSON: {},
    TOSS_API_BASE_URL: 'https://api.tosspayments.com',
    TOSS_SECRET_KEY: 'test_sk',
    PADDLE_API_KEY: 'test_pdl',
    PADDLE_ENV: 'sandbox',
    APP_BASE_URL: 'http://localhost:3000',
  }),
  getClientEnv: () => ({
    NEXT_PUBLIC_TOSS_CLIENT_KEY: 'test_ck',
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: 'test_token',
    NEXT_PUBLIC_PADDLE_ENV: 'sandbox' as const,
  }),
  isProduction: () => false,
}));

/** `webhook_events UNIQUE(provider, event_id)` 를 그대로 재현한 인메모리 Prisma 대체. */
vi.mock('@/lib/db', async () => {
  const { Prisma } = await import('@prisma/client');

  function uniqueViolation(): Error {
    return new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`provider`,`event_id`)',
      { code: 'P2002', clientVersion: 'test', meta: { target: ['provider', 'event_id'] } },
    );
  }

  return {
    db: {
      webhookEvent: {
        // ★검사와 삽입 사이에 await가 없어야 동시 호출에서도 정확히 1건만 선점된다.
        create(args: { data: Record<string, unknown> }) {
          const data = args.data;
          const provider = String(data.provider);
          const eventId = String(data.eventId);
          const key = `${provider}::${eventId}`;

          if (store.rows.has(key)) return Promise.reject(uniqueViolation());

          store.sequence += 1;
          const row: WebhookEventRow = {
            id: `whe_${store.sequence}`,
            provider,
            eventId,
            eventType: String(data.eventType),
            signatureVerified: data.signatureVerified === true,
            status: String(data.status),
            orderId: (data.orderId as string | undefined) ?? null,
            error: (data.error as string | undefined) ?? null,
          };
          store.rows.set(key, row);
          return Promise.resolve({ id: row.id });
        },

        update(args: { where: { id: string }; data: Record<string, unknown> }) {
          for (const row of store.rows.values()) {
            if (row.id !== args.where.id) continue;
            if (typeof args.data.status === 'string') row.status = args.data.status;
            if (typeof args.data.orderId === 'string') row.orderId = args.data.orderId;
            if (typeof args.data.error === 'string') row.error = args.data.error;
            return Promise.resolve(row);
          }
          return Promise.reject(new Error(`webhook_events row not found: ${args.where.id}`));
        },
      },
    },
    CONFIRM_TX_OPTIONS: { maxWait: 5_000, timeout: 10_000 },
  };
});

vi.mock('@/server/orders/order.repository', async () => {
  const { Prisma } = await import('@prisma/client');

  return {
    isUniqueViolation: (error: unknown): boolean =>
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002',
    // 웹훅에 실린 주문번호는 항상 존재하는 주문이라고 가정한다(주문 조회 자체는 이 테스트 범위 밖).
    // 금액을 함께 돌려준다 — 핸들러가 승인 대행용 기준 금액(expectedAmount)으로 결제사에 전달한다.
    // (금액은 리터럴로 둔다. vi.mock 팩토리는 호이스팅되어 파일 하단 상수보다 먼저 평가된다.)
    findOrderConfirmRefByNo: (orderNo: string): Promise<{ id: string; amount: string } | null> =>
      Promise.resolve({ id: `order-of-${orderNo}`, amount: '12000.00' }),
    findOrderNoByProviderPaymentId: (): Promise<string | null> => Promise.resolve(null),
  };
});

vi.mock('@/server/orders/order.service', () => ({
  confirmOrderPaid: spies.confirmOrderPaid,
  markOrderFailed: spies.markOrderFailed,
}));

vi.mock('@/server/mail/mailer', () => ({
  sendPurchaseConfirmationEmail: spies.sendPurchaseConfirmationEmail,
}));

vi.mock('@/server/refunds/refund.service', () => ({
  completeRefund: spies.completeRefund,
}));

vi.mock('@/server/payments/toss/toss.client', () => ({
  getPaymentByOrderNo: (orderNo: string) =>
    Promise.resolve({
      paymentKey: 'pk_test_idempotency',
      orderId: orderNo,
      status: store.tossStatus,
      totalAmount: 12000,
      currency: 'KRW',
      method: '카드',
      approvedAt: '2026-08-10T12:00:00+09:00',
    }),
  getPaymentByKey: () => Promise.resolve(null),
  confirmPayment: () => Promise.reject(new Error('confirmPayment must not be called in this test')),
  cancelPayment: () => Promise.reject(new Error('cancelPayment must not be called in this test')),
  sanitizeTossPayment: (value: unknown) => value,
}));

vi.mock('@/server/payments/paddle/paddle.client', () => ({
  getTransaction: (transactionId: string) =>
    Promise.resolve({
      id: transactionId,
      status: store.paddleStatus,
      details: { totals: { grand_total: '1990', currency_code: 'USD' } },
      billed_at: '2026-08-10T03:00:00Z',
    }),
  findTransactionByOrderNo: () => Promise.resolve(null),
  createTransaction: () => Promise.reject(new Error('createTransaction must not be called')),
  createRefundAdjustment: () => Promise.reject(new Error('createRefundAdjustment must not be called')),
  toMinorUnits: (amount: string) => String(Math.round(Number(amount) * 100)),
  fromMinorUnits: (minor: string) => (Number(minor) / 100).toFixed(2),
}));

const { handleIncomingWebhook } = await import('@/server/payments/webhook.handler');

// ─────────────────────────────────────────────────────────────
// 요청 빌더
// ─────────────────────────────────────────────────────────────

const NOW_SECONDS = () => Math.floor(Date.now() / 1000);
const ORDER_NO = 'AS-20260810-ABCD1234';

/** 토스 웹훅 요청. 라우트는 본문을 건드리지 않으므로 rawBody 그대로 서명한다. */
function tossRequest(options: { transmissionId: string; status?: string }): Request {
  const rawBody = JSON.stringify({
    eventType: 'PAYMENT_STATUS_CHANGED',
    createdAt: '2026-08-10T12:00:00+09:00',
    data: {
      orderId: ORDER_NO,
      status: options.status ?? 'DONE',
      paymentKey: 'pk_test_idempotency',
    },
  });
  const transmissionTime = String(NOW_SECONDS());
  const signature = createHmac('sha256', TOSS_WEBHOOK_SECRET)
    .update(`${options.transmissionId}.${transmissionTime}.${rawBody}`, 'utf8')
    .digest('base64');

  return new Request('http://localhost:3000/api/webhooks/toss', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'tosspayments-webhook-transmission-id': options.transmissionId,
      'tosspayments-webhook-transmission-time': transmissionTime,
      'tosspayments-webhook-signature': signature,
    },
    body: rawBody,
  });
}

/** 서명이 위조된 토스 웹훅. */
function forgedTossRequest(transmissionId: string): Request {
  const rawBody = JSON.stringify({
    eventType: 'PAYMENT_STATUS_CHANGED',
    data: { orderId: ORDER_NO, status: 'DONE', paymentKey: 'pk_forged' },
  });

  return new Request('http://localhost:3000/api/webhooks/toss', {
    method: 'POST',
    headers: {
      'tosspayments-webhook-transmission-id': transmissionId,
      'tosspayments-webhook-transmission-time': String(NOW_SECONDS()),
      'tosspayments-webhook-signature': createHmac('sha256', 'attacker_secret')
        .update('forged', 'utf8')
        .digest('base64'),
    },
    body: rawBody,
  });
}

function paddleRequest(options: { eventId: string; eventType?: string }): Request {
  const rawBody = JSON.stringify({
    event_id: options.eventId,
    event_type: options.eventType ?? 'transaction.completed',
    occurred_at: '2026-08-10T03:00:00Z',
    data: {
      id: 'txn_01hq3z1k2m',
      status: 'completed',
      custom_data: { orderNo: ORDER_NO },
    },
  });
  const ts = String(NOW_SECONDS());
  const h1 = createHmac('sha256', PADDLE_NOTIFICATION_SECRET)
    .update(`${ts}:${rawBody}`, 'utf8')
    .digest('hex');

  return new Request('http://localhost:3000/api/webhooks/paddle', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'paddle-signature': `ts=${ts};h1=${h1}` },
    body: rawBody,
  });
}

function rowsOf(provider: string): WebhookEventRow[] {
  return [...store.rows.values()].filter((row) => row.provider === provider);
}

beforeEach(() => {
  store.rows.clear();
  store.sequence = 0;
  store.tossStatus = 'DONE';
  store.paddleStatus = 'completed';
  store.confirmedOrders.clear();

  spies.confirmOrderPaid.mockReset();
  spies.markOrderFailed.mockReset();
  spies.completeRefund.mockReset();
  spies.sendPurchaseConfirmationEmail.mockReset();

  // order.service의 "FOR UPDATE 후 이미 PAID면 no-op" 동작을 재현한다.
  spies.confirmOrderPaid.mockImplementation((args: { orderNo: string }) => {
    const alreadyConfirmed = store.confirmedOrders.has(args.orderNo);
    store.confirmedOrders.add(args.orderNo);
    return Promise.resolve({
      orderId: `order-of-${args.orderNo}`,
      alreadyConfirmed,
      libraryItemId: `lib-of-${args.orderNo}`,
    });
  });
  spies.markOrderFailed.mockResolvedValue(undefined);
  spies.completeRefund.mockResolvedValue(undefined);
  spies.sendPurchaseConfirmationEmail.mockResolvedValue({ skipped: false });
});

// ─────────────────────────────────────────────────────────────
// 테스트
// ─────────────────────────────────────────────────────────────

describe('동일 웹훅 반복 수신 (F2-AC6)', () => {
  it('같은 전송 ID로 5번 순차 수신해도 1번만 처리한다', async () => {
    const responses: Array<{ status: number; body: unknown }> = [];

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await handleIncomingWebhook(
        'TOSS',
        tossRequest({ transmissionId: 'toss-transmission-repeat' }),
      );
      responses.push({ status: response.status, body: await response.json() });
    }

    // 결제사에는 항상 200을 돌려줘 재시도를 멈추게 한다.
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(responses[0]?.body).toEqual({ ok: true });
    for (const response of responses.slice(1)) {
      expect(response.body).toEqual({ ok: true, deduped: true });
    }

    // 확정·지급·메일은 정확히 1회.
    expect(spies.confirmOrderPaid).toHaveBeenCalledTimes(1);
    expect(spies.sendPurchaseConfirmationEmail).toHaveBeenCalledTimes(1);

    // webhook_events 에도 1건만 남는다.
    expect(rowsOf('TOSS')).toHaveLength(1);
    expect(rowsOf('TOSS')[0]?.status).toBe('PROCESSED');
    expect(rowsOf('TOSS')[0]?.orderId).toBe(`order-of-${ORDER_NO}`);
  });

  it('같은 전송 ID로 5번 동시 수신해도 1번만 처리한다', async () => {
    const requests = Array.from({ length: 5 }, () =>
      tossRequest({ transmissionId: 'toss-transmission-concurrent' }),
    );

    const responses = await Promise.all(
      requests.map((request) => handleIncomingWebhook('TOSS', request)),
    );
    const bodies = await Promise.all(responses.map((response) => response.json()));

    expect(bodies.filter((body) => (body as { deduped?: boolean }).deduped === true)).toHaveLength(4);
    expect(spies.confirmOrderPaid).toHaveBeenCalledTimes(1);
    expect(spies.sendPurchaseConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(rowsOf('TOSS')).toHaveLength(1);
  });

  it('확정은 웹훅 본문이 아니라 조회 API 스냅샷으로 이루어진다', async () => {
    await handleIncomingWebhook('TOSS', tossRequest({ transmissionId: 'toss-snapshot-source' }));

    expect(spies.confirmOrderPaid).toHaveBeenCalledTimes(1);
    const args = spies.confirmOrderPaid.mock.calls[0]?.[0] as {
      orderNo: string;
      source: string;
      snapshot: { status: string; amount: string; currency: string };
    };

    expect(args.orderNo).toBe(ORDER_NO);
    expect(args.source).toBe('WEBHOOK');
    expect(args.snapshot.status).toBe('SUCCEEDED');
    // 조회 API가 알려준 금액(12000)이 그대로 넘어간다.
    expect(args.snapshot.amount).toBe('12000.00');
    expect(args.snapshot.currency).toBe('KRW');
  });
});

describe('서로 다른 이벤트가 같은 주문을 다시 알릴 때', () => {
  it('이벤트는 2건 기록되지만 지급 확정과 메일은 1회로 유지된다', async () => {
    await handleIncomingWebhook('TOSS', tossRequest({ transmissionId: 'toss-event-1' }));
    await handleIncomingWebhook('TOSS', tossRequest({ transmissionId: 'toss-event-2' }));

    // 멱등 키가 다르므로 파이프라인은 두 번 돈다(1차 방어선 통과).
    expect(rowsOf('TOSS')).toHaveLength(2);
    expect(spies.confirmOrderPaid).toHaveBeenCalledTimes(2);

    // 그러나 2번째는 alreadyConfirmed=true 이므로 메일이 재발송되지 않는다(2차 방어선).
    expect(spies.sendPurchaseConfirmationEmail).toHaveBeenCalledTimes(1);
  });
});

describe('멱등 키의 범위는 (provider, event_id) 다', () => {
  it('provider가 다르면 같은 event_id 라도 각각 처리된다', async () => {
    const sharedId = 'shared-event-id';

    await handleIncomingWebhook('TOSS', tossRequest({ transmissionId: sharedId }));
    await handleIncomingWebhook('PADDLE', paddleRequest({ eventId: sharedId }));

    expect(rowsOf('TOSS')).toHaveLength(1);
    expect(rowsOf('PADDLE')).toHaveLength(1);
    expect(spies.confirmOrderPaid).toHaveBeenCalledTimes(2);
  });

  it('Paddle 동일 event_id 반복도 1회만 처리한다', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await handleIncomingWebhook(
        'PADDLE',
        paddleRequest({ eventId: 'evt_01hq3z1k2m' }),
      );
      expect(response.status).toBe(200);
    }

    expect(rowsOf('PADDLE')).toHaveLength(1);
    expect(spies.confirmOrderPaid).toHaveBeenCalledTimes(1);
    expect(spies.sendPurchaseConfirmationEmail).toHaveBeenCalledTimes(1);
  });
});

describe('서명 검증 실패 (F2-AC3)', () => {
  it('401을 반환하고 어떤 확정도 수행하지 않는다', async () => {
    const response = await handleIncomingWebhook('TOSS', forgedTossRequest('forged-1'));

    expect(response.status).toBe(401);
    expect(spies.confirmOrderPaid).not.toHaveBeenCalled();
    expect(spies.sendPurchaseConfirmationEmail).not.toHaveBeenCalled();
  });

  it('거부 기록은 signature_verified=false 로 남고 멱등 키를 점유하지 않는다', async () => {
    await handleIncomingWebhook('TOSS', forgedTossRequest('forged-2'));

    const rejected = rowsOf('TOSS');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.signatureVerified).toBe(false);
    expect(rejected[0]?.status).toBe('FAILED');
    // 공격자가 임의 전송 ID를 선점해 정상 웹훅을 막을 수 없어야 한다.
    expect(rejected[0]?.eventId.startsWith('rejected:')).toBe(true);

    // 같은 전송 ID의 정상 웹훅은 그대로 처리된다.
    await handleIncomingWebhook('TOSS', tossRequest({ transmissionId: 'forged-2' }));
    expect(spies.confirmOrderPaid).toHaveBeenCalledTimes(1);
  });
});

describe('조회 결과가 성공이 아닐 때', () => {
  it('SUCCEEDED가 아니면 확정하지 않고 SKIPPED로 기록한다', async () => {
    store.tossStatus = 'IN_PROGRESS_LIKE_UNKNOWN';

    const response = await handleIncomingWebhook(
      'TOSS',
      tossRequest({ transmissionId: 'toss-not-succeeded' }),
    );

    expect(response.status).toBe(200);
    expect(spies.confirmOrderPaid).not.toHaveBeenCalled();
    expect(spies.sendPurchaseConfirmationEmail).not.toHaveBeenCalled();
    expect(rowsOf('TOSS')[0]?.status).toBe('SKIPPED');
  });

  it('중복 수신되어도 여전히 지급은 발생하지 않는다', async () => {
    store.tossStatus = 'ABORTED_BUT_SUCCESS_EVENT';

    await handleIncomingWebhook('TOSS', tossRequest({ transmissionId: 'toss-skip-repeat' }));
    await handleIncomingWebhook('TOSS', tossRequest({ transmissionId: 'toss-skip-repeat' }));

    expect(spies.confirmOrderPaid).not.toHaveBeenCalled();
    expect(rowsOf('TOSS')).toHaveLength(1);
  });
});

describe('실패·무시 이벤트의 멱등성 (F2-AC10)', () => {
  it('실패 웹훅을 3번 받아도 실패 처리는 1회만 수행한다', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await handleIncomingWebhook(
        'TOSS',
        tossRequest({ transmissionId: 'toss-aborted', status: 'ABORTED' }),
      );
    }

    expect(spies.markOrderFailed).toHaveBeenCalledTimes(1);
    expect(spies.confirmOrderPaid).not.toHaveBeenCalled();
    expect(spies.sendPurchaseConfirmationEmail).not.toHaveBeenCalled();
    expect(rowsOf('TOSS')).toHaveLength(1);
  });

  it('관심 없는 이벤트는 SKIPPED로 기록하고 아무 상태도 바꾸지 않는다', async () => {
    const response = await handleIncomingWebhook(
      'PADDLE',
      paddleRequest({ eventId: 'evt_ignored', eventType: 'subscription.created' }),
    );

    expect(response.status).toBe(200);
    expect(rowsOf('PADDLE')[0]?.status).toBe('SKIPPED');
    expect(spies.confirmOrderPaid).not.toHaveBeenCalled();
    expect(spies.markOrderFailed).not.toHaveBeenCalled();
  });
});

describe('처리 중 예외 (F2-AC11 구제 전제)', () => {
  it('확정 중 예외가 나도 200을 반환하고 FAILED로 기록해 배치가 구제하게 한다', async () => {
    spies.confirmOrderPaid.mockRejectedValueOnce(new Error('db is down'));

    const response = await handleIncomingWebhook(
      'TOSS',
      tossRequest({ transmissionId: 'toss-boom' }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(rowsOf('TOSS')[0]?.status).toBe('FAILED');
    expect(spies.sendPurchaseConfirmationEmail).not.toHaveBeenCalled();
  });
});
