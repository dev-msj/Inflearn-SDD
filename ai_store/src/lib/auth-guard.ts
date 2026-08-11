import 'server-only';

import { auth, type AuthenticatedUser } from './auth';
import { AccessDeniedError, NotFoundError } from './errors';
import { DEFAULT_LOCALE, isAppLocale } from '@/i18n/routing';

/**
 * 서버 경계에서 세션·소유권을 강제하는 가드.
 *
 * 미들웨어(src/middleware.ts)의 리다이렉트는 **UX 용도**일 뿐이며,
 * 실제 접근 통제는 반드시 이 가드와 assertTemplateAccess()가 담당한다.
 * (미들웨어는 Edge 런타임이라 DB를 조회할 수 없고, API 라우트는 미들웨어 matcher에서 제외된다)
 */

/** 현재 세션 사용자. 없으면 null. 페이지가 조건부 UI를 그릴 때 사용한다. */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) return null;

  return {
    id: user.id,
    email: user.email,
    locale: isAppLocale(user.locale) ? user.locale : DEFAULT_LOCALE,
  };
}

/**
 * 인증 필수 경로의 진입 가드 (F3-AC8).
 * 미인증이면 AccessDeniedError('NOT_AUTHENTICATED') → 401.
 * 페이지에서는 이 예외를 잡아 callbackUrl을 붙인 로그인 화면으로 보낸다.
 */
export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) throw new AccessDeniedError('NOT_AUTHENTICATED');
  return user;
}

/**
 * 리소스 소유자 검증 (F3-AC5, 비기능 보안: "본인 계정의 데이터만 접근").
 *
 * ★소유자가 아니면 403이 아니라 NotFoundError를 던진다.
 *   403은 "그 주문이 존재하기는 한다"는 사실을 알려주므로,
 *   TECH_SPEC 7장의 "타인 주문도 404" 규칙을 여기서 강제한다.
 *
 * @param resourceOwnerId 리소스에 기록된 user_id. 리소스 자체가 없으면 null/undefined를 넘긴다.
 */
export async function requireOwner(resourceOwnerId: string | null | undefined): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (!resourceOwnerId || resourceOwnerId !== user.id) {
    throw new NotFoundError('Resource not found');
  }
  return user;
}

export type { AuthenticatedUser };
