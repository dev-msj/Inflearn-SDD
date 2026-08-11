import { SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';

/**
 * 검색 결과 0건 안내 (F1-AC7).
 *
 * "전체 목록 보기" 링크는 쿼리스트링을 모두 버린 `/{locale}`로 이동한다.
 * 검색어·카테고리를 남기면 "전체 목록"이라는 문구와 실제 결과가 어긋난다.
 */
interface EmptyResultProps {
  locale: AppLocale;
}

export function EmptyResult({ locale }: EmptyResultProps) {
  const t = useTranslations('templates.empty');

  return (
    <section className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-4 py-12 text-center">
      <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{t('description')}</p>
      <Link href={`/${locale}`} className={cn(buttonVariants({ variant: 'default' }))}>
        {t('action')}
      </Link>
    </section>
  );
}
