import { z } from 'zod';

import { requireUser } from '@/lib/auth-guard';
import { jsonError, jsonOk, NO_STORE_HEADERS } from '@/lib/http';
import { requestRefund } from '@/server/refunds/refund.service';
import type { RefundAcceptedResponse } from '@/types/api';

/**
 * POST /api/orders/[orderNo]/refund — 환불 요청 접수 (F2-AC12).
 *
 * 202 `{ refundId, status }` / 422 `REFUND_INELIGIBLE` + `details.reason`
 *
 * ★"접수"까지만 책임진다.
 *   반환 status는 REQUESTED이며, 실제 환불 완료는 결제사 처리 결과(웹훅 또는 동기 응답)로 확정된다.
 *   환불이 완료되면 library_items가 REVOKED로 바뀌어 열람이 즉시 차단된다(F3-AC9).
 *
 * ★자격 판정(7일 이내 + 미열람·미다운로드)은 전적으로 서버가 한다.
 *   불충족 사유는 `RefundIneligibleError`의 details.reason으로 전달되어 화면이 문구를 고른다.
 *
 * ★타인의 주문번호를 넣으면 404다(존재 여부 노출 금지).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  reasonCode: z.enum(['NOT_AS_DESCRIBED', 'MISTAKEN_PURCHASE', 'OTHER']),
  reasonText: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((value) => (value ? value : undefined)),
});

interface RouteContext {
  params: Promise<{ orderNo: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { orderNo } = await context.params;

  try {
    const user = await requireUser();
    const body: unknown = await request.json();
    const input = bodySchema.parse(body);

    const result = await requestRefund({
      orderNo,
      userId: user.id,
      reasonCode: input.reasonCode,
      reasonText: input.reasonText,
    });

    // 202 Accepted: 접수는 끝났지만 환불 완료는 아직이라는 의미를 상태 코드로도 전달한다.
    return jsonOk<RefundAcceptedResponse>(result, { status: 202, headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error, { route: 'orders/refund', orderNo });
  }
}
