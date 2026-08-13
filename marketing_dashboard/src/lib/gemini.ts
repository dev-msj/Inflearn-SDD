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
const MAX_ATTEMPTS = 2; // 최초 1회 + 재시도 1회

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

/** 모델 1회 호출. 타임아웃 시 `AI_TIMEOUT`, 그 외 실패는 `AI_ERROR` */
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
    // 키·프롬프트 원문이 섞이지 않도록 원본 메시지를 전파하지 않는다 (AC-2.7)
    throw new ApiException('AI_ERROR');
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
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
    const remainingMs = deadline - Date.now();
    // 남은 예산이 없으면 재시도하지 않는다
    if (remainingMs <= 0) throw new ApiException('AI_TIMEOUT');

    // 타임아웃·호출 실패는 재시도 없이 그대로 전파한다
    const text = await requestText(prompt, responseSchema, temperature, remainingMs);

    try {
      return parse(JSON.parse(text) as unknown);
    } catch (e) {
      lastFailure = e;
      console.warn(
        `[gemini] 구조화 응답 검증 실패 (attempt ${attempt}/${MAX_ATTEMPTS}):`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  throw new ApiException(
    'AI_ERROR',
    lastFailure instanceof Error ? 'AI 응답 형식이 올바르지 않습니다.' : undefined,
  );
}
