/**
 * 환경변수 로드 및 검증 (TECH_SPEC §5 환경변수)
 *
 * !! 서버 전용 모듈 !!
 * GITHUB_APP_CLIENT_SECRET / SESSION_SECRET을 다루므로 클라이언트 번들에 포함되면 안 된다.
 * NEXT_PUBLIC_ 접두사를 쓰지 않으므로 값 자체는 브라우저로 나가지 않지만,
 * 실수로 클라이언트 컴포넌트가 import하는 것을 빌드 단계에서 차단하기 위해 server-only를 선언한다.
 */
import 'server-only';

/** 필수 환경변수 목록 (.env.local.example과 1:1 대응) */
export const REQUIRED_ENV_KEYS = [
  'GITHUB_APP_CLIENT_ID',
  'GITHUB_APP_CLIENT_SECRET',
  'GITHUB_APP_SLUG',
  'SESSION_SECRET',
  'APP_BASE_URL',
] as const;

export type RequiredEnvKey = (typeof REQUIRED_ENV_KEYS)[number];

/** iron-session 암호화 키 최소 길이 */
export const SESSION_SECRET_MIN_LENGTH = 32;

export type AppEnv = Record<RequiredEnvKey, string>;

let cachedEnv: AppEnv | null = null;

function readMissingKeys(): RequiredEnvKey[] {
  return REQUIRED_ENV_KEYS.filter((key) => {
    const value = process.env[key];
    return value === undefined || value.trim().length === 0;
  });
}

/**
 * 필수 환경변수 검증. 누락/형식 위반 시 즉시 예외를 던진다.
 * 값 자체는 메시지에 절대 포함하지 않고 키 이름만 노출한다.
 */
export function assertEnv(): void {
  const missing = readMissingKeys();
  if (missing.length > 0) {
    throw new Error(
      `[env] 필수 환경변수가 설정되지 않았습니다: ${missing.join(', ')}. ` +
        '.env.local.example을 복사해 .env.local을 만들고 값을 채워 주세요.',
    );
  }

  const sessionSecret = process.env.SESSION_SECRET ?? '';
  if (sessionSecret.length < SESSION_SECRET_MIN_LENGTH) {
    throw new Error(
      `[env] SESSION_SECRET은 최소 ${SESSION_SECRET_MIN_LENGTH}자 이상이어야 합니다. (현재 ${sessionSecret.length}자)`,
    );
  }

  const baseUrl = process.env.APP_BASE_URL ?? '';
  try {
    new URL(baseUrl);
  } catch {
    throw new Error('[env] APP_BASE_URL은 절대 URL이어야 합니다. 예: http://localhost:3000');
  }
}

/**
 * 검증된 환경변수를 반환한다. 최초 호출 시 검증을 수행하고 이후에는 캐시를 사용한다.
 * (모듈 로드 시점이 아니라 최초 사용 시점에 검증해, 환경변수 없이도 빌드는 진행되게 한다)
 */
export function getEnv(): AppEnv {
  if (cachedEnv !== null) return cachedEnv;

  assertEnv();

  const env = {} as Record<RequiredEnvKey, string>;
  for (const key of REQUIRED_ENV_KEYS) {
    env[key] = (process.env[key] ?? '').trim();
  }
  // 후행 슬래시를 제거해 redirect_uri 조합 시 '//'가 생기지 않게 한다.
  env.APP_BASE_URL = env.APP_BASE_URL.replace(/\/+$/, '');

  cachedEnv = env;
  return cachedEnv;
}

/** APP_BASE_URL 기준 절대 URL 생성. (예: buildAppUrl('/api/auth/callback')) */
export function buildAppUrl(pathname: string): string {
  const base = getEnv().APP_BASE_URL;
  return `${base}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

/** 로그·에러 메시지에 시크릿이 섞이지 않도록 마스킹한다. (TECH_SPEC §5 보안 규칙 4항) */
export function maskSecret(value: string | undefined | null): string {
  if (!value) return '(none)';
  if (value.length <= 8) return '*'.repeat(value.length);
  return `${value.slice(0, 4)}${'*'.repeat(value.length - 8)}${value.slice(-4)}`;
}
