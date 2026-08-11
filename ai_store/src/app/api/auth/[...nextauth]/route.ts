import { handlers } from '@/lib/auth';

/**
 * Auth.js v5 표준 핸들러 (F3-AC4/8).
 *
 * ★argon2(@node-rs/argon2)는 네이티브 모듈이라 Edge 런타임에서 동작하지 않는다.
 *   비밀번호 검증이 이 경로에서 일어나므로 Node.js 런타임을 명시한다.
 *
 * 로그인·로그아웃·세션 조회는 전부 Auth.js가 처리하며, 이 파일에 자체 로직을 추가하지 않는다.
 * 세션·자격 증명 규칙은 `src/lib/auth.ts` 한 곳에만 존재해야 한다.
 */
export const runtime = 'nodejs';

export const { GET, POST } = handlers;
