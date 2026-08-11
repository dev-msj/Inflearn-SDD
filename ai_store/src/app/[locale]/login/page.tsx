import { AuthError } from 'next-auth';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { signIn } from '@/lib/auth';
import { isAppLocale } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';

/**
 * 로그인 (F3-AC8).
 *
 * ★로그인 성공 후 원래 화면 복귀
 *   미들웨어가 보호 경로 접근 시 `?callbackUrl=<원래 경로>`를 붙여 이 화면으로 보낸다.
 *   그 값을 Auth.js `signIn()`의 `redirectTo`로 그대로 넘겨 복귀를 Auth.js가 처리하게 한다.
 *
 * ★오픈 리다이렉트 방지
 *   callbackUrl은 `/`로 시작하고 `//`로 시작하지 않는 **앱 내부 경로**만 허용한다.
 *   외부 도메인을 넣어도 무시되고 기본 경로로 복귀한다.
 *
 * ★클라이언트 컴포넌트를 쓰지 않는 이유
 *   자격 증명은 서버 액션으로 곧장 전달하는 편이 안전하고, 오류 표시도
 *   쿼리 파라미터(`?error=1`) + 서버 렌더로 충분하다. JS가 없어도 로그인할 수 있다.
 */

export const dynamic = 'force-dynamic';

type SearchParamValue = string | string[] | undefined;

interface LoginPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, SearchParamValue>>;
}

function readSingle(value: SearchParamValue): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.length > 0 ? raw : undefined;
}

/** 앱 내부 경로만 복귀 대상으로 허용한다. */
function sanitizeCallbackUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

const EMAIL_INPUT_ID = 'login-email';
const PASSWORD_INPUT_ID = 'login-password';

export default async function LoginPage({ params, searchParams }: LoginPageProps) {
  const { locale: rawLocale } = await params;
  if (!isAppLocale(rawLocale)) notFound();
  const locale: AppLocale = rawLocale;

  const query = await searchParams;
  const callbackUrl = sanitizeCallbackUrl(readSingle(query.callbackUrl));
  const signedUp = readSingle(query.signup) === 'success';
  const hasError = readSingle(query.error) !== undefined;

  const t = await getTranslations('auth');

  /** 로그인 처리. 성공 시 Auth.js가 callbackUrl(없으면 목록)로 리다이렉트한다. */
  async function loginAction(formData: FormData) {
    'use server';

    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');
    const target = callbackUrl ?? `/${locale}`;

    try {
      await signIn('credentials', { email, password, redirectTo: target });
    } catch (error) {
      // 자격 증명 오류만 화면으로 되돌린다.
      // 성공 시 Auth.js가 던지는 NEXT_REDIRECT는 AuthError가 아니므로 그대로 재전파된다.
      if (error instanceof AuthError) {
        const params = new URLSearchParams({ error: '1' });
        if (callbackUrl) params.set('callbackUrl', callbackUrl);
        redirect(`/${locale}/login?${params.toString()}`);
      }
      throw error;
    }
  }

  const signupHref = callbackUrl
    ? `/${locale}/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : `/${locale}/signup`;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">{t('loginTitle')}</h1>

      {/* 회원가입 직후 복귀 안내 (auth.actions.signUpAction이 ?signup=success로 보낸다) */}
      {signedUp ? (
        <p role="status" className="rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
          {t('signupSuccess')}
        </p>
      ) : null}

      {/* 보호 경로에서 밀려온 경우 왜 이 화면이 떴는지 알려 준다(F3-AC8). */}
      {callbackUrl && !signedUp ? (
        <p role="status" className="rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
          {t('loginRequired')}
        </p>
      ) : null}

      {hasError ? (
        <p role="alert" className="text-sm text-destructive">
          {t('errors.invalidCredentials')}
        </p>
      ) : null}

      <form action={loginAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={EMAIL_INPUT_ID} className="text-sm font-medium text-foreground">
            {t('emailLabel')}
          </label>
          <Input
            id={EMAIL_INPUT_ID}
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder={t('emailPlaceholder')}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={PASSWORD_INPUT_ID} className="text-sm font-medium text-foreground">
            {t('passwordLabel')}
          </label>
          <Input
            id={PASSWORD_INPUT_ID}
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        <Button type="submit" size="lg">
          {t('loginSubmit')}
        </Button>
      </form>

      <Link
        href={signupHref}
        className="rounded-md text-sm text-muted-foreground underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {t('toSignup')}
      </Link>
    </div>
  );
}
