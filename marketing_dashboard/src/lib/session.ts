import 'server-only';
import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { ApiException } from '@/lib/api-error';
import { env } from '@/lib/env';
import type { SessionData, SessionUser } from '@/types/api';

/**
 * iron-session 기반 stateless 세션 (TECH_SPEC 3. 기능 1 > 1-A).
 * GitHub 액세스 토큰은 AES-GCM 암호화 쿠키 안에서만 존재하고 클라이언트로 내려가지 않는다 (AC-2.7).
 *
 * `password`·`secure` 는 getter 로 두어 모듈 로드 시점이 아닌 **사용 시점**에 환경 변수를 읽는다.
 */
export const sessionOptions: SessionOptions = {
  get password(): string {
    return env.SESSION_SECRET;
  },
  cookieName: 'md_session',
  ttl: 60 * 60 * 8, // 8시간
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    get secure(): boolean {
      return env.isProduction;
    },
    path: '/',
  },
};

/** 현재 요청의 세션 객체 */
export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

/** 로그인한 사용자. 미로그인 시 null (AC-1.1) */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session.accessToken || !session.user) return null;
  return session.user;
}

/** 세션이 없으면 `UNAUTHORIZED` 예외. Route Handler 인증 가드 */
export async function requireSession(): Promise<SessionData> {
  const session = await getSession();
  if (!session.accessToken || !session.user) {
    throw new ApiException('UNAUTHORIZED');
  }
  return {
    accessToken: session.accessToken,
    user: session.user,
    createdAt: session.createdAt,
  };
}

/** 세션 쿠키 파기 (AC-1.9) */
export async function destroySession(): Promise<void> {
  const session = await getSession();
  session.destroy();
}
