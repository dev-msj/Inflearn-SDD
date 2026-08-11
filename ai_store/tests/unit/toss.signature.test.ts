import { createHmac } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 토스페이먼츠 웹훅 서명 검증 단위 테스트 (F2-AC3, F2-AC5).
 *
 * 검증 목표
 *  - `${transmissionId}.${transmissionTime}.${rawBody}` 에 대한 HMAC-SHA256(base64)만 통과시킨다.
 *  - 본문·전송 ID·시각·시크릿 중 하나라도 다르면 거부한다(위조 웹훅으로 주문이 확정되지 않는다).
 *  - 전송 시각이 ±5분을 벗어나면 재전송 공격으로 간주해 거부한다.
 *  - IP 화이트리스트는 설정된 경우에만 동작한다(선택 보조 방어).
 *
 * 환경 변수는 실제 .env 없이 돌아야 하므로 `@/lib/env`를 모킹한다.
 */

const envState = vi.hoisted(() => ({
  TOSS_WEBHOOK_SECRET: 'whsec_toss_unit_test_secret',
  TOSS_WEBHOOK_ALLOWED_IPS: undefined as string | undefined,
}));

vi.mock('@/lib/env', () => ({
  getServerEnv: () => envState,
  getClientEnv: () => ({}),
  isProduction: () => false,
}));

const { SIGNATURE_TOLERANCE_MS, readTossTransmissionId, verifyTossSignature } = await import(
  '@/server/payments/toss/toss.signature'
);
const { WebhookSignatureError } = await import('@/lib/errors');

const NOW = new Date('2026-08-10T12:00:00.000Z');
const RAW_BODY = JSON.stringify({
  eventType: 'PAYMENT_STATUS_CHANGED',
  data: { orderId: 'AS-20260810-ABCD1234', status: 'DONE', paymentKey: 'pk_test_1' },
});

const HEADER_TRANSMISSION_ID = 'tosspayments-webhook-transmission-id';
const HEADER_TRANSMISSION_TIME = 'tosspayments-webhook-transmission-time';
const HEADER_SIGNATURE = 'tosspayments-webhook-signature';

function sign(args: { transmissionId: string; transmissionTime: string; rawBody: string; secret?: string }): string {
  return createHmac('sha256', args.secret ?? envState.TOSS_WEBHOOK_SECRET)
    .update(`${args.transmissionId}.${args.transmissionTime}.${args.rawBody}`, 'utf8')
    .digest('base64');
}

interface RequestOptions {
  transmissionId?: string;
  transmissionTime?: string;
  rawBody?: string;
  /** 서명 계산에 쓸 시크릿. 미지정 시 올바른 시크릿을 쓴다. */
  secret?: string;
  /** 서명 헤더 값을 직접 지정한다(포맷 변형·손상 테스트용). */
  signature?: string;
  extraHeaders?: Record<string, string>;
}

/** 유효한(또는 옵션으로 변형된) 웹훅 요청을 만든다. */
function makeRequest(options: RequestOptions = {}) {
  const transmissionId = options.transmissionId ?? 'toss-transmission-0001';
  const transmissionTime = options.transmissionTime ?? String(Math.floor(NOW.getTime() / 1000));
  const rawBody = options.rawBody ?? RAW_BODY;

  const headers = new Headers({
    [HEADER_TRANSMISSION_ID]: transmissionId,
    [HEADER_TRANSMISSION_TIME]: transmissionTime,
    [HEADER_SIGNATURE]:
      options.signature ?? sign({ transmissionId, transmissionTime, rawBody, secret: options.secret }),
    ...(options.extraHeaders ?? {}),
  });

  return { rawBody, headers };
}

beforeEach(() => {
  envState.TOSS_WEBHOOK_ALLOWED_IPS = undefined;
});

describe('정상 서명', () => {
  it('올바른 서명은 통과한다', () => {
    expect(() => verifyTossSignature(makeRequest(), NOW)).not.toThrow();
  });

  it('허용 오차는 5분이다', () => {
    expect(SIGNATURE_TOLERANCE_MS).toBe(5 * 60 * 1000);
  });

  it('전송 시각을 밀리초 epoch로 보내도 통과한다', () => {
    const request = makeRequest({ transmissionTime: String(NOW.getTime()) });

    expect(() => verifyTossSignature(request, NOW)).not.toThrow();
  });

  it('전송 시각을 ISO 8601로 보내도 통과한다', () => {
    const request = makeRequest({ transmissionTime: NOW.toISOString() });

    expect(() => verifyTossSignature(request, NOW)).not.toThrow();
  });

  it('`v1:` / `v1=` 접두 서명과 쉼표 구분 다중 서명을 모두 허용한다', () => {
    const transmissionId = 'toss-transmission-multi';
    const transmissionTime = String(Math.floor(NOW.getTime() / 1000));
    const expected = sign({ transmissionId, transmissionTime, rawBody: RAW_BODY });

    for (const header of [
      expected,
      `v1:${expected}`,
      `v1=${expected}`,
      `v1:deadbeef, v1:${expected}`,
    ]) {
      const request = makeRequest({ transmissionId, transmissionTime, signature: header });
      expect(() => verifyTossSignature(request, NOW), `서명 헤더 형식: ${header}`).not.toThrow();
    }
  });
});

describe('위조·변조 거부 (F2-AC3)', () => {
  it('본문이 1바이트라도 바뀌면 거부한다', () => {
    const request = makeRequest();
    const tampered = { rawBody: `${request.rawBody} `, headers: request.headers };

    expect(() => verifyTossSignature(tampered, NOW)).toThrow(WebhookSignatureError);
  });

  it('다른 시크릿으로 만든 서명은 거부한다', () => {
    const request = makeRequest({ secret: 'attacker_secret' });

    expect(() => verifyTossSignature(request, NOW)).toThrow(WebhookSignatureError);
  });

  it('전송 ID를 바꿔치기하면 거부한다', () => {
    const transmissionTime = String(Math.floor(NOW.getTime() / 1000));
    const signature = sign({ transmissionId: 'original-id', transmissionTime, rawBody: RAW_BODY });
    const request = makeRequest({ transmissionId: 'replaced-id', transmissionTime, signature });

    expect(() => verifyTossSignature(request, NOW)).toThrow(WebhookSignatureError);
  });

  it('서명 헤더가 비어 있거나 길이가 다르면 거부한다', () => {
    for (const signature of ['', 'short', 'A'.repeat(44)]) {
      const request = makeRequest({ signature });
      expect(() => verifyTossSignature(request, NOW)).toThrow(WebhookSignatureError);
    }
  });

  it('필수 헤더가 하나라도 없으면 거부한다', () => {
    for (const missing of [HEADER_TRANSMISSION_ID, HEADER_TRANSMISSION_TIME, HEADER_SIGNATURE]) {
      const request = makeRequest();
      request.headers.delete(missing);

      expect(() => verifyTossSignature(request, NOW), `누락 헤더: ${missing}`).toThrow(
        WebhookSignatureError,
      );
    }
  });

  it('서명 실패 예외는 401 / WEBHOOK_SIGNATURE_INVALID 로 표현된다', () => {
    try {
      verifyTossSignature(makeRequest({ secret: 'wrong' }), NOW);
      expect.unreachable('위조 서명이 통과해서는 안 된다');
    } catch (error) {
      expect(error).toBeInstanceOf(WebhookSignatureError);
      const signatureError = error as InstanceType<typeof WebhookSignatureError>;
      expect(signatureError.status).toBe(401);
      expect(signatureError.code).toBe('WEBHOOK_SIGNATURE_INVALID');
      // 내부 메시지는 클라이언트로 내보내지 않는다.
      expect(signatureError.expose).toBe(false);
    }
  });
});

describe('타임스탬프 허용 오차 (F2-AC5 재전송 방어)', () => {
  it('정확히 ±5분 경계는 통과한다', () => {
    const seconds = Math.floor(NOW.getTime() / 1000);

    for (const offsetSeconds of [-300, 300]) {
      const request = makeRequest({ transmissionTime: String(seconds + offsetSeconds) });
      expect(() => verifyTossSignature(request, NOW), `오프셋: ${offsetSeconds}s`).not.toThrow();
    }
  });

  it('5분을 넘긴 과거 전송은 거부한다', () => {
    const request = makeRequest({
      transmissionTime: String(Math.floor(NOW.getTime() / 1000) - 301),
    });

    expect(() => verifyTossSignature(request, NOW)).toThrow(WebhookSignatureError);
  });

  it('5분을 넘긴 미래 전송도 거부한다', () => {
    const request = makeRequest({
      transmissionTime: String(Math.floor(NOW.getTime() / 1000) + 301),
    });

    expect(() => verifyTossSignature(request, NOW)).toThrow(WebhookSignatureError);
  });

  it('해석 불가능한 전송 시각은 거부한다', () => {
    const request = makeRequest({ transmissionTime: 'not-a-time' });

    expect(() => verifyTossSignature(request, NOW)).toThrow(WebhookSignatureError);
  });
});

describe('IP 화이트리스트 (선택 보조 방어)', () => {
  it('미설정이면 IP 헤더가 없어도 통과한다', () => {
    envState.TOSS_WEBHOOK_ALLOWED_IPS = undefined;

    expect(() => verifyTossSignature(makeRequest(), NOW)).not.toThrow();
  });

  it('설정된 IP 목록에 포함되면 통과한다', () => {
    envState.TOSS_WEBHOOK_ALLOWED_IPS = '52.78.100.19, 52.78.48.223';
    const request = makeRequest({ extraHeaders: { 'x-forwarded-for': '52.78.48.223, 10.0.0.1' } });

    expect(() => verifyTossSignature(request, NOW)).not.toThrow();
  });

  it('목록에 없는 IP는 서명이 유효해도 거부한다', () => {
    envState.TOSS_WEBHOOK_ALLOWED_IPS = '52.78.100.19';
    const request = makeRequest({ extraHeaders: { 'x-forwarded-for': '203.0.113.7' } });

    expect(() => verifyTossSignature(request, NOW)).toThrow(WebhookSignatureError);
  });

  it('목록이 설정됐는데 발신 IP를 알 수 없으면 거부한다', () => {
    envState.TOSS_WEBHOOK_ALLOWED_IPS = '52.78.100.19';

    expect(() => verifyTossSignature(makeRequest(), NOW)).toThrow(WebhookSignatureError);
  });
});

describe('readTossTransmissionId', () => {
  it('전송 ID 헤더를 멱등 키로 읽어온다', () => {
    const { headers } = makeRequest({ transmissionId: 'toss-transmission-9999' });

    expect(readTossTransmissionId(headers)).toBe('toss-transmission-9999');
  });

  it('헤더가 없으면 null을 반환해 호출자가 대체 키를 만들게 한다', () => {
    expect(readTossTransmissionId(new Headers())).toBeNull();
  });
});
