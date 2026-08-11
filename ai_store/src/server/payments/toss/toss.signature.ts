import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { getServerEnv } from '@/lib/env';
import { WebhookSignatureError } from '@/lib/errors';
import type { RawWebhookRequest } from '../provider.types';

/**
 * 토스페이먼츠 웹훅 발신자 검증 (F2-AC3, F2-AC5, 비기능: "발신자 검증 통과 요청만 확정").
 *
 * 검증 절차
 *  1) 전송 ID / 전송 시각 / 서명 헤더를 읽는다.
 *  2) `${transmissionId}.${transmissionTime}.${rawBody}` 에 대한 HMAC-SHA256(base64)을
 *     TOSS_WEBHOOK_SECRET으로 계산해 헤더 서명과 비교한다(timingSafeEqual).
 *  3) 전송 시각이 현재 기준 ±5분을 벗어나면 재전송 공격으로 간주해 거부한다.
 *  4) 보조 방어: TOSS_WEBHOOK_ALLOWED_IPS가 설정된 경우에만 발신 IP 화이트리스트를 검사한다.
 *
 * ★TECH_SPEC 11장 N6: 결제사 문서 개정 가능성이 있으나, 최종 확정은 서명 통과 여부와 무관하게
 *   fetchPayment() 재조회 결과로만 결정되므로 서명 스펙 오차가 금전적 오확정으로 이어지지 않는다.
 */

const HEADER_TRANSMISSION_ID = 'tosspayments-webhook-transmission-id';
const HEADER_TRANSMISSION_TIME = 'tosspayments-webhook-transmission-time';
const HEADER_SIGNATURE = 'tosspayments-webhook-signature';
const HEADER_FORWARDED_FOR = 'x-forwarded-for';
const HEADER_REAL_IP = 'x-real-ip';

/** 재전송 공격 허용 오차. */
export const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * 버전 접두사(`v1:`, `v1=`) 판별용 패턴.
 *
 * ★`=`를 무조건 구분자로 취급하면 안 된다. HMAC-SHA256 결과는 32바이트라 base64 인코딩 시
 *   항상 `=` 패딩 1개로 끝나므로, 마지막 `=`를 구분자로 오인하면 서명이 통째로 잘려 나가
 *   모든 정상 웹훅이 거부된다. 따라서 (1) 접두사는 짧은 영숫자 토큰이어야 하고
 *   (2) 구분자 뒤에 최소 1글자가 남아야 할 때만 접두사로 인정한다.
 */
const SIGNATURE_SCHEME_PREFIX = /^[A-Za-z][A-Za-z0-9_-]{0,15}[:=](?=.)/;

/** 헤더 서명 값에서 실제 서명만 뽑는다. `v1:xxx`, `v1=xxx`, `xxx`, 쉼표 구분 다중 서명을 모두 허용한다. */
function parseSignatureCandidates(raw: string): string[] {
  const candidates: string[] = [];

  for (const chunk of raw.split(',').map((part) => part.trim())) {
    if (chunk.length === 0) continue;

    // 접두사가 없는 형식이 기본이므로 원문 자체를 항상 후보에 넣는다.
    candidates.push(chunk);

    const prefix = SIGNATURE_SCHEME_PREFIX.exec(chunk);
    if (!prefix) continue;

    const stripped = chunk.slice(prefix[0].length).trim();
    if (stripped.length > 0) candidates.push(stripped);
  }

  return candidates;
}

/** 길이가 다르면 timingSafeEqual이 예외를 던지므로 먼저 비교한다(길이 노출은 서명 강도에 영향 없음). */
function safeEquals(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const actualBuffer = Buffer.from(actual, 'utf8');
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

/** 전송 시각은 ISO 8601 또는 epoch(ms/s) 문자열로 올 수 있어 둘 다 처리한다. */
function parseTransmissionTime(value: string): number | null {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && value.trim() !== '') {
    // 10자리는 초, 13자리는 밀리초로 해석한다.
    return value.trim().length <= 10 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function assertAllowedIp(headers: Headers, allowedIps: string | undefined): void {
  if (!allowedIps) return; // 미설정이면 검사하지 않는다(TECH_SPEC: 선택 보조 방어).

  const allowList = allowedIps
    .split(',')
    .map((ip) => ip.trim())
    .filter((ip) => ip.length > 0);
  if (allowList.length === 0) return;

  const forwarded = headers.get(HEADER_FORWARDED_FOR) ?? headers.get(HEADER_REAL_IP) ?? '';
  const clientIp = forwarded.split(',')[0]?.trim() ?? '';

  if (!clientIp || !allowList.includes(clientIp)) {
    throw new WebhookSignatureError('Webhook sender IP is not allowed');
  }
}

export function verifyTossSignature(args: RawWebhookRequest, now: Date = new Date()): void {
  const env = getServerEnv();
  const { rawBody, headers } = args;

  assertAllowedIp(headers, env.TOSS_WEBHOOK_ALLOWED_IPS);

  const transmissionId = headers.get(HEADER_TRANSMISSION_ID);
  const transmissionTime = headers.get(HEADER_TRANSMISSION_TIME);
  const signature = headers.get(HEADER_SIGNATURE);

  if (!transmissionId || !transmissionTime || !signature) {
    throw new WebhookSignatureError('Missing Toss webhook signature headers');
  }

  const sentAt = parseTransmissionTime(transmissionTime);
  if (sentAt === null) {
    throw new WebhookSignatureError('Invalid Toss webhook transmission time');
  }
  if (Math.abs(now.getTime() - sentAt) > SIGNATURE_TOLERANCE_MS) {
    throw new WebhookSignatureError('Toss webhook transmission time is out of tolerance');
  }

  const payload = `${transmissionId}.${transmissionTime}.${rawBody}`;
  const expected = createHmac('sha256', env.TOSS_WEBHOOK_SECRET).update(payload, 'utf8').digest('base64');

  const matched = parseSignatureCandidates(signature).some((candidate) => safeEquals(expected, candidate));
  if (!matched) {
    throw new WebhookSignatureError('Toss webhook signature mismatch');
  }
}

/** 웹훅 이벤트 ID(멱등 키)로 쓸 전송 ID. 헤더가 없으면 null을 반환해 호출자가 대체 키를 만든다. */
export function readTossTransmissionId(headers: Headers): string | null {
  return headers.get(HEADER_TRANSMISSION_ID);
}
