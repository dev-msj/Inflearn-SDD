import { AlertTriangle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { CheckoutButton } from '@/components/checkout/CheckoutButton';
import { buttonVariants } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/auth-guard';
import { getServerEnv } from '@/lib/env';
import { cn } from '@/lib/utils';
import { getAccessState } from '@/server/library/access';
import { REFUND_WINDOW_DAYS } from '@/server/refunds/refund.policy';
import { getTemplateDetail } from '@/server/templates/template.service';
import { isAppLocale } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';

/**
 * 결제 화면 (F2-AC1/2/7/8/12).
 *
 * ★이 페이지는 "무엇을 사는지"만 보여주고, 통화 선택·금액 표시·환불 정책 동의·결제창 실행은
 *   전부 `<CheckoutButton>` 하나가 소유한다. 세 요소가 서로의 상태에 의존하기 때문에
 *   클라이언트 경계를 쪼개면 상태 동기화 코드가 페이지로 새어 나온다.
 *
 * ★`REFUND_WINDOW_DAYS` 주입
 *   CheckoutButton은 클라이언트 컴포넌트라 server-only 모듈(refund.policy)을 import 할 수 없다.
 *   화면 문구와 판정 로직이 다른 숫자를 말하지 않도록 서버가 상수를 props로 내려보낸다.
 *
 * ★인증은 미들웨어가 아니라 여기서도 확인한다.
 *   미들웨어의 쿠키 검사는 UX 최적화일 뿐이고, 실제 통제는 서버 경계의 책임이다.
 */

export const dynamic = 'force-dynamic';

interface CheckoutPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { locale: rawLocale, slug } = await params;
  if (!isAppLocale(rawLocale)) notFound();
  const locale: AppLocale = rawLocale;

  const user = await getCurrentUser();
  if (!user) {
    // 로그인 후 이 결제 화면으로 정확히 되돌아오게 한다(F3-AC8과 동일한 규칙).
    const callbackUrl = `/${locale}/checkout/${slug}`;
    redirect(`/${locale}/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const detail = await getTemplateDetail(slug, locale);
  if (!detail) notFound();

  const { template, isPurchasable } = detail;

  const [t, access] = await Promise.all([
    getTranslations('checkout'),
    getAccessState(user.id, template.id),
  ]);

  const libraryHref = `/${locale}/library`;
  const expireMinutes = getServerEnv().ORDER_EXPIRE_MINUTES;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>

      <section aria-labelledby="checkout-template-heading" className="flex flex-col gap-1 rounded-lg border border-border p-4">
        <h2 id="checkout-template-heading" className="text-sm text-muted-foreground">
          {t('templateHeading')}
        </h2>
        <p className="text-lg font-semibold text-foreground">{template.title}</p>
        <p className="text-sm text-muted-foreground">{template.summary}</p>
      </section>

      {access.owned ? (
        // F2-AC7: 결제 진행 전에 차단하고 라이브러리 이동 경로를 제공한다.
        <section role="status" className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <h2 className="text-base font-semibold text-foreground">{t('alreadyOwnedTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('alreadyOwnedDescription')}</p>
          <Link href={libraryHref} className={cn(buttonVariants({ variant: 'default' }), 'w-fit')}>
            {t('alreadyOwnedAction')}
          </Link>
        </section>
      ) : !isPurchasable ? (
        // F1-AC8: 판매 중지·삭제된 템플릿은 결제 화면에서도 진행 수단을 제공하지 않는다.
        <section role="status" className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-foreground">{t('notPurchasable')}</p>
            <Link
              href={`/${locale}/templates/${template.slug}`}
              className={cn(buttonVariants({ variant: 'outline' }), 'w-fit')}
            >
              {template.title}
            </Link>
          </div>
        </section>
      ) : (
        <>
          <CheckoutButton
            templateSlug={template.slug}
            priceKrw={template.priceKrw}
            priceUsd={template.priceUsd}
            locale={locale}
            libraryHref={libraryHref}
            refundWindowDays={REFUND_WINDOW_DAYS}
          />

          {/* F2-AC9: 30분 내 미완료 시 만료된다는 사실을 결제 전에 알린다. */}
          <p className="text-sm text-muted-foreground">{t('expiresNotice', { minutes: expireMinutes })}</p>
        </>
      )}
    </div>
  );
}
