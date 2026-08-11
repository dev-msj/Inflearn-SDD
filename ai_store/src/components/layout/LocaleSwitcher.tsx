'use client';

import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { isAppLocale, LOCALES, type AppLocale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * ko/en 전환 (비기능 요구: 화면 문구 2개 언어).
 *
 * 버튼이 아니라 링크로 만든 이유
 *  - 로케일 전환은 "다른 URL로 이동"이므로 링크가 올바른 시맨틱이다.
 *  - JS가 아직 로드되지 않아도 동작하고, 키보드 Tab 순서에 자연스럽게 들어간다.
 *
 * ★쿼리스트링(`?q=`, `?page=`)은 유지하지 않는다.
 *   유지하려면 `useSearchParams()`가 필요한데, 이 컴포넌트는 모든 화면의 헤더에 놓이므로
 *   정적 렌더 대상 페이지에서 Suspense 경계 요구로 빌드가 깨질 수 있다.
 *   언어 전환 시 목록 첫 페이지로 돌아가는 편이 예측 가능하다고 판단했다.
 */
function buildLocalePath(pathname: string, target: AppLocale): string {
  const segments = pathname.split('/');
  // segments[0]은 항상 빈 문자열('/foo'.split('/') === ['', 'foo'])
  if (isAppLocale(segments[1])) {
    segments[1] = target;
    return segments.join('/');
  }
  return `/${target}${pathname === '/' ? '' : pathname}`;
}

export function LocaleSwitcher() {
  const pathname = usePathname();
  const activeLocale = useLocale();
  const t = useTranslations('nav');

  const labels: Record<AppLocale, string> = {
    ko: t('languageKo'),
    en: t('languageEn'),
  };

  return (
    <nav aria-label={t('language')} className="flex items-center gap-1">
      {LOCALES.map((locale) => {
        const isActive = locale === activeLocale;

        return (
          <Link
            key={locale}
            href={buildLocalePath(pathname, locale)}
            hrefLang={locale}
            aria-current={isActive ? 'true' : undefined}
            className={cn(
              'rounded-md px-2 py-1 text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isActive
                ? 'bg-secondary font-semibold text-secondary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {labels[locale]}
          </Link>
        );
      })}
    </nav>
  );
}
