import 'server-only';

import { timingSafeEqual } from 'node:crypto';

import { getServerEnv } from '@/lib/env';
import { CronAuthError } from '@/lib/errors';

/**
 * 배치 엔드포인트 인증 (TECH_SPEC 7장 "배치").
 *
 * /api/cron/* 은 공개 URL이므로 헤더 시크릿으로만 보호된다.
 * 비교는 timingSafeEqual로 수행해 응답 시간 차이로 시크릿이 유추되지 않게 한다.
 */

const CRON_SECRET_HEADER = 'x-cron-secret';
const AUTHORIZATION_HEADER = 'authorization';
const BEARER_PREFIX = 'Bearer ';

function safeEquals(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const actualBuffer = Buffer.from(actual, 'utf8');
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

/**
 * 요청에서 시크릿을 꺼낸다. 두 가지 형식을 받는다.
 *   - `x-cron-secret: <시크릿>`        : docker-compose의 cron 컨테이너(로컬 개발)
 *   - `Authorization: Bearer <시크릿>` : 관리형 스케줄러(Vercel Cron 등). 헤더를 고를 수 없다.
 * 스케줄러마다 보낼 수 있는 헤더가 다르므로 엔드포인트가 양쪽을 모두 받아야 한다.
 */
function extractSecret(req: Request): string | null {
  const direct = req.headers.get(CRON_SECRET_HEADER);
  if (direct) return direct;

  const authorization = req.headers.get(AUTHORIZATION_HEADER);
  if (authorization?.startsWith(BEARER_PREFIX)) {
    return authorization.slice(BEARER_PREFIX.length);
  }

  return null;
}

/** 실패 시 CronAuthError(401). 라우트는 이 예외를 jsonError로 그대로 응답한다. */
export function assertCronRequest(req: Request): void {
  const provided = extractSecret(req);
  if (!provided) throw new CronAuthError();

  if (!safeEquals(getServerEnv().CRON_SECRET, provided)) {
    throw new CronAuthError();
  }
}
