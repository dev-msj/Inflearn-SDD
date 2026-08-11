import 'server-only';

import { randomUUID } from 'node:crypto';

import { getProviderById } from './provider.registry';
import {
  markWebhookStatus,
  recordRejectedWebhook,
  tryInsertWebhookEvent,
} from './webhook.repository';
import type { NormalizedWebhookEvent, ProviderPaymentSnapshot } from './provider.types';
import {
  findOrderConfirmRefByNo,
  findOrderNoByProviderPaymentId,
} from '@/server/orders/order.repository';
import { confirmOrderPaid, markOrderFailed } from '@/server/orders/order.service';
import { sendPurchaseConfirmationEmail } from '@/server/mail/mailer';
import { completeRefund } from '@/server/refunds/refund.service';
import { WebhookSignatureError, isAppError } from '@/lib/errors';
import { webhookAck, webhookUnauthorized } from '@/lib/http';
import { logger, orderLogger } from '@/lib/logger';
import type { PaymentProviderId } from '@/types/domain';

/**
 * 웹훅 공통 파이프라인 (F2-AC3/5/6/10).
 *
 * ① rawBody 확보(파싱 전 원문) → ② 서명 검증 실패 시 401, 어떤 상태도 바꾸지 않음
 * → ③ webhook_events UNIQUE 선점(중복이면 200 + deduped)
 * → ④ ★결제사 조회 API로 원본 재확인 (웹훅 본문을 신뢰하지 않는다)
 * → ⑤ 확정/실패/환불 전이 → ⑥ 성공 확정 시에만 구매 확인 메일 1회
 * → ⑦ 처리 결과와 무관하게 200 응답(실패는 기록 후 재조회 배치가 구제)
 *
 * "본문 신뢰 금지"가 이 파이프라인의 핵심이다. 서명이 유효해도 본문의 status/amount로는
 * 확정하지 않으며, fetchPayment() 결과가 SUCCEEDED일 때만 confirmOrderPaid()를 호출한다.
 */

export async function handleIncomingWebhook(
  providerId: PaymentProviderId,
  req: Request,
): Promise<Response> {
  // ① 파싱 전 원문. HMAC 대상이므로 절대 재직렬화하지 않는다.
  const rawBody = await req.text();
  const provider = getProviderById(providerId);

  // ② 서명·발신자 검증
  let event: NormalizedWebhookEvent;
  try {
    event = await provider.verifyAndParseWebhook({ rawBody, headers: req.headers });
  } catch (error) {
    await recordRejectedWebhook({
      provider: providerId,
      // 신뢰할 수 없는 본문에서 ID를 뽑지 않는다. 기록 자체가 유니크 충돌을 일으키지 않도록 임의 키를 쓴다.
      eventId: `rejected:${randomUUID()}`,
      eventType: 'SIGNATURE_REJECTED',
      rawBody,
      error: error instanceof Error ? error.message : 'unknown',
    });
    logger.warn('webhook_signature_rejected', { provider: providerId });

    // 서명 실패만 401이다. 그 외 오류는 200으로 응답해 결제사 재시도 폭주를 막는다.
    if (error instanceof WebhookSignatureError) return webhookUnauthorized();
    return webhookUnauthorized();
  }

  // ③ 멱등 키 선점. 중복이면 아무 처리도 하지 않고 200으로 재시도를 중단시킨다.
  const webhookEventId = await tryInsertWebhookEvent({ provider: providerId, event, rawBody });
  if (!webhookEventId) {
    logger.info('webhook_deduped', { provider: providerId, eventId: event.eventId });
    return webhookAck(true);
  }

  try {
    await processWebhookEvent({ providerId, event, webhookEventId });
  } catch (error) {
    // 처리 실패는 기록만 하고 200을 돌려준다. 구제는 재조회 배치가 담당한다(F2-AC11).
    await markWebhookStatus({
      id: webhookEventId,
      status: 'FAILED',
      error: isAppError(error) ? error.code : 'INTERNAL_ERROR',
    });
    logger.error('webhook_processing_failed', { provider: providerId, eventId: event.eventId }, error);
  }

  return webhookAck();
}

interface ProcessArgs {
  providerId: PaymentProviderId;
  event: NormalizedWebhookEvent;
  webhookEventId: string;
}

async function processWebhookEvent(args: ProcessArgs): Promise<void> {
  const { providerId, event, webhookEventId } = args;
  const provider = getProviderById(providerId);

  if (event.intent === 'IGNORED') {
    await markWebhookStatus({ id: webhookEventId, status: 'SKIPPED' });
    return;
  }

  // 주문 식별: custom_data의 orderNo가 없으면(Paddle 환불 이벤트 등) 결제 식별자로 역추적한다.
  const orderNo =
    event.providerOrderRef ??
    (event.providerPaymentId
      ? await findOrderNoByProviderPaymentId(providerId, event.providerPaymentId)
      : null);

  if (!orderNo) {
    await markWebhookStatus({ id: webhookEventId, status: 'SKIPPED', error: 'ORDER_REF_MISSING' });
    return;
  }

  // 금액까지 함께 읽는다. 승인 대행 시 결제사에 보낼 기준 금액(expectedAmount)이 필요하다.
  const orderRef = await findOrderConfirmRefByNo(orderNo);
  const log = orderLogger(orderNo, { provider: providerId, eventId: event.eventId });

  if (!orderRef) {
    await markWebhookStatus({ id: webhookEventId, status: 'SKIPPED', error: 'ORDER_NOT_FOUND' });
    log.warn('webhook_order_not_found');
    return;
  }

  const orderId = orderRef.id;

  switch (event.intent) {
    case 'PAYMENT_SUCCEEDED': {
      // ④ ★웹훅 본문이 아니라 결제사 조회 결과로만 확정한다.
      const snapshot = await provider.fetchPayment({
        providerOrderRef: orderNo,
        providerPaymentId: event.providerPaymentId,
        expectedAmount: orderRef.amount,
      });

      const providerStatus = snapshot?.status ?? 'NOT_FOUND';
      if (!isConfirmable(snapshot)) {
        await markWebhookStatus({
          id: webhookEventId,
          status: 'SKIPPED',
          orderId,
          error: `PROVIDER_STATUS_${providerStatus}`,
        });
        log.warn('webhook_confirm_skipped', { providerStatus });
        return;
      }

      const result = await confirmOrderPaid({ orderNo, snapshot, source: 'WEBHOOK' });

      // ⑥ 커밋 후 1회 발송. 중복 웹훅(alreadyConfirmed)이면 보내지 않는다(F2-AC4).
      if (!result.alreadyConfirmed) {
        await sendPurchaseConfirmationEmail(result.orderId);
      }

      await markWebhookStatus({ id: webhookEventId, status: 'PROCESSED', orderId });
      return;
    }

    case 'PAYMENT_FAILED':
    case 'PAYMENT_CANCELED':
    case 'PAYMENT_EXPIRED': {
      await markOrderFailed({
        orderNo,
        code: event.failureCode ?? event.intent,
        message: event.failureMessage ?? event.eventType,
        source: 'WEBHOOK',
      });
      await markWebhookStatus({ id: webhookEventId, status: 'PROCESSED', orderId });
      return;
    }

    case 'REFUND_COMPLETED': {
      await completeRefund({
        orderNo,
        source: 'WEBHOOK',
        providerRefundId: event.providerPaymentId,
      });
      await markWebhookStatus({ id: webhookEventId, status: 'PROCESSED', orderId });
      return;
    }

    default: {
      await markWebhookStatus({ id: webhookEventId, status: 'SKIPPED', orderId });
    }
  }
}

/** 확정 가능한 조회 결과인지. 이 판정을 통과한 스냅샷만 confirmOrderPaid()로 넘어간다. */
function isConfirmable(snapshot: ProviderPaymentSnapshot | null): snapshot is ProviderPaymentSnapshot {
  return snapshot !== null && snapshot.status === 'SUCCEEDED';
}
