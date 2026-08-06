/**
 * iron-session 기반 세션 관리 (TECH_SPEC §4 기능1 "세션 구조")
 *
 * !! 서버 전용 모듈 !!
 * AppSession.accessToken은 이 모듈 내부와 lib/github/* 에서만 다루며,
 * 어떤 응답 바디·헤더·로그에도 출력하지 않는다. (TECH_SPEC §5 보안 규칙 1항)
 *
 * 쿠키 정책: httpOnly + secure + sameSite=lax + Max-Age 미지정(세션 쿠키)
 *  → 브라우저 종료 시 즉시 폐기 (PRD 보안 요구 1·2항)
 */
import 'server-only';

import { cookies } from 'next/headers';
import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';

import { getEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';
import type { GitHubUser } from '@/types/github';

/** 암호화 쿠키에 담기는 전체 내용. 이 객체는 서버에서만 복호화된다. */
export interface AppSession {
  accessToken: string; // GitHub user access token (서버 전용, 응답 바디에 절대 포함 금지)
  refreshToken?: string; // GitHub App 만료형 토큰 사용 시
  tokenExpiresAt?: string; // ISO8601
  user: GitHubUser;
  createdAt: string;
  oauthState?: string; // 인가 요청 시 저장, 콜백에서 비교 후 삭제
}

export const SESSION_COOKIE_NAME = 'gr_session';

/**
 * 세션 옵션.
 * - `cookieOptions.maxAge: undefined`를 명시하면 iron-session이 ttl을 0으로 두고
 *   Max-Age 없는 "세션 쿠키"를 발급한다. (브라우저 종료 시 폐기)
 * - password는 실제 세션 접근 시점에 평가한다. (모듈 import 시점에 환경변수 부재로 실패하지 않도록)
 */
export const SESSION_OPTIONS: SessionOptions = {
  cookieName: SESSION_COOKIE_NAME,
  get password(): string {
    return getEnv().SESSION_SECRET;
  },
  ttl: 0,
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: undefined,
  },
};

/** 현재 요청의 세션 객체를 반환한다. (없으면 빈 세션) */
export async function getSession(): Promise<IronSession<AppSession>> {
  const cookieStore = await cookies();
  return getIronSession<AppSession>(cookieStore, SESSION_OPTIONS);
}

/** 토큰 만료 여부. tokenExpiresAt이 없으면 만료되지 않은 것으로 본다. */
export function isSessionExpired(session: AppSession, now: Date = new Date()): boolean {
  if (!session.tokenExpiresAt) return false;
  const expiresAt = Date.parse(session.tokenExpiresAt);
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt <= now.getTime();
}

/** 세션에 인증 정보가 존재하는지 판정한다. */
export function isAuthenticated(session: Partial<AppSession>): session is AppSession {
  return typeof session.accessToken === 'string' && session.accessToken.length > 0 && session.user !== undefined;
}

/**
 * 인증된 세션을 반환한다.
 * - 미인증: AppError('UNAUTHENTICATED')
 * - 만료: 세션을 파기하고 AppError('SESSION_EXPIRED')
 */
export async function requireSession(): Promise<AppSession> {
  const session = await getSession();

  if (!isAuthenticated(session)) {
    throw new AppError('UNAUTHENTICATED');
  }

  if (isSessionExpired(session)) {
    session.destroy();
    throw new AppError('SESSION_EXPIRED');
  }

  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    tokenExpiresAt: session.tokenExpiresAt,
    user: session.user,
    createdAt: session.createdAt,
    oauthState: session.oauthState,
  };
}

/** 세션 필드를 병합 저장한다. (부분 갱신) */
export async function saveSession(patch: Partial<AppSession>): Promise<void> {
  const session = await getSession();
  Object.assign(session, patch);
  await session.save();
}

/** 로그인 성공 시 세션을 새로 생성한다. 기존 값(oauthState 포함)은 모두 폐기된다. */
export async function createSession(data: {
  accessToken: string;
  user: GitHubUser;
  refreshToken?: string;
  tokenExpiresAt?: string;
}): Promise<void> {
  const session = await getSession();
  session.destroy();

  session.accessToken = data.accessToken;
  session.user = data.user;
  session.createdAt = new Date().toISOString();
  if (data.refreshToken !== undefined) session.refreshToken = data.refreshToken;
  if (data.tokenExpiresAt !== undefined) session.tokenExpiresAt = data.tokenExpiresAt;
  delete session.oauthState;

  await session.save();
}

/** 세션 쿠키를 파기한다. (로그아웃) */
export async function destroySession(): Promise<void> {
  const session = await getSession();
  session.destroy();
}
