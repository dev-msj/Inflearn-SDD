import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import type { AppLocale } from '@/i18n/routing';
import type { TemplateCardView } from '@/types/domain';

/**
 * 목록 카드 (F1-AC1).
 *
 * 표시 항목: 대표 이미지 · 카테고리 · 제목 · 가격(KRW/USD 병기).
 * 가격을 두 통화 모두 보여주는 이유는 통화별 개별 고정가(D4)이기 때문이다.
 * 환산 표기가 아니므로 "약 ~원" 같은 근사 표현을 쓰지 않는다.
 *
 * ★프롬프트 전문(body)은 물론 previewText도 받지 않는다.
 *   목록 응답 타입(TemplateCardView)에 두 필드가 아예 없다(F1-AC6).
 */
interface TemplateCardProps {
  template: TemplateCardView;
  locale: AppLocale;
}

export function TemplateCard({ template, locale }: TemplateCardProps) {
  const t = useTranslations('templates');
  const format = useFormatter();

  const priceKrw = t('priceKrw', { amount: format.number(template.priceKrw) });
  const priceUsd = t('priceUsd', { amount: template.priceUsd });

  return (
    <article className="h-full">
      <Link
        href={`/${locale}/templates/${template.slug}`}
        className="flex h-full flex-col gap-3 rounded-lg border border-border bg-background p-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {/*
          next/image 대신 <img>를 쓴다.
          썸네일이 SVG라 next/image 최적화 경로에서 `dangerouslyAllowSVG` 설정이 필요한데,
          이미지 1종을 위해 SVG 인라인 허용을 켜는 것은 불필요한 공격 표면이다.
        */}
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-md bg-muted">
          <img
            src={template.thumbnailUrl}
            alt={t('thumbnailAlt', { title: template.title })}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </div>

        <Badge variant="secondary" className="w-fit">
          {template.categoryName}
        </Badge>

        <h3 className="text-base font-semibold text-foreground">{template.title}</h3>
        <p className="line-clamp-2 flex-1 text-sm text-muted-foreground">{template.summary}</p>

        <p className="text-sm font-medium text-foreground">
          {t('priceBoth', { krw: priceKrw, usd: priceUsd })}
        </p>
      </Link>
    </article>
  );
}
