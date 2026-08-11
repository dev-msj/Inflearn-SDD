import { z } from 'zod';

/**
 * 환경 변수 검증 (TECH_SPEC 9장).
 *
 * 서버/클라이언트 스키마를 분리하는 이유:
 *  - 시크릿(TOSS_SECRET_KEY, PADDLE_API_KEY, AUTH_SECRET 등)이 클라이언트 번들에 절대 들어가면 안 된다.
 *  - Next.js는 `process.env.X`를 "텍스트 그대로" 치환하므로, 서버 스키마를 객체 spread로 만들면
 *    번들러가 시크릿까지 인라인할 위험이 있다. 따라서 서버 값은 개별 프로퍼티 참조로만 읽는다.
 *  - 클라이언트 노출이 허용된 값에만 NEXT_PUBLIC_ 접두사를 붙인다
 *    (NEXT_PUBLIC_TOSS_CLIENT_KEY / NEXT_PUBLIC_PADDLE_CLIENT_TOKEN / NEXT_PUBLIC_PADDLE_ENV).
 *
 * 검증 시점: 최초 접근 시 1회(메모이즈). db.ts·auth.ts 같은 서버 모듈이 부팅 시 곧바로 접근하므로
 * 사실상 부팅 검증과 동일하게 동작하며, 타입 체크·테스트처럼 값이 없어도 되는 실행 경로에서는
 * 불필요한 예외가 발생하지 않는다.
 */

/** '1' | 'true' 문자열을 boolean으로 변환. .env 파일은 모든 값이 문자열이다. */
const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

/** 숫자형 환경 변수. 빈 문자열/undefined일 때 기본값을 쓰도록 preprocess 한다. */
const intWithDefault = (fallback: number) =>
  z.preprocess(
    (v) => (v === undefined || v === '' ? fallback : Number(v)),
    z.number().int().positive(),
  );

const serverEnvSchema = z.object({
  // ── 애플리케이션 ──
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_BASE_URL: z.string().url(),
  DEFAULT_LOCALE: z.enum(['ko', 'en']).default('ko'),

  // ── 데이터베이스 ──
  DATABASE_URL: z.string().min(1),

  // ── 인증 (Auth.js) ──
  AUTH_SECRET: z.string().min(1),
  AUTH_TRUST_HOST: booleanish.default(true),

  // ── 토스페이먼츠 (KRW) ──
  TOSS_SECRET_KEY: z.string().min(1),
  TOSS_WEBHOOK_SECRET: z.string().min(1),
  TOSS_API_BASE_URL: z.string().url().default('https://api.tosspayments.com'),
  /**
   * 선택 보조 방어(TECH_SPEC 6장 toss.signature). 쉼표 구분 IP 목록.
   * 미설정이면 IP 화이트리스트 검사를 건너뛴다 — 확정 판단은 조회 API가 담당하므로
   * 이 값이 없어도 금전적 오확정으로 이어지지 않는다.
   */
  TOSS_WEBHOOK_ALLOWED_IPS: z.string().optional(),

  // ── Paddle (USD) ──
  PADDLE_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  PADDLE_API_KEY: z.string().min(1),
  PADDLE_NOTIFICATION_SECRET: z.string().min(1),
  /** 템플릿 slug → Paddle price id 매핑(N4 미결로 환경 변수 유지). 미설정이면 빈 객체. */
  PADDLE_PRICE_ID_MAP_JSON: z
    .string()
    .default('{}')
    .transform((raw, ctx) => {
      try {
        const parsed: unknown = JSON.parse(raw || '{}');
        return z.record(z.string()).parse(parsed);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'PADDLE_PRICE_ID_MAP_JSON must be a JSON object of string values',
        });
        return z.NEVER;
      }
    }),

  // ── 메일 ──
  RESEND_API_KEY: z.string().min(1),
  MAIL_FROM: z.string().min(1),
  OPERATOR_ALERT_EMAIL: z.string().email(),

  // ── 배치 ──
  CRON_SECRET: z.string().min(1),
  RECONCILE_LOOKBACK_HOURS: intWithDefault(72),
  RECONCILE_INCIDENT_AFTER_HOURS: intWithDefault(24),
  ORDER_EXPIRE_MINUTES: intWithDefault(30),
});

const clientEnvSchema = z.object({
  NEXT_PUBLIC_TOSS_CLIENT_KEY: z.string().min(1),
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: z.string().min(1),
  NEXT_PUBLIC_PADDLE_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;

let serverEnvCache: ServerEnv | null = null;
let clientEnvCache: ClientEnv | null = null;

function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
}

/**
 * 서버 전용 환경 변수. 클라이언트에서 호출하면 즉시 예외를 던져 시크릿 접근을 막는다.
 * 값 자체는 오류 메시지에 절대 포함하지 않는다(키 유출 방지).
 */
export function getServerEnv(): ServerEnv {
  if (serverEnvCache) return serverEnvCache;

  if (typeof window !== 'undefined') {
    throw new Error('getServerEnv() must not be called in the browser.');
  }

  const parsed = serverEnvSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    APP_BASE_URL: process.env.APP_BASE_URL,
    DEFAULT_LOCALE: process.env.DEFAULT_LOCALE,
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST,
    TOSS_SECRET_KEY: process.env.TOSS_SECRET_KEY,
    TOSS_WEBHOOK_SECRET: process.env.TOSS_WEBHOOK_SECRET,
    TOSS_API_BASE_URL: process.env.TOSS_API_BASE_URL,
    TOSS_WEBHOOK_ALLOWED_IPS: process.env.TOSS_WEBHOOK_ALLOWED_IPS,
    PADDLE_ENV: process.env.PADDLE_ENV,
    PADDLE_API_KEY: process.env.PADDLE_API_KEY,
    PADDLE_NOTIFICATION_SECRET: process.env.PADDLE_NOTIFICATION_SECRET,
    PADDLE_PRICE_ID_MAP_JSON: process.env.PADDLE_PRICE_ID_MAP_JSON,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    MAIL_FROM: process.env.MAIL_FROM,
    OPERATOR_ALERT_EMAIL: process.env.OPERATOR_ALERT_EMAIL,
    CRON_SECRET: process.env.CRON_SECRET,
    RECONCILE_LOOKBACK_HOURS: process.env.RECONCILE_LOOKBACK_HOURS,
    RECONCILE_INCIDENT_AFTER_HOURS: process.env.RECONCILE_INCIDENT_AFTER_HOURS,
    ORDER_EXPIRE_MINUTES: process.env.ORDER_EXPIRE_MINUTES,
  });

  if (!parsed.success) {
    throw new Error(`Invalid server environment variables:\n${formatIssues(parsed.error)}`);
  }

  serverEnvCache = parsed.data;
  return serverEnvCache;
}

/** 클라이언트 노출이 허용된 값만 담는다. 서버에서도 동일하게 사용할 수 있다. */
export function getClientEnv(): ClientEnv {
  if (clientEnvCache) return clientEnvCache;

  const parsed = clientEnvSchema.safeParse({
    NEXT_PUBLIC_TOSS_CLIENT_KEY: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY,
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
    NEXT_PUBLIC_PADDLE_ENV: process.env.NEXT_PUBLIC_PADDLE_ENV,
  });

  if (!parsed.success) {
    throw new Error(`Invalid public environment variables:\n${formatIssues(parsed.error)}`);
  }

  clientEnvCache = parsed.data;
  return clientEnvCache;
}

/** 로그 레벨·에러 상세 노출 여부 판단에 쓰인다. */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}
