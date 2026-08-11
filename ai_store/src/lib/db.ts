import 'server-only';

import { PrismaClient } from '@prisma/client';

import { getServerEnv, isProduction } from './env';

/**
 * PrismaClient 싱글턴.
 *
 * - `import 'server-only'`: 클라이언트 컴포넌트가 이 모듈을 import 하면 빌드가 실패한다.
 *   프롬프트 전문(templates.body)에 접근할 수 있는 유일한 통로이므로 번들 격리가 필수다(F1-AC6).
 * - globalThis 캐시: dev 모드의 HMR이 모듈을 재평가할 때마다 새 커넥션 풀이 생겨
 *   Postgres 커넥션이 고갈되는 것을 막는다. 커넥션 상한은 DATABASE_URL의
 *   `connection_limit=10`(비기능: 동시 결제 10건)으로 제어한다.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const env = getServerEnv();

  return new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL } },
    // 'query' 레벨은 개발 환경에서도 켜지 않는다. 쿼리 파라미터에 이메일·주문 정보가 실려
    // 구조화 로그의 마스킹 규칙(logger.ts)을 우회하기 때문이다.
    log: ['warn', 'error'],
  });
}

export const db: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (!isProduction()) {
  globalForPrisma.prisma = db;
}

/**
 * 주문 확정처럼 원자성이 필요한 작업의 트랜잭션 기본 옵션.
 *
 * - `timeout`: 확정 트랜잭션 안에서 결제사 API를 호출하지 않는 것이 원칙이지만,
 *   행 잠금(FOR UPDATE) 구간이 길어지면 동시 결제가 막히므로 상한을 둔다.
 * - `maxWait`: 잠금 대기 상한. 중복 웹훅이 동시에 들어와도 두 번째가 무한 대기하지 않는다.
 */
export const CONFIRM_TX_OPTIONS = {
  maxWait: 5_000,
  timeout: 10_000,
} as const;
