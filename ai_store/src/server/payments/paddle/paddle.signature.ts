import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { getServerEnv } from '@/lib/env';
import { WebhookSignatureError } from '@/lib/errors';
import type { RawWebhookRequest } from '../provider.types';

/**
 * Paddle 웹훅 발신자 검증 (F2-AC3, F2-AC5).
 *
 * 검증 절차
 *  1) `Paddle-Signature: ts=<unix초>;h1=<hex>` 헤더를 파싱한다.
 *  2) `${ts}:${rawBody}` 에 대한 HMAC-SHA256(hex)을 PADDLE_NOTIFICATION_SECRET으로 계산해 h1과 비교한다.
 *  3) ts가 현재 기준 ±5분을 벗어나면 재전송 공격으로 간주해 거부한다.
 *
 * ★rawBody는 파싱 전 원문이어야 한다. JSON.parse 후 재직렬화하면 공백·키 순서가 달라져 서명이 깨진다.
 */

const HEADER_SIGNATURE = 'paddle-signature';

/** 재전송 공격 허용 오차. Toss와 동일 기준으로 맞춘다. */
export const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

interface ParsedSignature {
  ts: string;
  hashes: string[];
}

/** `ts=1699999999;h1=abc;h1=def` 형태를 파싱한다. h1이 여러 개일 수 있어 배열로 모은다(키 순환 대응). */
function parseSignatureHeader(raw: string): ParsedSignature | null {
  let ts: string | null = null;
  const hashes: string[] = [];

  for (const part of raw.split(';')) {
    const [key, value] = part.split('=', 2).map((chunk) => chunk?.trim() ?? '');
    if (!key || !value) continue;
    if (key === 'ts') ts = value;
    else if (key === 'h1') hashes.push(value);
  }

  if (!ts || hashes.length === 0) return null;
  return { ts, hashes };
}

function safeEquals(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const actualBuffer = Buffer.from(actual, 'utf8');
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function verifyPaddleSignature(args: RawWebhookRequest, now: Date = new Date()): void {
  const env = getServerEnv();

  const header = args.headers.get(HEADER_SIGNATURE);
  if (!header) {
    throw new WebhookSignatureError('Missing Paddle-Signature header');
  }

  const parsed = parseSignatureHeader(header);
  if (!parsed) {
    throw new WebhookSignatureError('Malformed Paddle-Signature header');
  }

  const sentAtSeconds = Number(parsed.ts);
  if (!Number.isFinite(sentAtSeconds)) {
    throw new WebhookSignatureError('Invalid Paddle-Signature timestamp');
  }
  if (Math.abs(now.getTime() - sentAtSeconds * 1000) > SIGNATURE_TOLERANCE_MS) {
    throw new WebhookSignatureError('Paddle-Signature timestamp is out of tolerance');
  }

  const expected = createHmac('sha256', env.PADDLE_NOTIFICATION_SECRET)
    .update(`${parsed.ts}:${args.rawBody}`, 'utf8')
    .digest('hex');

  if (!parsed.hashes.some((hash) => safeEquals(expected, hash))) {
    throw new WebhookSignatureError('Paddle webhook signature mismatch');
  }
}
