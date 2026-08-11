import { FileQuestion } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * 404 안내 (F1-AC8 보조).
 *
 * 존재하지 않는 템플릿·주문 경로에서 `notFound()`가 호출되면 이 화면이 렌더된다.
 * 빈 화면 대신 "다음에 무엇을 할 수 있는지"(전체 목록으로 이동)를 반드시 제공한다.
 *
 * ★로케일은 `getLocale()`로 읽는다. not-found 렌더 경로에는 `params`가 전달되지 않기 때문이다.
 */
export default async function LocaleNotFound() {
  const [t, locale] = await Promise.all([getTranslations('errors'), getLocale()]);

  return (
    <section className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-4 py-16 text-center">
      <FileQuestion className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-xl font-semibold text-foreground">{t('notFoundTitle')}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t('notFoundDescription')}</p>
      <Link href={`/${locale}`} className={cn(buttonVariants({ variant: 'default' }))}>
        {t('notFoundAction')}
      </Link>
    </section>
  );
}
