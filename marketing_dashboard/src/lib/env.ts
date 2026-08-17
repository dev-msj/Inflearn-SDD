import 'server-only';

/**
 * 서버 전용 환경 변수 접근점 (TECH_SPEC 1.1).
 *
 * - `NEXT_PUBLIC_` 접두사를 쓰지 않으므로 값이 클라이언트 번들에 포함되지 않는다 (AC-2.7).
 * - 검증은 **접근 시점**에 수행한다. 모듈 로드 시점에 throw 하면 환경 변수 없이
 *   타입 체크·빌드가 불가능해지므로 lazy getter 로 구현한다.
 */

/**
 * 기본 모델은 **별칭**을 쓴다.
 *
 * 고정 버전(`gemini-2.5-flash`)을 박아두면 그 모델이 은퇴하는 순간
 * `404 ... no longer available to new users` 로 분석·생성 기능 전체가 멈춘다(2026-08 실제 발생).
 * `-latest` 별칭은 현행 flash 모델을 따라가므로 같은 방식으로 깨지지 않는다.
 * 특정 버전에 고정해야 하면 `GEMINI_MODEL` 로 덮어쓸 수 있다.
 */
const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';
const MIN_SESSION_SECRET_LENGTH = 32;

function read(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function required(name: string): string {
  const value = read(name);
  if (value === undefined) {
    throw new Error(`환경 변수 ${name} 가 설정되지 않았습니다. .env.local 을 확인해 주세요.`);
  }
  return value;
}

export const env = {
  /** GitHub OAuth App Client ID */
  get GITHUB_CLIENT_ID(): string {
    return required('GITHUB_CLIENT_ID');
  },

  /** GitHub OAuth App Client Secret */
  get GITHUB_CLIENT_SECRET(): string {
    return required('GITHUB_CLIENT_SECRET');
  },

  /** OAuth 콜백 URL. 예: http://localhost:3000/api/auth/callback */
  get GITHUB_OAUTH_REDIRECT_URI(): string {
    return required('GITHUB_OAUTH_REDIRECT_URI');
  },

  /** iron-session 암호화 키 (32자 이상) */
  get SESSION_SECRET(): string {
    const value = required('SESSION_SECRET');
    if (value.length < MIN_SESSION_SECRET_LENGTH) {
      throw new Error(
        `환경 변수 SESSION_SECRET 는 ${MIN_SESSION_SECRET_LENGTH}자 이상이어야 합니다.`,
      );
    }
    return value;
  },

  /** Gemini API 키 */
  get GEMINI_API_KEY(): string {
    return required('GEMINI_API_KEY');
  },

  /** 사용할 Gemini 모델. 미지정 시 기본값 */
  get GEMINI_MODEL(): string {
    return read('GEMINI_MODEL') ?? DEFAULT_GEMINI_MODEL;
  },

  /**
   * 접근 허용 GitHub 로그인 ID 목록 (Q7).
   * 비어 있으면 전체 허용 = 로컬 전용 모드.
   */
  get allowedLogins(): string[] {
    const raw = read('ALLOWED_GITHUB_LOGINS');
    if (raw === undefined) return [];
    return raw
      .split(',')
      .map((login) => login.trim())
      .filter((login) => login !== '');
  },

  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  },
};
