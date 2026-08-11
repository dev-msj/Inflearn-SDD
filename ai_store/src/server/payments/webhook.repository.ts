import 'server-only';

import { Prisma } from '@prisma/client';

import { isUniqueViolation } from '@/server/orders/order.repository';
import { db } from '@/lib/db';
import type { NormalizedWebhookEvent } from './provider.types';
import type { PaymentProviderId } from '@/types/domain';

/**
 * 웹훅 멱등 저장소 (F2-AC6).
 *
 * ★중복 지급 방지의 1차 방어선.
 *   `webhook_events UNIQUE(provider, event_id)`에 INSERT를 **먼저 시도**해 이벤트를 선점한다.
 *   같은 이벤트가 동시에 두 번 들어오면 한쪽만 INSERT에 성공하고, 나머지는 유니크 위반으로
 *   즉시 중복임을 알 수 있다. 애플리케이션 락이나 조회-후-삽입 패턴은 경합에서 새기 때문에 쓰지 않는다.
 */

export type WebhookRecordStatus = 'RECEIVED' | 'PROCESSED' | 'SKIPPED' | 'FAILED';

export interface TryInsertWebhookEventInput {
  provider: PaymentProviderId;
  event: NormalizedWebhookEvent;
  /** 파싱 전 원문. 조사·재처리를 위해 그대로 보존한다. */
  rawBody: string;
}

/** 원문 JSON을 payload에 저장한다. 파싱이 불가능하면 문자열 그대로 감싼다. */
function toPayload(rawBody: string): Prisma.InputJsonValue {
  try {
    return JSON.parse(rawBody) as Prisma.InputJsonValue;
  } catch {
    return { raw: rawBody };
  }
}

/**
 * 이벤트 선점.
 * @returns 새로 선점했으면 webhook_events.id, 중복이면 null
 */
export async function tryInsertWebhookEvent(input: TryInsertWebhookEventInput): Promise<string | null> {
  try {
    const created = await db.webhookEvent.create({
      data: {
        provider: input.provider,
        eventId: input.event.eventId,
        eventType: input.event.eventType,
        signatureVerified: true,
        status: 'RECEIVED',
        payload: toPayload(input.rawBody),
      },
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

export interface RecordRejectedWebhookInput {
  provider: PaymentProviderId;
  /** 서명 검증 실패 시에는 신뢰할 수 있는 이벤트 ID가 없다. */
  eventId: string;
  eventType: string;
  rawBody: string;
  error: string;
}

/**
 * 서명 검증에 실패한 요청 기록.
 * signature_verified=false로 남겨 두면 공격 시도와 설정 오류를 사후에 구분할 수 있다.
 * eventId가 이미 존재하면(공격자가 같은 ID로 반복 전송) 무시한다.
 */
export async function recordRejectedWebhook(input: RecordRejectedWebhookInput): Promise<void> {
  try {
    await db.webhookEvent.create({
      data: {
        provider: input.provider,
        eventId: input.eventId,
        eventType: input.eventType,
        signatureVerified: false,
        status: 'FAILED',
        payload: toPayload(input.rawBody),
        error: input.error,
        processedAt: new Date(),
      },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
}

export interface MarkWebhookStatusInput {
  id: string;
  status: WebhookRecordStatus;
  orderId?: string | null;
  error?: string | null;
}

export async function markWebhookStatus(input: MarkWebhookStatusInput): Promise<void> {
  await db.webhookEvent.update({
    where: { id: input.id },
    data: {
      status: input.status,
      orderId: input.orderId ?? undefined,
      error: input.error ?? undefined,
      processedAt: new Date(),
    },
  });
}
