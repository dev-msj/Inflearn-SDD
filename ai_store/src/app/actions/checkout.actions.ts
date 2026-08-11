'use server';

import { z } from 'zod';

import { requireUser } from '@/lib/auth-guard';
import { isAppError, type AppErrorCode } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { startCheckout } from '@/server/orders/order.service';
import { LOCALES } from '@/i18n/routing';
import type { CreateCheckoutResponse } from '@/types/api';

/**
 * 결제 시작 서버 액션 (F2-AC1/2/7/12).
 *
 * ★통화는 폼에서 넘어온 값만 사용한다.
 *   IP·Accept-Language·국가 헤더를 참조하는 코드는 이 파일과 하위 호출 경로 어디에도 없다(F2-AC2).
 *
 * ★환불 정책 동의(policyAgreed)가 false면 order.service.startCheckout()이 PolicyNotAgreedError를
 *   던진다. 화면 비활성화는 UX 보조일 뿐이고 실제 차단은 서버가 한다(F2-AC12).
 */

/** 화면이 안내 문구를 고를 때 쓰는 코드. messages의 `errors.codes.<code>`와 대응한다. */
export type StartCheckoutErrorCode = AppErrorCode;

export type StartCheckoutState =
  | { status: 'idle' }
  | { status: 'ready'; checkout: CreateCheckoutResponse }
  | { status: 'error'; code: StartCheckoutErrorCode };

const startCheckoutSchema = z.object({
  templateSlug: z.string().min(1).max(200),
  // 기본값을 두지 않는다. 사용자가 명시적으로 선택해야만 파싱을 통과한다(F2-AC1).
  currency: z.enum(['KRW', 'USD']),
  policyAgreed: z.literal(true),
  locale: z.enum(LOCALES),
});

/** 체크박스는 미체크 시 아예 전송되지 않고, 체크되면 'on'(또는 'true')으로 전송된다. */
function readCheckbox(raw: FormDataEntryValue | null): boolean {
  return typeof raw === 'string' && ['on', 'true', '1'].includes(raw.toLowerCase());
}

/**
 * PENDING 주문을 만들고 결제창 payload를 돌려준다.
 * 결제창을 실제로 여는 일은 클라이언트(CheckoutButton / PaddleCheckoutLauncher)가 담당한다.
 */
export async function startCheckoutAction(
  _prevState: StartCheckoutState,
  formData: FormData,
): Promise<StartCheckoutState> {
  const parsed = startCheckoutSchema.safeParse({
    templateSlug: formData.get('templateSlug'),
    currency: formData.get('currency'),
    policyAgreed: readCheckbox(formData.get('policyAgreed')),
    locale: formData.get('locale'),
  });

  if (!parsed.success) {
    const missingConsent = parsed.error.issues.some((issue) => issue.path[0] === 'policyAgreed');
    return { status: 'error', code: missingConsent ? 'POLICY_NOT_AGREED' : 'VALIDATION_ERROR' };
  }

  const input = parsed.data;

  try {
    const user = await requireUser();

    const result = await startCheckout({
      userId: user.id,
      // 구매 확인 메일 수신처이자 결제창 고객 식별자. 세션의 이메일을 그대로 쓴다.
      userEmail: user.email,
      templateSlug: input.templateSlug,
      currency: input.currency,
      policyAgreed: input.policyAgreed,
      locale: input.locale,
    });

    return { status: 'ready', checkout: result };
  } catch (error) {
    if (isAppError(error)) {
      // ALREADY_OWNED / TEMPLATE_NOT_PURCHASABLE / UNAUTHORIZED 등은 화면이 안내로 처리한다.
      return { status: 'error', code: error.code };
    }

    logger.error('start_checkout_failed', { templateSlug: input.templateSlug }, error);
    return { status: 'error', code: 'INTERNAL_ERROR' };
  }
}
