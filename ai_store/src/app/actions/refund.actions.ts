'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireUser } from '@/lib/auth-guard';
import { isAppError, RefundIneligibleError, type AppErrorCode } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { requestRefund } from '@/server/refunds/refund.service';
import { LOCALES } from '@/i18n/routing';
import type { RefundIneligibleReason, RefundStatus } from '@/types/domain';

/**
 * 환불 요청 서버 액션 (F2-AC12).
 *
 * ★이 액션은 "접수"까지만 책임진다.
 *   반환 status는 항상 REQUESTED이며, 실제 환불 완료는 결제사 웹훅(REFUND_COMPLETED) 또는
 *   결제사가 동기 처리한 경우 refund.service가 이어서 처리한다.
 *   화면에 "환불이 완료되었습니다"로 표기하면 안 된다.
 */

export type RequestRefundState =
  | { status: 'idle' }
  | { status: 'success'; refundId: string; refundStatus: RefundStatus }
  /** 정책 미충족(7일 경과·열람·다운로드·중복 요청). 화면은 reason으로 안내 문구를 고른다. */
  | { status: 'ineligible'; reason: RefundIneligibleReason }
  | { status: 'error'; code: AppErrorCode };

const requestRefundSchema = z.object({
  orderNo: z.string().min(1).max(64),
  reasonCode: z.enum(['NOT_AS_DESCRIBED', 'MISTAKEN_PURCHASE', 'OTHER']),
  reasonText: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((value) => (value ? value : undefined)),
  locale: z.enum(LOCALES),
});

export async function requestRefundAction(
  _prevState: RequestRefundState,
  formData: FormData,
): Promise<RequestRefundState> {
  const parsed = requestRefundSchema.safeParse({
    orderNo: formData.get('orderNo'),
    reasonCode: formData.get('reasonCode'),
    reasonText: formData.get('reasonText') ?? undefined,
    locale: formData.get('locale'),
  });

  if (!parsed.success) {
    return { status: 'error', code: 'VALIDATION_ERROR' };
  }

  const input = parsed.data;

  try {
    const user = await requireUser();

    const result = await requestRefund({
      orderNo: input.orderNo,
      // 타인의 주문번호를 넣어도 서비스가 404를 던진다(주문 존재 여부 노출 금지).
      userId: user.id,
      reasonCode: input.reasonCode,
      reasonText: input.reasonText,
    });

    // 주문 상세 화면의 상태 표기(PAID → REFUND_REQUESTED)를 즉시 반영한다.
    revalidatePath(`/${input.locale}/orders/${input.orderNo}`);

    return { status: 'success', refundId: result.refundId, refundStatus: result.status };
  } catch (error) {
    if (error instanceof RefundIneligibleError) {
      return { status: 'ineligible', reason: error.reason };
    }
    if (isAppError(error)) {
      return { status: 'error', code: error.code };
    }

    logger.error('request_refund_failed', { orderNo: input.orderNo }, error);
    return { status: 'error', code: 'INTERNAL_ERROR' };
  }
}
