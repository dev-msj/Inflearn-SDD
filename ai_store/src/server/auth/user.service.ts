import 'server-only';

import { Prisma } from '@prisma/client';

import { hashPassword, PASSWORD_MIN_LENGTH } from '@/lib/auth';
import { db } from '@/lib/db';
import { EmailTakenError } from '@/lib/errors';
import { LOCALES } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';
import { z } from 'zod';

/**
 * 회원 생성 공용 서비스.
 *
 * ★왜 별도 파일인가
 *   회원가입 경로가 두 개(서버 액션 `signUpAction`, REST `POST /api/auth/signup`)이고,
 *   두 경로 모두 "비밀번호 해싱"과 "중복 이메일 판정"이라는 보안 로직을 필요로 한다.
 *   각자 구현하면 한쪽만 해시 파라미터가 바뀌거나 P2002 처리가 빠지는 사고가 난다.
 *   따라서 두 경로가 이 함수 하나만 호출하도록 강제한다.
 *
 * ★비밀번호 원문은 어떤 경우에도 로그·반환값에 담지 않는다.
 * ★이메일 원문도 예외 메시지에 담지 않는다(응답·로그를 통한 계정 열거 방지).
 */

/** 회원가입 입력 스키마. 서버 액션과 API 라우트가 동일한 규칙으로 검증한다. */
export const createUserSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(1024),
  name: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((value) => (value ? value : undefined)),
  locale: z.enum(LOCALES),
});

export interface CreateUserInput {
  email: string;
  password: string;
  name?: string;
  locale: AppLocale;
}

export interface CreateUserResult {
  userId: string;
}

/**
 * 이메일 회원 생성.
 *
 * @throws EmailTakenError 이미 가입된 이메일(users.email UNIQUE 위반 = Prisma P2002)
 */
export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  // 해시는 DB INSERT 전에 계산한다. 트랜잭션 안에서 수행하면 argon2 연산 시간만큼 커넥션을 점유한다.
  const passwordHash = await hashPassword(input.password);

  try {
    const user = await db.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        locale: input.locale,
      },
      select: { id: true },
    });

    return { userId: user.id };
  } catch (error) {
    // email 컬럼은 citext + UNIQUE라 대소문자만 다른 재가입도 여기서 걸린다.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new EmailTakenError();
    }
    throw error;
  }
}
