import { describe, expect, it } from 'vitest';

import { InvalidOrderTransitionError } from '@/lib/errors';
import {
  ORDER_TRANSITIONS,
  assertTransition,
  canTransition,
  canTransitionFrom,
  isTerminalStatus,
} from '@/server/orders/order.state-machine';
import { TERMINAL_ORDER_STATUSES } from '@/types/domain';
import type { OrderEventSource, OrderStatus } from '@/types/domain';

/**
 * 주문 상태 머신 단위 테스트 (F2-AC5, F2-AC9, F2-AC10).
 *
 * ★핵심 단언: `CONFIRMING -> PAID`는 WEBHOOK/BATCH로만 가능하고 REDIRECT로는 불가하다.
 *   "결제 후 브라우저가 돌아오는 리디렉션만으로는 주문을 확정하지 않는다"(F2-AC5)를
 *   코드 레벨에서 강제하는 지점이므로, 이 규칙이 깨지면 결제 확정 설계 전체가 무효가 된다.
 */

const ALL_STATUSES: readonly OrderStatus[] = [
  'PENDING',
  'CONFIRMING',
  'PAID',
  'FAILED',
  'EXPIRED',
  'REFUND_REQUESTED',
  'REFUNDED',
];

const ALL_SOURCES: readonly OrderEventSource[] = ['WEBHOOK', 'BATCH', 'REDIRECT', 'USER', 'SYSTEM'];

/** TECH_SPEC 2.4 전이 규칙 표를 그대로 옮긴 기대값. 구현이 표를 벗어나면 여기서 걸린다. */
const EXPECTED_SOURCES: Readonly<Record<string, readonly OrderEventSource[]>> = {
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

describe('전이표 (TECH_SPEC 2.4)', () => {
  it('상태별 허용 전이 목록이 명세와 일치한다', () => {
    expect(ORDER_TRANSITIONS).toEqual({
      PENDING: ['CONFIRMING', 'PAID', 'FAILED', 'EXPIRED'],
      CONFIRMING: ['PAID', 'FAILED'],
      PAID: ['REFUND_REQUESTED'],
      REFUND_REQUESTED: ['REFUNDED', 'PAID'],
      FAILED: [],
      EXPIRED: [],
      REFUNDED: [],
    });
  });

  it('canTransition은 전이표에 있는 조합만 true를 반환한다', () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        expect(canTransition(from, to)).toBe(ORDER_TRANSITIONS[from].includes(to));
      }
    }
  });

  it('전이표에 없는 조합은 어떤 소스로도 허용되지 않는다', () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        if (canTransition(from, to)) continue;
        for (const source of ALL_SOURCES) {
          expect(canTransitionFrom(from, to, source)).toBe(false);
          expect(() => assertTransition(from, to, source)).toThrow(InvalidOrderTransitionError);
        }
      }
    }
  });

  it('허용된 전이마다 트리거 소스 집합이 명세와 정확히 일치한다', () => {
    for (const from of ALL_STATUSES) {
      for (const to of ORDER_TRANSITIONS[from]) {
        const expected = EXPECTED_SOURCES[`${from}->${to}`];
        expect(expected, `전이 ${from}->${to} 의 기대 소스가 정의되지 않았다`).toBeDefined();

        const actual = ALL_SOURCES.filter((source) => canTransitionFrom(from, to, source));
        expect(actual.slice().sort()).toEqual(expected!.slice().sort());
      }
    }
  });
});

describe('★리디렉션으로는 확정 불가 (F2-AC5)', () => {
  it('CONFIRMING -> PAID 는 WEBHOOK / BATCH 로만 가능하다', () => {
    expect(canTransitionFrom('CONFIRMING', 'PAID', 'WEBHOOK')).toBe(true);
    expect(canTransitionFrom('CONFIRMING', 'PAID', 'BATCH')).toBe(true);

    expect(() => assertTransition('CONFIRMING', 'PAID', 'WEBHOOK')).not.toThrow();
    expect(() => assertTransition('CONFIRMING', 'PAID', 'BATCH')).not.toThrow();
  });

  it('CONFIRMING -> PAID 를 REDIRECT 소스로 시도하면 예외가 발생한다', () => {
    expect(canTransitionFrom('CONFIRMING', 'PAID', 'REDIRECT')).toBe(false);

    expect(() => assertTransition('CONFIRMING', 'PAID', 'REDIRECT')).toThrow(
      InvalidOrderTransitionError,
    );

    try {
      assertTransition('CONFIRMING', 'PAID', 'REDIRECT');
      expect.unreachable('리디렉션 확정이 통과해서는 안 된다');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidOrderTransitionError);
      const transitionError = error as InvalidOrderTransitionError;
      expect(transitionError.code).toBe('INVALID_ORDER_TRANSITION');
      expect(transitionError.status).toBe(409);
      expect(transitionError.from).toBe('CONFIRMING');
      expect(transitionError.to).toBe('PAID');
      expect(transitionError.source).toBe('REDIRECT');
    }
  });

  it('PENDING -> PAID 도 REDIRECT / USER 소스로는 불가하다', () => {
    expect(canTransitionFrom('PENDING', 'PAID', 'REDIRECT')).toBe(false);
    expect(canTransitionFrom('PENDING', 'PAID', 'USER')).toBe(false);
    expect(canTransitionFrom('PENDING', 'PAID', 'SYSTEM')).toBe(false);

    expect(canTransitionFrom('PENDING', 'PAID', 'WEBHOOK')).toBe(true);
    expect(canTransitionFrom('PENDING', 'PAID', 'BATCH')).toBe(true);
  });

  it('리디렉션이 할 수 있는 전이는 CONFIRMING 진입과 실패 처리뿐이다', () => {
    const redirectCapable = ALL_STATUSES.flatMap((from) =>
      ALL_STATUSES.filter((to) => canTransitionFrom(from, to, 'REDIRECT')).map((to) => `${from}->${to}`),
    );

    expect(redirectCapable.sort()).toEqual(['PENDING->CONFIRMING', 'PENDING->FAILED']);
  });
});

describe('만료·실패 전이 (F2-AC9, F2-AC10)', () => {
  it('PENDING -> EXPIRED 는 배치만 수행할 수 있다', () => {
    expect(canTransitionFrom('PENDING', 'EXPIRED', 'BATCH')).toBe(true);
    for (const source of ['WEBHOOK', 'REDIRECT', 'USER', 'SYSTEM'] as const) {
      expect(canTransitionFrom('PENDING', 'EXPIRED', source)).toBe(false);
    }
  });

  it('CONFIRMING -> EXPIRED 는 어떤 소스로도 불가하다(자동 실패 처리 금지)', () => {
    for (const source of ALL_SOURCES) {
      expect(canTransitionFrom('CONFIRMING', 'EXPIRED', source)).toBe(false);
    }
  });

  it('실패 웹훅은 PENDING·CONFIRMING 양쪽에서 FAILED로 전이할 수 있다', () => {
    expect(canTransitionFrom('PENDING', 'FAILED', 'WEBHOOK')).toBe(true);
    expect(canTransitionFrom('CONFIRMING', 'FAILED', 'WEBHOOK')).toBe(true);
  });

  it('실패 리디렉션(fail URL)은 PENDING에서만 FAILED로 전이한다', () => {
    expect(canTransitionFrom('PENDING', 'FAILED', 'REDIRECT')).toBe(true);
    expect(canTransitionFrom('CONFIRMING', 'FAILED', 'REDIRECT')).toBe(false);
  });
});

describe('환불 전이 (F2-AC12)', () => {
  it('PAID -> REFUND_REQUESTED 는 구매자 요청(USER)만 가능하다', () => {
    expect(canTransitionFrom('PAID', 'REFUND_REQUESTED', 'USER')).toBe(true);
    for (const source of ['WEBHOOK', 'BATCH', 'REDIRECT', 'SYSTEM'] as const) {
      expect(canTransitionFrom('PAID', 'REFUND_REQUESTED', source)).toBe(false);
    }
  });

  it('REFUND_REQUESTED -> REFUNDED 는 웹훅 또는 시스템이 확정한다', () => {
    expect(canTransitionFrom('REFUND_REQUESTED', 'REFUNDED', 'WEBHOOK')).toBe(true);
    expect(canTransitionFrom('REFUND_REQUESTED', 'REFUNDED', 'SYSTEM')).toBe(true);
    expect(canTransitionFrom('REFUND_REQUESTED', 'REFUNDED', 'USER')).toBe(false);
  });

  it('환불 반려(REFUND_REQUESTED -> PAID)는 SYSTEM만 가능하다', () => {
    expect(canTransitionFrom('REFUND_REQUESTED', 'PAID', 'SYSTEM')).toBe(true);
    expect(canTransitionFrom('REFUND_REQUESTED', 'PAID', 'USER')).toBe(false);
  });

  it('PAID -> REFUNDED 직접 전이는 허용되지 않는다(N5 미결 사항)', () => {
    expect(canTransition('PAID', 'REFUNDED')).toBe(false);
  });
});

describe('종료 상태', () => {
  it('FAILED / EXPIRED / REFUNDED 는 종료 상태다', () => {
    for (const status of TERMINAL_ORDER_STATUSES) {
      expect(isTerminalStatus(status)).toBe(true);
      expect(ORDER_TRANSITIONS[status]).toEqual([]);
    }
  });

  it('진행 중 상태는 종료 상태가 아니다', () => {
    for (const status of ['PENDING', 'CONFIRMING', 'PAID', 'REFUND_REQUESTED'] as const) {
      expect(isTerminalStatus(status)).toBe(false);
    }
  });

  it('종료 상태에서는 재시도조차 전이로 표현되지 않는다(새 주문 생성만 가능)', () => {
    for (const from of TERMINAL_ORDER_STATUSES) {
      for (const to of ALL_STATUSES) {
        for (const source of ALL_SOURCES) {
          expect(() => assertTransition(from, to, source)).toThrow(InvalidOrderTransitionError);
        }
      }
    }
  });

  it('같은 상태로의 자기 전이는 허용되지 않는다', () => {
    for (const status of ALL_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });
});
