import 'server-only';

import { InvalidOrderTransitionError } from '@/lib/errors';
import { TERMINAL_ORDER_STATUSES } from '@/types/domain';
import type { OrderEventSource, OrderStatus } from '@/types/domain';

/**
 * 주문 상태 머신 (TECH_SPEC 2.4).
 *
 * ★이 파일이 F2-AC5("웹훅 기준으로만 확정")를 코드로 강제하는 지점이다.
 *   리디렉션(REDIRECT)은 CONFIRMING 전이만 가능하고, PAID 전이는 WEBHOOK/BATCH만 허용한다.
 *   즉 브라우저가 돌아왔다는 사실만으로는 어떤 코드 경로로도 주문을 확정할 수 없다.
 *
 * 정의되지 않은 전이는 InvalidOrderTransitionError를 던지며, 웹훅 경로는 이 예외를 잡아
 * 200 + webhook_events.status='SKIPPED'로 기록한다(결제사 무한 재시도 방지).
 */

export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: ['CONFIRMING', 'PAID', 'FAILED', 'EXPIRED'],
  CONFIRMING: ['PAID', 'FAILED'],
  PAID: ['REFUND_REQUESTED'],
  REFUND_REQUESTED: ['REFUNDED', 'PAID'],
  FAILED: [],
  EXPIRED: [],
  REFUNDED: [],
};

type TransitionKey = `${OrderStatus}->${OrderStatus}`;

function key(from: OrderStatus, to: OrderStatus): TransitionKey {
  return `${from}->${to}`;
}

/**
 * 전이별 허용 트리거 소스 (TECH_SPEC 2.4 전이 규칙 표).
 *
 * 근거
 *  - `PENDING->CONFIRMING`: 리디렉션 복귀 또는 배치의 "승인/처리중" 감지.
 *  - `PENDING->PAID` / `CONFIRMING->PAID`: 결제사 조회 API 재확인을 거친 WEBHOOK·BATCH만. (F2-AC5)
 *  - `PENDING->FAILED`: 실패 리디렉션(fail URL)도 허용한다. 실패는 지급을 만들지 않아 금전 위험이 없다.
 *  - `PENDING->EXPIRED`: 만료 판정은 배치의 몫이다. 사용자 요청으로 만료시키지 않는다.
 *  - `PAID->REFUND_REQUESTED`: 구매자 본인의 요청(USER)만.
 *  - `REFUND_REQUESTED->REFUNDED`: 결제사 환불 완료 웹훅 또는 환불 API 동기 응답(SYSTEM).
 *  - `REFUND_REQUESTED->PAID`: 환불 반려(SYSTEM).
 */
const TRANSITION_SOURCES: Readonly<Partial<Record<TransitionKey, readonly OrderEventSource[]>>> = {
  'PENDING->CONFIRMING': ['REDIRECT', 'BATCH'],
  'PENDING->PAID': ['WEBHOOK', 'BATCH'],
  'PENDING->FAILED': ['WEBHOOK', 'BATCH', 'REDIRECT'],
  'PENDING->EXPIRED': ['BATCH'],
  'CONFIRMING->PAID': ['WEBHOOK', 'BATCH'],
  'CONFIRMING->FAILED': ['WEBHOOK', 'BATCH'],
  'PAID->REFUND_REQUESTED': ['USER'],
  'REFUND_REQUESTED->REFUNDED': ['WEBHOOK', 'SYSTEM'],
  'REFUND_REQUESTED->PAID': ['SYSTEM'],
};

/** 종료 상태 여부. 재시도는 새 주문 생성으로만 가능하다(F2-AC9). */
export function isTerminalStatus(status: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(status);
}

/** 전이표상 허용된 전이인지. 소스는 보지 않는다. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** 해당 소스가 이 전이를 일으킬 수 있는지. */
export function canTransitionFrom(from: OrderStatus, to: OrderStatus, source: OrderEventSource): boolean {
  if (!canTransition(from, to)) return false;
  const sources = TRANSITION_SOURCES[key(from, to)];
  return sources !== undefined && sources.includes(source);
}

/**
 * 전이 검증. 상태 변경 직전에 반드시 호출한다.
 * 상태와 소스 중 하나라도 어긋나면 예외를 던져 UPDATE 자체가 실행되지 않게 한다.
 */
export function assertTransition(from: OrderStatus, to: OrderStatus, source: OrderEventSource): void {
  if (!canTransitionFrom(from, to, source)) {
    throw new InvalidOrderTransitionError(from, to, source);
  }
}
