import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { LocaleSwitcher } from './LocaleSwitcher';
import { Button, buttonVariants } from '@/components/ui/button';
import { signOut } from '@/lib/auth';
import { getCurrentUser } from '@/lib/auth-guard';
import { cn } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';

/**
 * 전역 헤더 (서버 컴포넌트).
 *
 * - 세션 표시는 서버에서 판정한다. 클라이언트가 로그인 여부를 추측하지 않는다.
 * - 로그아웃은 인라인 서버 액션 + `<form method=post>`로 처리한다.
 *   GET 링크로 로그아웃하면 프리페치·크롤러가 세션을 끊을 수 있다.
 * - 맨 앞의 "본문으로 건너뛰기" 링크는 키보드 사용자가 매 페이지마다 내비게이션을
 *   반복 Tab 하지 않도록 하는 필수 장치다(비기능 접근성).
 */

/** 본문 시작 지점의 anchor id. 페이지 레이아웃의 `<main id>`와 반드시 같은 값이어야 한다. */
export const MAIN_CONTENT_ID = 'main-content';

interface HeaderProps {
  locale: AppLocale;
}

export async function Header({ locale }: HeaderProps) {
  const [t, tNav, tCommon] = await Promise.all([
    getTranslations('app'),
    getTranslations('nav'),
    getTranslations('common'),
  ]);
  const user = await getCurrentUser();

  async function logoutAction() {
    'use server';
    await signOut({ redirectTo: `/${locale}` });
  }

  const navLinkClass = cn(
    'rounded-md px-2 py-1 text-sm text-foreground transition-colors hover:bg-accent',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  );

  return (
    <header className="border-b border-border bg-background">
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
      >
        {tCommon('skipToContent')}
      </a>

      <div className="container flex flex-wrap items-center justify-between gap-2 py-3">
        <Link
          href={`/${locale}`}
          className="rounded-md text-base font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('name')}
        </Link>

        <nav aria-label={tNav('primaryLabel')} className="flex items-center gap-1">
          <Link href={`/${locale}`} className={navLinkClass}>
            {tNav('home')}
          </Link>
          {user ? (
            <Link href={`/${locale}/library`} className={navLinkClass}>
              {tNav('library')}
            </Link>
          ) : null}
        </nav>

        <div className="flex items-center gap-2" aria-label={tNav('accountLabel')}>
          <LocaleSwitcher />

          {user ? (
            <form action={logoutAction}>
              <Button type="submit" variant="outline" size="sm">
                {tNav('logout')}
              </Button>
            </form>
          ) : (
            <>
              <Link
                href={`/${locale}/login`}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                {tNav('login')}
              </Link>
              <Link
                href={`/${locale}/signup`}
                className={cn(buttonVariants({ variant: 'default', size: 'sm' }))}
              >
                {tNav('signup')}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
