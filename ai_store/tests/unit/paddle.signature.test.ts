import { createHmac } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

/**
 * Paddle 웹훅 서명 검증 단위 테스트 (F2-AC3, F2-AC5).
 *
 * 검증 목표
 *  - `Paddle-Signature: ts=<unix초>;h1=<hex>` 를 파싱해 `${ts}:${rawBody}` 의 HMAC-SHA256(hex)만 통과시킨다.
 *  - rawBody는 **파싱 전 원문**이어야 한다(재직렬화하면 서명이 깨진다는 점을 테스트로 고정).
 *  - ts가 ±5분을 벗어나면 재전송 공격으로 간주해 거부한다.
 *  - h1이 여러 개(시크릿 순환 중)면 하나만 맞아도 통과한다.
 */

const envState = vi.hoisted(() => ({
  PADDLE_NOTIFICATION_SECRET: 'pdl_ntfset_unit_test_secret',
}));

vi.mock('@/lib/env', () => ({
  getServerEnv: () => envState,
  getClientEnv: () => ({}),
  isProduction: () => false,
}));

const { SIGNATURE_TOLERANCE_MS, verifyPaddleSignature } = await import(
  '@/server/payments/paddle/paddle.signature'
);
const { WebhookSignatureError } = await import('@/lib/errors');

const NOW = new Date('2026-08-10T12:00:00.000Z');
const NOW_TS = String(Math.floor(NOW.getTime() / 1000));

/** Paddle이 보내는 형태에 맞춘 원문. 공백·키 순서를 그대로 유지해야 서명이 성립한다. */
const RAW_BODY = JSON.stringify({
  event_id: 'evt_01hq3z1k2m',
  event_type: 'transaction.completed',
  data: {
    id: 'txn_01hq3z1k2m',
    status: 'completed',
    custom_data: { orderNo: 'AS-20260810-ABCD1234' },
  },
});

const HEADER_SIGNATURE = 'paddle-signature';

function hmacHex(ts: string, rawBody: string, secret = envState.PADDLE_NOTIFICATION_SECRET): string {
  return createHmac('sha256', secret).update(`${ts}:${rawBody}`, 'utf8').digest('hex');
}

interface RequestOptions {
  ts?: string;
  rawBody?: string;
  secret?: string;
  /** 헤더 값을 직접 지정한다(형식 손상 테스트용). */
  header?: string;
}

function makeRequest(options: RequestOptions = {}) {
  const ts = options.ts ?? NOW_TS;
  const rawBody = options.rawBody ?? RAW_BODY;
  const header = options.header ?? `ts=${ts};h1=${hmacHex(ts, rawBody, options.secret)}`;

  return { rawBody, headers: new Headers({ [HEADER_SIGNATURE]: header }) };
}

describe('정상 서명', () => {
  it('올바른 Paddle-Signature는 통과한다', () => {
    expect(() => verifyPaddleSignature(makeRequest(), NOW)).not.toThrow();
  });

  it('허용 오차는 Toss와 동일한 5분이다', () => {
    expect(SIGNATURE_TOLERANCE_MS).toBe(5 * 60 * 1000);
  });

  it('h1이 여러 개면 하나만 일치해도 통과한다 (시크릿 순환)', () => {
    const header = `ts=${NOW_TS};h1=${hmacHex(NOW_TS, RAW_BODY, 'old_secret')};h1=${hmacHex(NOW_TS, RAW_BODY)}`;

    expect(() => verifyPaddleSignature(makeRequest({ header }), NOW)).not.toThrow();
  });

  it('헤더 각 조각에 공백이 섞여 있어도 파싱한다', () => {
    const header = ` ts = ${NOW_TS} ; h1 = ${hmacHex(NOW_TS, RAW_BODY)} `;

    expect(() => verifyPaddleSignature(makeRequest({ header }), NOW)).not.toThrow();
  });
});

describe('위조·변조 거부 (F2-AC3)', () => {
  it('본문이 바뀌면 거부한다', () => {
    const request = makeRequest();
    const tampered = {
      rawBody: request.rawBody.replace('completed', 'canceled'),
      headers: request.headers,
    };

    expect(() => verifyPaddleSignature(tampered, NOW)).toThrow(WebhookSignatureError);
  });

  it('다른 시크릿으로 만든 서명은 거부한다', () => {
    expect(() => verifyPaddleSignature(makeRequest({ secret: 'attacker_secret' }), NOW)).toThrow(
      WebhookSignatureError,
    );
  });

  it('ts만 바꿔치기하면 거부한다 (ts가 서명 대상에 포함되므로)', () => {
    const signedTs = NOW_TS;
    const replayedTs = String(Number(NOW_TS) - 60);
    const header = `ts=${replayedTs};h1=${hmacHex(signedTs, RAW_BODY)}`;

    expect(() => verifyPaddleSignature(makeRequest({ header }), NOW)).toThrow(WebhookSignatureError);
  });

  it('★본문을 재직렬화(JSON.parse → stringify)하면 서명이 깨진다', () => {
    // rawBody를 그대로 넘겨야 한다는 설계를 테스트로 고정한다.
    const reserialized = JSON.stringify(JSON.parse(RAW_BODY), null, 2);
    const request = makeRequest();

    expect(() =>
      verifyPaddleSignature({ rawBody: reserialized, headers: request.headers }, NOW),
    ).toThrow(WebhookSignatureError);
  });

  it('서명 실패 예외는 401 / WEBHOOK_SIGNATURE_INVALID 로 표현된다', () => {
    try {
      verifyPaddleSignature(makeRequest({ secret: 'wrong' }), NOW);
      expect.unreachable('위조 서명이 통과해서는 안 된다');
    } catch (error) {
      expect(error).toBeInstanceOf(WebhookSignatureError);
      const signatureError = error as InstanceType<typeof WebhookSignatureError>;
      expect(signatureError.status).toBe(401);
      expect(signatureError.code).toBe('WEBHOOK_SIGNATURE_INVALID');
      expect(signatureError.expose).toBe(false);
    }
  });
});

describe('헤더 형식 검증', () => {
  it('Paddle-Signature 헤더가 없으면 거부한다', () => {
    expect(() => verifyPaddleSignature({ rawBody: RAW_BODY, headers: new Headers() }, NOW)).toThrow(
      WebhookSignatureError,
    );
  });

  it('ts 또는 h1이 빠지면 거부한다', () => {
    const headers = [
      `h1=${hmacHex(NOW_TS, RAW_BODY)}`,
      `ts=${NOW_TS}`,
      '',
      'garbage',
      `ts=${NOW_TS};h2=${hmacHex(NOW_TS, RAW_BODY)}`,
    ];

    for (const header of headers) {
      expect(
        () => verifyPaddleSignature(makeRequest({ header }), NOW),
        `헤더: "${header}"`,
      ).toThrow(WebhookSignatureError);
    }
  });

  it('ts가 숫자가 아니면 거부한다', () => {
    const header = `ts=not-a-number;h1=${hmacHex('not-a-number', RAW_BODY)}`;

    expect(() => verifyPaddleSignature(makeRequest({ header }), NOW)).toThrow(WebhookSignatureError);
  });

  it('h1 길이가 다르면 timingSafeEqual 예외 없이 거부한다', () => {
    const header = `ts=${NOW_TS};h1=deadbeef`;

    expect(() => verifyPaddleSignature(makeRequest({ header }), NOW)).toThrow(WebhookSignatureError);
  });
});

describe('타임스탬프 허용 오차 (F2-AC5 재전송 방어)', () => {
  it('정확히 ±5분 경계는 통과한다', () => {
    for (const offsetSeconds of [-300, 300]) {
      const ts = String(Number(NOW_TS) + offsetSeconds);

      expect(
        () => verifyPaddleSignature(makeRequest({ ts }), NOW),
        `오프셋: ${offsetSeconds}s`,
      ).not.toThrow();
    }
  });

  it('5분을 넘긴 과거·미래 전송은 모두 거부한다', () => {
    for (const offsetSeconds of [-301, -3600, 301, 3600]) {
      const ts = String(Number(NOW_TS) + offsetSeconds);

      expect(
        () => verifyPaddleSignature(makeRequest({ ts }), NOW),
        `오프셋: ${offsetSeconds}s`,
      ).toThrow(WebhookSignatureError);
    }
  });

  it('타임스탬프 검사는 서명 검증보다 먼저 수행되어 오래된 유효 서명도 막는다', () => {
    const staleTs = String(Number(NOW_TS) - 24 * 60 * 60);
    // 서명 자체는 완전히 유효하다. 그럼에도 재전송이므로 거부되어야 한다.
    expect(() => verifyPaddleSignature(makeRequest({ ts: staleTs }), NOW)).toThrow(
      WebhookSignatureError,
    );
  });
});
