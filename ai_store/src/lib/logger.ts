import { isProduction } from './env';
import { isAppError } from './errors';

/**
 * 구조화 로그.
 *
 * 목적
 *  - 결제 흐름은 리디렉션·웹훅·배치 3개 경로가 같은 주문을 건드린다. 세 경로의 로그를
 *    하나로 묶어 추적할 수 있도록 **orderNo를 상관관계 ID**로 삼는다.
 *  - 미확정 결제(F2-AC11) 조사 시 orderNo 하나로 전 구간을 grep 할 수 있어야 한다.
 *
 * 안전장치
 *  - 비밀번호·해시·시크릿·토큰·카드 정보는 어떤 경우에도 로그에 남기지 않는다
 *    (PRD 비기능 보안: "응답·로그에 해시 미포함", "카드정보 미보관").
 *    키 이름 기반으로 재귀 마스킹하므로, 실수로 payload 전체를 넘겨도 값이 노출되지 않는다.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  /** 결제 흐름 상관관계 ID */
  orderNo?: string;
  userId?: string;
  templateId?: string;
  provider?: string;
  eventId?: string;
  jobName?: string;
  [key: string]: unknown;
}

/** 값 자체가 비밀인 키. 부분 일치(소문자 비교)로 판정한다. */
const REDACTED_KEY_PATTERNS = [
  'password',
  'passwordhash',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'clientkey',
  'cardnumber',
  'card_number',
  'cvc',
  'virtualaccount',
] as const;

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 4;

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-\s]/g, '');
  return REDACTED_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/** 로그에 실릴 값에서 민감 필드를 재귀적으로 제거한다. 깊이 제한으로 순환 참조를 방어한다. */
function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth >= MAX_DEPTH) return '[TRUNCATED]';

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = isSensitiveKey(key) ? REDACTED : redact(item, depth + 1);
    }
    return output;
  }

  return value;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** 운영에서는 debug 로그를 남기지 않는다(전문·페이로드가 과다하게 쌓이는 것을 방지). */
function minimumLevel(): LogLevel {
  return isProduction() ? 'info' : 'debug';
}

function serializeError(error: unknown): Record<string, unknown> {
  if (isAppError(error)) {
    return {
      name: error.name,
      code: error.code,
      status: error.status,
      message: error.message,
      details: redact(error.details),
    };
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: isProduction() ? undefined : error.stack };
  }
  return { message: String(error) };
}

function write(level: LogLevel, message: string, context: LogContext, error?: unknown): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minimumLevel()]) return;

  const entry: Record<string, unknown> = {
    level,
    time: new Date().toISOString(),
    message,
    ...(redact(context) as Record<string, unknown>),
  };
  if (error !== undefined) entry.error = serializeError(error);

  const line = JSON.stringify(entry);
  // 구조화 로그는 stdout/stderr 한 줄 JSON으로만 내보낸다(수집기 파싱 전제).
  if (level === 'error') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext, error?: unknown): void;
  error(message: string, context?: LogContext, error?: unknown): void;
  /** 상관관계 ID를 고정한 하위 로거. 예: `logger.child({ orderNo })` */
  child(context: LogContext): Logger;
}

function createLogger(base: LogContext): Logger {
  return {
    debug: (message, context) => write('debug', message, { ...base, ...context }),
    info: (message, context) => write('info', message, { ...base, ...context }),
    warn: (message, context, error) => write('warn', message, { ...base, ...context }, error),
    error: (message, context, error) => write('error', message, { ...base, ...context }, error),
    child: (context) => createLogger({ ...base, ...context }),
  };
}

export const logger: Logger = createLogger({});

/** 주문 단위 로거를 만드는 단축 함수. 결제 3경로(리디렉션/웹훅/배치)에서 동일하게 사용한다. */
export function orderLogger(orderNo: string, context: LogContext = {}): Logger {
  return logger.child({ orderNo, ...context });
}
