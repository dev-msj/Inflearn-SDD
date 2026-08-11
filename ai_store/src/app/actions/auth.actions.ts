'use server';

import { redirect } from 'next/navigation';

import { EmailTakenError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { createUser, createUserSchema } from '@/server/auth/user.service';
import { DEFAULT_LOCALE, isAppLocale } from '@/i18n/routing';

/**
 * 회원가입 서버 액션 (F3-AC8 진입점).
 *
 * ★계정 생성 자체는 `server/auth/user.service.ts`의 createUser()가 담당한다.
 *   REST 경로(`POST /api/auth/signup`)와 동일한 해싱·중복 판정을 쓰기 위한 것으로,
 *   이 파일에는 폼 파싱과 화면 이동만 남는다.
 *
 * ★반환 상태에 사용자 문구를 담지 않는다.
 *   메시지 카탈로그(messages/{ko,en}.json)의 `auth.errors.<key>` 키만 돌려주고,
 *   문구 선택은 화면(next-intl)이 담당한다. 서버가 문구를 만들면 로케일별 분기가 두 곳으로 갈라진다.
 *
 * ★비밀번호 원문은 어떤 경우에도 로그·반환값에 담지 않는다.
 */

/** 화면이 참조할 오류 키. messages의 `auth.errors.<key>`와 1:1 대응한다. */
export type SignUpErrorKey = 'invalidEmail' | 'weakPassword' | 'emailTaken' | 'unknown';

export type SignUpState =
  | { status: 'idle' }
  | { status: 'error'; errorKey: SignUpErrorKey };

/** 오픈 리다이렉트 방지: 앱 내부 경로만 복귀 대상으로 허용한다. */
function sanitizeCallbackUrl(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

function readLocale(raw: FormDataEntryValue | null): string {
  return typeof raw === 'string' && isAppLocale(raw) ? raw : DEFAULT_LOCALE;
}

/**
 * 이메일 회원가입.
 * 성공하면 로그인 화면으로 이동하며, 원래 요청 경로(callbackUrl)를 그대로 물려준다(F3-AC8).
 */
export async function signUpAction(
  _prevState: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const locale = readLocale(formData.get('locale'));
  const callbackUrl = sanitizeCallbackUrl(formData.get('callbackUrl'));

  const parsed = createUserSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    name: formData.get('name') ?? undefined,
    locale,
  });

  if (!parsed.success) {
    const hasPasswordIssue = parsed.error.issues.some((issue) => issue.path[0] === 'password');
    return { status: 'error', errorKey: hasPasswordIssue ? 'weakPassword' : 'invalidEmail' };
  }

  const input = parsed.data;

  try {
    await createUser({
      email: input.email,
      password: input.password,
      name: input.name,
      locale: input.locale,
    });
  } catch (error) {
    // 이메일 원문은 로그에도 남기지 않는다(계정 열거 방지).
    if (error instanceof EmailTakenError) {
      return { status: 'error', errorKey: 'emailTaken' };
    }

    logger.error('signup_failed', {}, error);
    return { status: 'error', errorKey: 'unknown' };
  }

  const query = new URLSearchParams({ signup: 'success' });
  if (callbackUrl) query.set('callbackUrl', callbackUrl);

  redirect(`/${input.locale}/login?${query.toString()}`);
}
