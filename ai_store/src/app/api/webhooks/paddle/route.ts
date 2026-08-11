import { webhookAck } from '@/lib/http';
import { logger } from '@/lib/logger';
import { handleIncomingWebhook } from '@/server/payments/webhook.handler';

/**
 * POST /api/webhooks/paddle — Paddle 이벤트 통지 (F2-AC3/5/6/10/12).
 *
 * ★`request`를 **그대로** 핸들러에 넘긴다.
 *   `Paddle-Signature`는 `${ts}:${rawBody}`에 대한 HMAC이라, 이 라우트에서 본문을 먼저 파싱하면
 *   원문이 소비되어 검증이 불가능해진다.
 *
 * ★환불 완료(adjustment) 이벤트도 이 경로로 들어온다.
 *   `completeRefund()`가 library_items를 REVOKED로 바꿔 열람을 즉시 차단한다(F2-AC12, F3-AC9).
 *
 * ★Node.js 런타임 필수: node:crypto와 Prisma를 사용한다.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleIncomingWebhook('PADDLE', request);
  } catch (error) {
    // 파이프라인 진입 전 오류. 200으로 응답해 재시도 폭주를 막고 배치가 구제하게 둔다.
    logger.error('webhook_route_failed', { provider: 'PADDLE' }, error);
    return webhookAck();
  }
}
