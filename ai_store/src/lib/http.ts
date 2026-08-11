import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { AppError, ValidationError, isAppError, toAppError } from './errors';
import { logger } from './logger';
import type { ApiErrorResponse } from '@/types/api';

/**
 * Route Handler 응답 헬퍼 (TECH_SPEC 7장).
 * 모든 오류 응답은 `{ "error": { "code", "message", "details"? } }` 형식으로 통일한다.
 */

export interface JsonInit {
  status?: number;
  headers?: HeadersInit;
}

/** 성공 응답. 기본 200, 생성은 201을 명시적으로 넘긴다. */
export function jsonOk<T>(data: T, init: JsonInit = {}): NextResponse<T> {
  return NextResponse.json(data, { status: init.status ?? 200, headers: init.headers });
}

/**
 * 오류 응답.
 *
 * - AppError는 자신의 status/code를 그대로 사용한다.
 * - ZodError는 400 VALIDATION_ERROR로 정규화한다.
 * - 그 외 예외는 500 INTERNAL_ERROR로 감싸고 원본 메시지를 응답에 노출하지 않는다
 *   (스택·쿼리 등 내부 정보 유출 방지).
 * - `expose === false`인 예외의 message는 코드값으로 대체한다.
 */
export function jsonError(error: unknown, context: Record<string, unknown> = {}): NextResponse<ApiErrorResponse> {
  const appError: AppError =
    error instanceof ZodError ? new ValidationError('Request validation failed', error.flatten()) : toAppError(error);

  // 5xx는 원인 추적이 필요하므로 항상 남기고, 4xx는 정상적인 도메인 흐름이라 warn으로만 남긴다.
  if (appError.status >= 500) {
    logger.error('api_error', context, appError);
  } else {
    logger.warn('api_rejected', { ...context, code: appError.code, status: appError.status });
  }

  const body: ApiErrorResponse = {
    error: {
      code: appError.code,
      message: appError.expose ? appError.message : appError.code,
      ...(appError.expose && appError.details !== undefined ? { details: appError.details } : {}),
    },
  };

  return NextResponse.json(body, { status: appError.status });
}

/**
 * 프롬프트 전문처럼 캐시에 잔류하면 안 되는 응답용 헤더.
 * CDN·브라우저·프록시 어디에도 남지 않도록 no-store를 명시한다(F3-AC3 다운로드 경로).
 */
export const NO_STORE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  Pragma: 'no-cache',
};

/** 웹훅 처리 결과 200 응답. 실패도 200으로 응답해 결제사 재시도 폭주를 막는다. */
export function webhookAck(deduped = false): NextResponse<{ ok: true; deduped?: boolean }> {
  return NextResponse.json(deduped ? { ok: true as const, deduped: true } : { ok: true as const });
}

/** 서명 검증 실패 전용 401. 본문을 최소화해 공격자에게 검증 로직 힌트를 주지 않는다. */
export function webhookUnauthorized(): NextResponse {
  return new NextResponse('invalid signature', { status: 401 });
}

/** 도메인 오류를 별도 처리해야 하는 라우트에서 쓰는 타입 가드 재수출. */
export { isAppError };
