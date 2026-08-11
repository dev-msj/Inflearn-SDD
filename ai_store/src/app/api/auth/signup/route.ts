import { jsonError, jsonOk } from '@/lib/http';
import { createUser, createUserSchema } from '@/server/auth/user.service';
import type { SignupResponse } from '@/types/api';

/**
 * POST /api/auth/signup — 이메일 회원가입.
 *
 * 201 `{ userId }` / 409 `EMAIL_TAKEN` / 400 `VALIDATION_ERROR`
 *
 * ★해싱·중복 판정은 `server/auth/user.service.ts`가 담당한다.
 *   서버 액션(signUpAction)과 같은 함수를 쓰므로 두 경로의 보안 규칙이 갈라지지 않는다.
 *
 * ★argon2 네이티브 모듈 때문에 Node.js 런타임이 필요하다.
 * ★비밀번호 원문은 응답·로그 어디에도 남기지 않는다.
 */
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    // 파싱 실패(ZodError)는 jsonError가 400 VALIDATION_ERROR로 정규화한다.
    const input = createUserSchema.parse(body);

    const result = await createUser({
      email: input.email,
      password: input.password,
      name: input.name,
      locale: input.locale,
    });

    return jsonOk<SignupResponse>({ userId: result.userId }, { status: 201 });
  } catch (error) {
    return jsonError(error, { route: 'auth/signup' });
  }
}
