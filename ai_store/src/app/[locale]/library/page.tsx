import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { LibraryEmpty } from '@/components/library/LibraryEmpty';
import { LibraryList } from '@/components/library/LibraryList';
import { getCurrentUser } from '@/lib/auth-guard';
import { listMyLibrary } from '@/server/library/library.service';
import { isAppLocale } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';

/**
 * 내 라이브러리 (F3-AC1/4/7).
 *
 * ★목록은 서버가 확정한 순서(granted_at DESC)를 그대로 렌더한다.
 *   소유 정보는 library_items(user_id)에만 있고 브라우저 저장소를 쓰지 않으므로,
 *   다른 기기에서 같은 계정으로 접속해도 결과가 동일하다(F3-AC4).
 *
 * ★프롬프트 전문(body)은 이 화면에 오지 않는다. 전문은 열람 페이지에서만 조회된다.
 */

export const dynamic = 'force-dynamic';

interface LibraryPageProps {
  params: Promise<{ locale: string }>;
}

export default async function LibraryPage({ params }: LibraryPageProps) {
  const { locale: rawLocale } = await params;
  if (!isAppLocale(rawLocale)) notFound();
  const locale: AppLocale = rawLocale;

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/${locale}/login?callbackUrl=${encodeURIComponent(`/${locale}/library`)}`);
  }

  const [t, items] = await Promise.all([
    getTranslations('library'),
    listMyLibrary(user.id, locale),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </header>

      {items.length === 0 ? (
        // F3-AC7: 빈 목록 대신 안내 + 템플릿 목록 경로를 제공한다.
        <LibraryEmpty locale={locale} />
      ) : (
        <LibraryList items={items} locale={locale} />
      )}
    </div>
  );
}
