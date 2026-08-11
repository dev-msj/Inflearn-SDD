import { AlertTriangle } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PreviewPanel } from '@/components/templates/PreviewPanel';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/auth-guard';
import { cn } from '@/lib/utils';
import { getAccessState } from '@/server/library/access';
import { getTemplateDetail } from '@/server/templates/template.service';
import { isAppLocale } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';

/**
 * 템플릿 상세 (F1-AC4/5/6/8, F2-AC7).
 *
 * ★프롬프트 전문(body)은 이 페이지에 존재하지 않는다.
 *   `getTemplateDetail()`의 반환 타입(TemplatePreviewView)에 body 필드가 없어
 *   RSC 페이로드(=페이지 소스)에도 원문이 담기지 않는다(F1-AC6 2번 방어).
 *
 * ★구매 버튼 분기
 *   - 판매 불가(isPurchasable=false) → 안내 배너만, 구매 버튼 미렌더 (F1-AC8)
 *   - 이미 보유(owned)             → "라이브러리에서 보기" (F2-AC7 사전 차단)
 *   - 그 외                        → "구매하기" (결제 화면으로 이동)
 *   판매 불가여도 이미 구매한 사용자는 라이브러리 링크가 보인다(F1-AC8 후단 요구).
 */

export const dynamic = 'force-dynamic';

interface TemplateDetailPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export default async function TemplateDetailPage({ params }: TemplateDetailPageProps) {
  const { locale: rawLocale, slug } = await params;
  if (!isAppLocale(rawLocale)) notFound();
  const locale: AppLocale = rawLocale;

  const detail = await getTemplateDetail(slug, locale);
  if (!detail) notFound();

  const { template, isPurchasable } = detail;

  const [t, format, user] = await Promise.all([
    getTranslations('templates'),
    getFormatter(),
    getCurrentUser(),
  ]);

  // 소유 여부는 예외를 던지지 않는 조회로 판정한다. 접근 통제가 아니라 버튼 선택 용도다.
  const access = await getAccessState(user?.id ?? null, template.id);

  const priceKrw = t('priceKrw', { amount: format.number(template.priceKrw) });
  const priceUsd = t('priceUsd', { amount: template.priceUsd });
  const libraryHref = `/${locale}/library/${template.id}`;

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <Badge variant="secondary" className="w-fit">
          {template.categoryName}
        </Badge>
        <h1 className="text-2xl font-bold text-foreground">{template.title}</h1>
        <p className="text-base text-muted-foreground">{template.summary}</p>
      </header>

      <div className="overflow-hidden rounded-lg border border-border bg-muted">
        {/* next/image 대신 <img>를 쓰는 이유는 TemplateCard와 동일하다(SVG 썸네일 최적화 우회 불필요). */}
        <img
          src={template.thumbnailUrl}
          alt={t('thumbnailAlt', { title: template.title })}
          decoding="async"
          className="aspect-[16/9] w-full object-cover"
        />
      </div>

      <section aria-labelledby="template-price-heading" className="flex flex-col gap-2">
        <h2 id="template-price-heading" className="text-lg font-semibold text-foreground">
          {t('detail.priceHeading')}
        </h2>
        {/* 통화별 개별 고정가라 두 금액을 그대로 병기한다(환산 표기 아님). */}
        <p className="text-xl font-bold text-foreground">{t('priceBoth', { krw: priceKrw, usd: priceUsd })}</p>
      </section>

      <section aria-labelledby="template-description-heading" className="flex flex-col gap-2">
        <h2 id="template-description-heading" className="text-lg font-semibold text-foreground">
          {t('detail.descriptionHeading')}
        </h2>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{template.description}</p>
      </section>

      <section aria-labelledby="template-usage-heading" className="flex flex-col gap-2">
        <h2 id="template-usage-heading" className="text-lg font-semibold text-foreground">
          {t('detail.usageGuideHeading')}
        </h2>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{template.usageGuide}</p>
      </section>

      <PreviewPanel previewText={template.previewText} maskedCharCount={template.maskedCharCount} />

      <section aria-label={t('detail.priceHeading')} className="flex flex-col gap-3">
        {!isPurchasable ? (
          // F1-AC8: 판매 중지·삭제 안내. 구매 버튼은 아래 분기에서도 렌더되지 않는다.
          <div role="status" className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">{t('detail.notPurchasable')}</p>
              <p className="text-sm text-muted-foreground">{t('detail.notPurchasableHint')}</p>
            </div>
          </div>
        ) : null}

        {access.owned ? (
          <>
            <p className="text-sm text-muted-foreground">{t('detail.owned')}</p>
            <Link href={libraryHref} className={cn(buttonVariants({ variant: 'default', size: 'lg' }), 'w-fit')}>
              {t('detail.openLibrary')}
            </Link>
          </>
        ) : isPurchasable ? (
          <Link
            href={`/${locale}/checkout/${template.slug}`}
            className={cn(buttonVariants({ variant: 'default', size: 'lg' }), 'w-fit')}
          >
            {t('detail.buy')}
          </Link>
        ) : null}
      </section>
    </article>
  );
}
