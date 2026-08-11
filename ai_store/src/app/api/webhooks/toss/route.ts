import { webhookAck } from '@/lib/http';
import { logger } from '@/lib/logger';
import { handleIncomingWebhook } from '@/server/payments/webhook.handler';

/**
 * POST /api/webhooks/toss — 토스페이먼츠 결제 상태 통지 (F2-AC3/5/6/10).
 *
 * ★`request`를 **그대로** 핸들러에 넘긴다.
 *   서명 검증 대상은 파싱 전 원문(raw body)이다. 이 라우트에서 먼저 `request.json()`을 호출하면
 *   스트림이 소비되고 재직렬화된 문자열은 바이트가 달라져 HMAC 검증이 깨진다.
 *
 * ★Node.js 런타임 필수: node:crypto의 timingSafeEqual과 Prisma를 사용한다.
 *
 * ★응답 규칙
 *   - 서명 검증 실패: 401 (webhook.handler가 반환)
 *   - 그 외에는 내부 오류가 나도 200. 결제사 재시도 폭주를 막고, 구제는 재조회 배치가 담당한다(F2-AC11).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleIncomingWebhook('TOSS', request);
  } catch (error) {
    // 파이프라인 진입 전 오류(본문 읽기 실패 등). 기록만 하고 200으로 응답한다.
    logger.error('webhook_route_failed', { provider: 'TOSS' }, error);
    return webhookAck();
  }
}
