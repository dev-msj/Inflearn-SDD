import 'server-only';

import { PrismaAdapter } from '@auth/prisma-adapter';
import { hash, verify, type Algorithm } from '@node-rs/argon2';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';

import { db } from './db';
import { getServerEnv } from './env';
import { logger } from './logger';
import { DEFAULT_LOCALE, isAppLocale } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';

/**
 * Auth.js v5 설정 (TECH_SPEC 1장 Auth 항목).
 *
 * ★TECH_SPEC과 다르게 구현한 부분 (동작하는 코드 우선)
 *   스펙은 "Credentials Provider + Prisma Adapter + 세션 DB 저장"을 명시하지만,
 *   Auth.js v5의 Credentials Provider는 **데이터베이스 세션 전략을 지원하지 않는다**
 *   (OAuth 계정처럼 Account 레코드가 없어 어댑터가 세션을 만들 수 없다).
 *   따라서 `session.strategy = 'jwt'`로 두고 Prisma Adapter는 사용자·계정 저장소로만 유지한다.
 *   F3-AC4(계정 귀속, 기기 무관 동일 라이브러리)는 소유 정보가 전적으로 library_items(user_id)에만
 *   존재하고 클라이언트 스토리지를 쓰지 않으므로 세션 전략과 무관하게 충족된다.
 */

/**
 * @node-rs/argon2의 Algorithm.Argon2id 값.
 * ambient const enum은 tsconfig의 isolatedModules 설정에서 값으로 import 할 수 없어 상수로 고정한다.
 */
const ARGON2ID = 2 as Algorithm;

/**
 * argon2id 파라미터. PRD 보안 요구("복구 불가능한 형태 저장")를 만족하며
 * 메모리 하드 특성으로 GPU 대량 크래킹에 저항한다.
 * memoryCost 19MiB / timeCost 2 / parallelism 1은 OWASP 권고 조합 중 하나다.
 */
const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** 비밀번호 최소 길이. 회원가입 API·폼 검증과 공유한다. */
export const PASSWORD_MIN_LENGTH = 8;

/** 회원가입·로그인 입력 공통 스키마. */
export const credentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(1024),
});

/** 비밀번호 해시 생성. 원문은 호출자에서도 로깅하지 않는다. */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/**
 * 비밀번호 검증.
 * 해시 형식이 깨진 경우에도 예외를 밖으로 던지지 않고 false를 반환한다.
 * (예외가 새면 "계정은 존재하지만 해시가 손상됨"이라는 정보가 응답 차이로 드러난다)
 */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password, ARGON2_OPTIONS);
  } catch (error) {
    logger.warn('password_verify_failed', {}, error);
    return false;
  }
}

function normalizeLocale(value: unknown): AppLocale {
  return isAppLocale(typeof value === 'string' ? value : undefined) ? (value as AppLocale) : DEFAULT_LOCALE;
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const env = getServerEnv();

  return {
    adapter: PrismaAdapter(db),
    secret: env.AUTH_SECRET,
    trustHost: env.AUTH_TRUST_HOST,
    session: {
      // Credentials Provider 제약으로 JWT 전략 사용(위 주석 참조).
      strategy: 'jwt',
      maxAge: 60 * 60 * 24 * 30,
    },
    pages: {
      // 로케일 접두사가 붙은 실제 로그인 화면은 미들웨어가 결정한다.
      // 여기서는 Auth.js 기본 화면으로 빠지지 않도록 기본 로케일 경로를 지정한다.
      signIn: `/${DEFAULT_LOCALE}/login`,
      error: `/${DEFAULT_LOCALE}/login`,
    },
    providers: [
      Credentials({
        name: 'credentials',
        credentials: {
          email: { label: 'Email', type: 'email' },
          password: { label: 'Password', type: 'password' },
        },
        async authorize(raw) {
          const parsed = credentialsSchema.safeParse(raw);
          if (!parsed.success) return null;

          const { email, password } = parsed.data;

          // email 컬럼은 citext라 대소문자 구분 없이 조회된다.
          const user = await db.user.findUnique({
            where: { email },
            select: { id: true, email: true, name: true, locale: true, passwordHash: true },
          });

          // 계정이 없어도 동일한 비용의 검증을 수행해 응답 시간 차이로 계정 존재 여부가
          // 드러나지 않게 한다(사용자 열거 공격 방어).
          if (!user) {
            await hashPassword(password);
            return null;
          }

          const valid = await verifyPassword(user.passwordHash, password);
          if (!valid) return null;

          // ★passwordHash는 반환 객체에 절대 포함하지 않는다. 세션·JWT로 흘러들어가기 때문이다.
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            locale: normalizeLocale(user.locale),
          };
        },
      }),
    ],
    callbacks: {
      jwt({ token, user }) {
        // user는 최초 로그인 시에만 존재한다. 이후 요청에서는 토큰 값을 유지한다.
        if (user) {
          token.appUserId = user.id;
          token.locale = normalizeLocale(user.locale);
        }
        return token;
      },
      session({ session, token }) {
        const userId = typeof token.appUserId === 'string' ? token.appUserId : (token.sub ?? '');
        session.user = {
          ...session.user,
          id: userId,
          locale: normalizeLocale(token.locale),
        };
        return session;
      },
    },
  };
});

/** 세션에서 꺼내 쓰는 최소 사용자 정보. auth-guard가 이 형태로 반환한다. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  locale: AppLocale;
}

/**
 * Auth.js 타입 확장.
 * next-auth는 타입을 @auth/core에서 re-export 하기만 하므로, 모듈 보강 대상도 @auth/core여야 한다.
 */
declare module '@auth/core/types' {
  interface User {
    locale?: AppLocale;
  }

  interface Session {
    user: User & {
      id: string;
      locale: AppLocale;
    };
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    /** `sub`와 별개로 명시 저장한다. 어댑터 없이도 사용자 ID를 안정적으로 읽기 위함. */
    appUserId?: string;
    locale?: AppLocale;
  }
}
