import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';

import { DEFAULT_LOCALE, isAppLocale, routing } from '@/i18n/routing';

/**
 * 미들웨어: next-intl 로케일 처리 + 보호 경로 리다이렉트(F3-AC8).
 *
 * ★인증 판정 방식에 대한 설명
 *   미들웨어는 Edge 런타임에서 실행되므로 Prisma(`@prisma/client`)나
 *   argon2 네이티브 모듈을 import 할 수 없다. 따라서 `lib/auth.ts`의 `auth()`를 쓰지 않고
 *   **세션 쿠키의 존재 여부만** 확인한다.
 *   쿠키가 위조되어도 실제 데이터 접근은 서버 컴포넌트/Route Handler의
 *   requireUser() · assertTemplateAccess()가 다시 검증하므로 보안 경계는 유지된다.
 *   즉 여기서의 판정은 "로그인 화면으로 먼저 안내한다"는 UX 최적화다.
 */

const intlMiddleware = createIntlMiddleware(routing);

/** 인증이 필요한 경로 접두사 (로케일 세그먼트를 제거한 기준). */
const PROTECTED_PREFIXES = ['/library', '/orders', '/checkout'] as const;

/**
 * Auth.js v5 세션 쿠키 이름.
 * HTTPS 환경에서는 `__Secure-` 접두사가 붙으므로 두 이름을 모두 확인한다.
 */
const SESSION_COOKIE_NAMES = ['authjs.session-token', '__Secure-authjs.session-token'] as const;

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => {
    const value = request.cookies.get(name)?.value;
    return typeof value === 'string' && value.length > 0;
  });
}

interface SplitPath {
  locale: string;
  pathWithoutLocale: string;
}

/** `/ko/library/abc` → `{ locale: 'ko', pathWithoutLocale: '/library/abc' }` */
function splitLocale(pathname: string): SplitPath {
  const segments = pathname.split('/');
  const candidate = segments[1];

  if (isAppLocale(candidate)) {
    const rest = segments.slice(2).join('/');
    return { locale: candidate, pathWithoutLocale: rest ? `/${rest}` : '/' };
  }

  return { locale: DEFAULT_LOCALE, pathWithoutLocale: pathname };
}

function isProtected(pathWithoutLocale: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathWithoutLocale === prefix || pathWithoutLocale.startsWith(`${prefix}/`),
  );
}

export default function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const { locale, pathWithoutLocale } = splitLocale(pathname);

  if (isProtected(pathWithoutLocale) && !hasSessionCookie(request)) {
    const loginUrl = new URL(`/${locale}/login`, request.url);
    // 로그인 성공 후 원래 요청 화면으로 되돌아가기 위해 쿼리스트링까지 보존한다(F3-AC8).
    // 오픈 리다이렉트를 막기 위해 절대 URL이 아닌 경로만 전달한다.
    loginUrl.searchParams.set('callbackUrl', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return intlMiddleware(request);
}

export const config = {
  /**
   * API·정적 자산·파일 확장자가 있는 요청은 로케일 처리 대상이 아니다.
   * 특히 `/api/webhooks/*`가 리다이렉트되면 결제사 통지를 놓치므로 반드시 제외한다.
   */
  matcher: ['/((?!api|_next|_vercel|favicon.ico|.*\\..*).*)'],
};
