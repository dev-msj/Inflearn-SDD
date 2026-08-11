import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import '@/app/globals.css';
import { Footer } from '@/components/layout/Footer';
import { Header, MAIN_CONTENT_ID } from '@/components/layout/Header';
import { Toaster } from '@/components/ui/toaster';
import { isAppLocale, LOCALES } from '@/i18n/routing';

/**
 * 로케일 레이아웃 (비기능 요구: ko/en 2개 언어).
 *
 * ★`<html lang>`이 여기 있는 이유
 *   스크린리더는 lang 속성으로 발음 엔진을 고른다. 로케일을 알 수 있는 가장 바깥 경계가 이 레이아웃이다.
 *
 * ★`NextIntlClientProvider`는 클라이언트 컴포넌트에 메시지를 전달하기 위한 것이다.
 *   서버 컴포넌트(Header/Footer)는 프로바이더 없이도 `getTranslations()`로 문구를 읽지만,
 *   CopyButton·SearchBar 같은 클라이언트 컴포넌트는 이 프로바이더가 없으면 렌더 시 예외가 난다.
 *
 * ★`<Toaster/>`는 앱 전체에서 **한 번만** 마운트한다.
 *   여러 번 마운트하면 같은 토스트가 중복 표시된다(F3-AC2 복사 완료 안내).
 */

interface LocaleLayoutProps {
  children: ReactNode;
  // Next.js 15: params는 Promise다.
  params: Promise<{ locale: string }>;
}

/** 지원 로케일을 미리 알려 두면 Next가 두 경로를 모두 인지한다. */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) return {};

  const t = await getTranslations({ locale, namespace: 'app' });
  return {
    title: { default: t('name'), template: `%s · ${t('name')}` },
    description: t('tagline'),
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;

  // 지원하지 않는 로케일 세그먼트(`/fr/...`)는 404. 메시지 로딩 실패로 500이 나는 것을 막는다.
  if (!isAppLocale(locale)) notFound();

  const messages = await getMessages({ locale });

  return (
    <html lang={locale}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <div className="flex min-h-screen flex-col">
            <Header locale={locale} />

            {/* Header의 "본문으로 건너뛰기" 링크가 가리키는 지점이다. id를 바꾸면 링크도 함께 바꿔야 한다. */}
            <main id={MAIN_CONTENT_ID} className="container flex-1 py-6">
              {children}
            </main>

            <Footer />
          </div>

          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
