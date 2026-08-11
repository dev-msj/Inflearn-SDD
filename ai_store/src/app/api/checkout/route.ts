import { z } from 'zod';

import { requireUser } from '@/lib/auth-guard';
import { PolicyNotAgreedError } from '@/lib/errors';
import { jsonError, jsonOk, NO_STORE_HEADERS } from '@/lib/http';
import { startCheckout } from '@/server/orders/order.service';
import { DEFAULT_LOCALE, isAppLocale } from '@/i18n/routing';
import type { CreateCheckoutResponse } from '@/types/api';

/**
 * POST /api/checkout — 결제 시작, PENDING 주문 생성 (F2-AC1/2/7/8/12).
 *
 * 201 `StartCheckoutResult` / 409 `ALREADY_OWNED` / 409 `TEMPLATE_NOT_PURCHASABLE` / 400 `POLICY_NOT_AGREED`
 *
 * ★통화는 요청 본문의 값만 사용한다.
 *   IP·`x-vercel-ip-country`·Accept-Language 등 지역 신호를 읽는 코드가 이 경로 어디에도 없다(F2-AC2).
 *
 * ★금액은 클라이언트가 보내지 않는다.
 *   서버가 현재가를 조회해 `orders.amount`로 스냅샷하므로 가격 조작이 불가능하다(F2-AC8).
 *
 * ★결제사 API를 호출하므로 Node.js 런타임이 필요하다.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  templateSlug: z.string().min(1).max(200),
  // 기본값을 두지 않는다. 사용자가 명시적으로 선택해야만 통과한다(F2-AC1).
  currency: z.enum(['KRW', 'USD']),
  policyAgreed: z.boolean(),
  locale: z.enum(['ko', 'en']).optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const body: unknown = await request.json();
    const input = bodySchema.parse(body);

    // 동의 여부의 최종 판정은 서버가 한다(F2-AC12). 화면 비활성화는 UX 보조일 뿐이다.
    if (!input.policyAgreed) throw new PolicyNotAgreedError();

    const locale = isAppLocale(input.locale) ? input.locale : (user.locale ?? DEFAULT_LOCALE);

    const result = await startCheckout({
      userId: user.id,
      userEmail: user.email,
      templateSlug: input.templateSlug,
      currency: input.currency,
      policyAgreed: input.policyAgreed,
      locale,
    });

    return jsonOk<CreateCheckoutResponse>(result, { status: 201, headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error, { route: 'checkout/start' });
  }
}
