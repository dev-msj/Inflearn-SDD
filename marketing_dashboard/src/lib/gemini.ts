import 'server-only';
import { GoogleGenAI } from '@google/genai';
import { ApiException } from '@/lib/api-error';
import { env } from '@/lib/env';

/**
 * Gemini 구조화 출력 래퍼 (TECH_SPEC 3. 기능 2 > 2-B).
 *
 * - 클라이언트가 Gemini 를 직접 호출하지 않도록 이 모듈은 `server-only` 다 (AC-2.7).
 * - 타임아웃은 `AbortController` + `Promise.race` 이중 적용 — SDK 가 signal 을 무시해도 끊긴다 (AC-2.5).
 * - JSON 파싱·스키마 검증 실패는 **1회만** 재요청한다.
 */

const DEFAULT_TEMPERATURE = 0.7;
const MAX_ATTEMPTS = 2; // 스키마 검증 실패 재시도: 최초 1회 + 재시도 1회

/** 일시적 과부하·한도 초과. 잠시 뒤 재시도하면 대개 성공한다 */
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
/** 호출 실패 재시도 횟수(최초 시도 포함) */
const MAX_REQUEST_ATTEMPTS = 4;
/** 백오프 기본 간격 — 실제 대기는 지수 증가 + 지터 */
const RETRY_BASE_DELAY_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 호출 실패의 **원인 코드만** 서버 로그에 남긴다.
 *
 * 사용자에게 가는 `AI_ERROR` 는 키·프롬프트가 새지 않도록 원본을 감추는데(AC-2.7),
 * 그 때문에 "모델 은퇴로 404" 같은 원인이 어디에도 안 남아 진단이 불가능했다.
 * 로그는 서버에만 남고 응답 본문에는 절대 포함하지 않는다.
 */
function logFailure(phase: 'request' | 'parse', detail: Record<string, unknown>): void {
  const key = env.GEMINI_API_KEY;
  const safe = JSON.stringify(detail).split(key).join('[REDACTED]');
  console.warn(`[gemini] ${phase} 실패: ${safe}`);
}

let client: GoogleGenAI | null = null;

/** 클라이언트 싱글턴. API 키는 첫 호출 시점에만 읽는다 */
function getClient(): GoogleGenAI {
  if (client === null) {
    client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }
  return client;
}

export interface GenerateStructuredParams<T> {
  prompt: string;
  responseSchema: Record<string, unknown>; // @google/genai Schema 객체
  parse: (raw: unknown) => T; // zod safeParse 래핑
  timeoutMs: number;
  temperature?: number; // 기본 0.7
}

function isAbortError(e: unknown): boolean {
  return e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError');
}

/**
 * 재시도할 가치가 있는 실패.
 *
 * `requestText` 는 키·프롬프트가 새지 않도록 원본 오류를 버리고 `AI_ERROR` 로 바꿔 던지는데,
 * 그러면 호출자가 "재시도하면 될 실패"인지 알 수 없다. 그 정보만 이 타입으로 남긴다.
 */
class TransientAiError extends Error {
  constructor(readonly status: number | null) {
    super('transient');
    this.name = 'TransientAiError';
  }
}

/** 오류 본문·프로퍼티에서 HTTP status 를 추출한다 */
function extractStatus(e: unknown): number | null {
  const err = e as { status?: unknown; message?: unknown };
  if (typeof err?.status === 'number') return err.status;

  if (typeof err?.message === 'string') {
    const matched = /"code"\s*:\s*(\d{3})/.exec(err.message);
    if (matched !== null) return Number(matched[1]);
  }
  return null;
}

/** 모델 1회 호출. 타임아웃 시 `AI_TIMEOUT`, 일시적 실패는 `TransientAiError`, 그 외는 `AI_ERROR` */
async function requestText(
  prompt: string,
  responseSchema: Record<string, unknown>,
  temperature: number,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ApiException('AI_TIMEOUT'));
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      getClient().models.generateContent({
        model: env.GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema,
          temperature,
          abortSignal: controller.signal,
        },
      }),
      timeout,
    ]);

    const text = response.text;
    if (text === undefined || text.trim() === '') {
      throw new ApiException('AI_ERROR', 'AI 응답이 비어 있습니다.');
    }
    return text;
  } catch (e) {
    if (e instanceof ApiException) throw e;
    if (isAbortError(e)) throw new ApiException('AI_TIMEOUT');

    const status = extractStatus(e);
    const err = e as { name?: string; message?: string };
    logFailure('request', {
      model: env.GEMINI_MODEL,
      errorName: err?.name ?? null,
      status,
      message: typeof err?.message === 'string' ? err.message.slice(0, 500) : String(e).slice(0, 500),
    });

    // 재시도 가치가 있는 실패인지만 호출자에게 알린다
    if (status !== null && TRANSIENT_STATUSES.has(status)) throw new TransientAiError(status);

    // 키·프롬프트 원문이 섞이지 않도록 원본 메시지를 전파하지 않는다 (AC-2.7)
    throw new ApiException('AI_ERROR');
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * 일시적 실패(429/5xx)를 지수 백오프로 재시도하며 모델을 호출한다.
 *
 * 여러 플랫폼 초안을 잇달아 생성하면 Gemini 가 `503 UNAVAILABLE`(high demand)을 돌려주는 일이 잦다.
 * 재시도하지 않으면 그 초안만 실패로 굳어 AC-3.2(3개 동시 출력)가 사실상 깨진다.
 * 모든 대기·재시도는 `deadline`(= 호출자가 준 타임아웃 예산) 안에서만 이뤄진다 (AC-2.5).
 */
async function requestWithRetry(
  prompt: string,
  responseSchema: Record<string, unknown>,
  temperature: number,
  deadline: number,
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new ApiException('AI_TIMEOUT');

    try {
      return await requestText(prompt, responseSchema, temperature, remainingMs);
    } catch (e) {
      lastError = e;

      // 타임아웃·그 외 확정 실패는 즉시 전파한다
      if (!(e instanceof TransientAiError)) throw e;
      if (attempt === MAX_REQUEST_ATTEMPTS) break;

      // 지수 백오프 + 지터(동시 요청이 같은 순간에 몰려 다시 부딪히는 것을 피한다)
      const backoffMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
      if (deadline - Date.now() <= backoffMs) throw new ApiException('AI_TIMEOUT');

      logFailure('request', {
        model: env.GEMINI_MODEL,
        transient: true,
        status: e.status,
        attempt: `${attempt}/${MAX_REQUEST_ATTEMPTS}`,
        retryInMs: backoffMs,
      });
      await sleep(backoffMs);
    }
  }

  throw lastError instanceof ApiException ? lastError : new ApiException('AI_ERROR');
}

/**
 * 구조화 JSON 생성. 타임아웃 시 `AI_TIMEOUT`, 그 외 실패는 `AI_ERROR`.
 *
 * `timeoutMs` 는 **호출 1회가 아니라 이 함수 전체**의 상한이다.
 * 재시도가 각자 새 타임아웃을 받으면 사용자 체감 대기가 상한의 2배까지 늘어나
 * AC-2.5("60초 초과 시 중단")가 사용자 관점에서 깨지기 때문이다 (M-1).
 */
export async function generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T> {
  const { prompt, responseSchema, parse, timeoutMs, temperature = DEFAULT_TEMPERATURE } = params;

  const deadline = Date.now() + timeoutMs;
  let lastFailure: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    // 타임아웃은 전파하고, 일시적 과부하(503 등)만 백오프 후 재시도한다
    const text = await requestWithRetry(prompt, responseSchema, temperature, deadline);

    try {
      return parse(JSON.parse(text) as unknown);
    } catch (e) {
      lastFailure = e;
      logFailure('parse', {
        attempt: `${attempt}/${MAX_ATTEMPTS}`,
        model: env.GEMINI_MODEL,
        message: e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500),
      });
    }
  }

  throw new ApiException(
    'AI_ERROR',
    lastFailure instanceof Error ? 'AI 응답 형식이 올바르지 않습니다.' : undefined,
  );
}
