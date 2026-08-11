'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { use, useActionState } from 'react';

import { signUpAction, type SignUpState } from '@/app/actions/auth.actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DEFAULT_LOCALE, isAppLocale } from '@/i18n/routing';

/**
 * 이메일 회원가입.
 *
 * ★클라이언트 컴포넌트인 이유
 *   `signUpAction`이 `useActionState` 계약(prevState, formData)으로 설계되어 있고,
 *   오류 표시가 폼 자리에서 즉시 이뤄져야 하기 때문이다(입력값 유지).
 *   가입 성공 시 액션이 서버에서 `/{locale}/login?signup=success`로 리다이렉트한다(F3-AC8 연계).
 *
 * ★비밀번호는 상태로 보관하지 않는다. 폼 필드(비제어)에서 곧바로 서버 액션으로 전달된다.
 *
 * ★Next.js 15에서 params/searchParams는 Promise다.
 *   클라이언트 컴포넌트에서는 `React.use()`로 읽는다.
 */

const INITIAL_STATE: SignUpState = { status: 'idle' };

const EMAIL_INPUT_ID = 'signup-email';
const PASSWORD_INPUT_ID = 'signup-password';
const NAME_INPUT_ID = 'signup-name';

type SearchParamValue = string | string[] | undefined;

interface SignupPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, SearchParamValue>>;
}

function readSingle(value: SearchParamValue): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.length > 0 ? raw : undefined;
}

/** 오픈 리다이렉트 방지: 앱 내부 경로만 가입 후 복귀 대상으로 넘긴다. */
function sanitizeCallbackUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

export default function SignupPage({ params, searchParams }: SignupPageProps) {
  const { locale: rawLocale } = use(params);
  const query = use(searchParams);

  const locale = isAppLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const callbackUrl = sanitizeCallbackUrl(readSingle(query.callbackUrl));

  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const [state, formAction, isPending] = useActionState(signUpAction, INITIAL_STATE);

  const loginHref = callbackUrl
    ? `/${locale}/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : `/${locale}/login`;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">{t('signupTitle')}</h1>

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />
        {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}

        <div className="flex flex-col gap-1">
          <label htmlFor={EMAIL_INPUT_ID} className="text-sm font-medium text-foreground">
            {t('emailLabel')}
            <span className="ml-1 text-muted-foreground">({tCommon('required')})</span>
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
            <span className="ml-1 text-muted-foreground">({tCommon('required')})</span>
          </label>
          <Input
            id={PASSWORD_INPUT_ID}
            name="password"
            type="password"
            autoComplete="new-password"
            required
            aria-describedby="signup-password-hint"
          />
          <p id="signup-password-hint" className="text-xs text-muted-foreground">
            {t('passwordHint')}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={NAME_INPUT_ID} className="text-sm font-medium text-foreground">
            {t('nameLabel')}
            <span className="ml-1 text-muted-foreground">({tCommon('optional')})</span>
          </label>
          <Input id={NAME_INPUT_ID} name="name" type="text" autoComplete="name" />
        </div>

        {/* 서버는 문구가 아니라 오류 키만 돌려준다. 문구 선택은 화면(next-intl)의 책임이다. */}
        {state.status === 'error' ? (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors.${state.errorKey}`)}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={isPending}>
          {t('signupSubmit')}
        </Button>
      </form>

      <Link
        href={loginHref}
        className="rounded-md text-sm text-muted-foreground underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {t('toLogin')}
      </Link>
    </div>
  );
}
