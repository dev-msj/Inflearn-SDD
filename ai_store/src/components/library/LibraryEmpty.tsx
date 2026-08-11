import { BookOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';

/**
 * 구매 내역 없음 안내 (F3-AC7).
 *
 * 빈 `<ul>`을 그대로 두면 사용자는 "로딩 실패인지, 구매가 없는 건지" 구분할 수 없다.
 * 상태 안내와 다음 행동(템플릿 목록으로 이동)을 함께 제공한다.
 */
interface LibraryEmptyProps {
  locale: AppLocale;
}

export function LibraryEmpty({ locale }: LibraryEmptyProps) {
  const t = useTranslations('library.empty');

  return (
    <section className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-4 py-12 text-center">
      <BookOpen className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{t('description')}</p>
      <Link href={`/${locale}`} className={cn(buttonVariants({ variant: 'default' }))}>
        {t('action')}
      </Link>
    </section>
  );
}
