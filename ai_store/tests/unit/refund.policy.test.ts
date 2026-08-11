import { describe, expect, it } from 'vitest';

import { REFUND_WINDOW_DAYS, evaluateRefundEligibility } from '@/server/refunds/refund.policy';
import type { RefundEligibilityInput } from '@/server/refunds/refund.policy';
import type { OrderStatus } from '@/types/domain';

/**
 * 환불 자격 판정 단위 테스트 (F2-AC12).
 *
 * PRD: "구매일로부터 7일 이내이면서 해당 템플릿의 전문을 아직 열람·다운로드하지 않은 경우에만 접수"
 * TECH_SPEC 8장 테스트 기준: 6일·미열람 = 가능 / 8일 = WINDOW_EXPIRED / 열람됨 = ALREADY_VIEWED
 */

const NOW = new Date('2026-08-10T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

/** 구매 후 `days`일이 지난 시점의 paidAt. */
function paidDaysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

/** 기본값은 "구매 1일차, 미열람, 미다운로드, 활성 환불 없음" = 접수 가능한 상태. */
function makeInput(overrides: Partial<RefundEligibilityInput> = {}): RefundEligibilityInput {
  return {
    order: { status: 'PAID', paidAt: paidDaysAgo(1) },
    libraryItem: { firstViewedAt: null, firstDownloadedAt: null },
    hasActiveRefund: false,
    now: NOW,
    ...overrides,
  };
}

describe('환불 창 (7일)', () => {
  it('정책 상수는 PRD가 정한 7일이다', () => {
    expect(REFUND_WINDOW_DAYS).toBe(7);
  });

  it('구매 6일차 + 미열람이면 접수 가능하다', () => {
    const result = evaluateRefundEligibility(makeInput({ order: { status: 'PAID', paidAt: paidDaysAgo(6) } }));

    expect(result).toEqual({ eligible: true });
  });

  it('구매 8일차면 WINDOW_EXPIRED 로 거절한다', () => {
    const result = evaluateRefundEligibility(makeInput({ order: { status: 'PAID', paidAt: paidDaysAgo(8) } }));

    expect(result).toEqual({ eligible: false, reason: 'WINDOW_EXPIRED' });
  });

  it('정확히 7일 0초 경계는 포함으로 처리한다', () => {
    const exactly7Days = makeInput({ order: { status: 'PAID', paidAt: paidDaysAgo(7) } });

    expect(evaluateRefundEligibility(exactly7Days)).toEqual({ eligible: true });
  });

  it('7일을 1밀리초라도 넘기면 거절한다', () => {
    const input = makeInput({
      order: { status: 'PAID', paidAt: new Date(NOW.getTime() - (7 * DAY_MS + 1)) },
    });

    expect(evaluateRefundEligibility(input)).toEqual({ eligible: false, reason: 'WINDOW_EXPIRED' });
  });

  it('0일차(방금 구매)도 접수 가능하다', () => {
    const input = makeInput({ order: { status: 'PAID', paidAt: NOW } });

    expect(evaluateRefundEligibility(input)).toEqual({ eligible: true });
  });
});

describe('열람·다운로드 이력 (디지털 콘텐츠 청약철회 제한)', () => {
  it('전문을 열람했으면 ALREADY_VIEWED 로 거절한다', () => {
    const input = makeInput({
      libraryItem: { firstViewedAt: paidDaysAgo(0.5), firstDownloadedAt: null },
    });

    expect(evaluateRefundEligibility(input)).toEqual({ eligible: false, reason: 'ALREADY_VIEWED' });
  });

  it('다운로드했으면 ALREADY_DOWNLOADED 로 거절한다', () => {
    const input = makeInput({
      libraryItem: { firstViewedAt: null, firstDownloadedAt: paidDaysAgo(0.5) },
    });

    expect(evaluateRefundEligibility(input)).toEqual({
      eligible: false,
      reason: 'ALREADY_DOWNLOADED',
    });
  });

  it('열람과 다운로드가 모두 있으면 열람 사유를 우선 반환한다', () => {
    const input = makeInput({
      libraryItem: { firstViewedAt: paidDaysAgo(0.5), firstDownloadedAt: paidDaysAgo(0.4) },
    });

    expect(evaluateRefundEligibility(input)).toEqual({ eligible: false, reason: 'ALREADY_VIEWED' });
  });

  it('열람 이력이 있으면 기간이 남아 있어도 접수되지 않는다', () => {
    const input = makeInput({
      order: { status: 'PAID', paidAt: paidDaysAgo(1) },
      libraryItem: { firstViewedAt: paidDaysAgo(1), firstDownloadedAt: null },
    });

    expect(evaluateRefundEligibility(input)).toEqual({ eligible: false, reason: 'ALREADY_VIEWED' });
  });

  it('기간 초과와 열람이 동시에 걸리면 기간 만료를 먼저 알린다', () => {
    const input = makeInput({
      order: { status: 'PAID', paidAt: paidDaysAgo(10) },
      libraryItem: { firstViewedAt: paidDaysAgo(9), firstDownloadedAt: null },
    });

    expect(evaluateRefundEligibility(input)).toEqual({ eligible: false, reason: 'WINDOW_EXPIRED' });
  });

  it('라이브러리 항목이 아직 없으면(지급 직후 경합) 열람 이력이 없는 것으로 본다', () => {
    const input = makeInput({ libraryItem: null });

    expect(evaluateRefundEligibility(input)).toEqual({ eligible: true });
  });
});

describe('주문 상태 조건', () => {
  it('PAID 가 아닌 주문은 ORDER_NOT_PAID 로 거절한다', () => {
    for (const status of ['PENDING', 'CONFIRMING', 'FAILED', 'EXPIRED'] as const) {
      const input = makeInput({ order: { status, paidAt: null } });

      expect(evaluateRefundEligibility(input), `상태: ${status}`).toEqual({
        eligible: false,
        reason: 'ORDER_NOT_PAID',
      });
    }
  });

  it('상태는 PAID 인데 paidAt 이 없으면 기준일을 알 수 없어 거절한다', () => {
    const input = makeInput({ order: { status: 'PAID', paidAt: null } });

    expect(evaluateRefundEligibility(input)).toEqual({ eligible: false, reason: 'ORDER_NOT_PAID' });
  });
});

describe('중복 접수 차단', () => {
  it('이미 활성 환불이 있으면 ALREADY_REQUESTED 로 거절한다', () => {
    const input = makeInput({ hasActiveRefund: true });

    expect(evaluateRefundEligibility(input)).toEqual({
      eligible: false,
      reason: 'ALREADY_REQUESTED',
    });
  });

  it('주문이 이미 REFUND_REQUESTED / REFUNDED 면 ALREADY_REQUESTED 로 거절한다', () => {
    for (const status of ['REFUND_REQUESTED', 'REFUNDED'] as const satisfies readonly OrderStatus[]) {
      const input = makeInput({ order: { status, paidAt: paidDaysAgo(1) } });

      expect(evaluateRefundEligibility(input), `상태: ${status}`).toEqual({
        eligible: false,
        reason: 'ALREADY_REQUESTED',
      });
    }
  });

  it('중복 접수 판정이 기간·열람 판정보다 우선한다', () => {
    const input = makeInput({
      order: { status: 'PAID', paidAt: paidDaysAgo(30) },
      libraryItem: { firstViewedAt: paidDaysAgo(29), firstDownloadedAt: paidDaysAgo(29) },
      hasActiveRefund: true,
    });

    expect(evaluateRefundEligibility(input)).toEqual({
      eligible: false,
      reason: 'ALREADY_REQUESTED',
    });
  });
});

describe('순수 함수 보장', () => {
  it('now 를 주입하지 않으면 현재 시각을 쓴다', () => {
    const input: RefundEligibilityInput = {
      order: { status: 'PAID', paidAt: new Date() },
      libraryItem: { firstViewedAt: null, firstDownloadedAt: null },
    };

    expect(evaluateRefundEligibility(input)).toEqual({ eligible: true });
  });

  it('입력 객체를 변형하지 않는다', () => {
    const input = makeInput();
    const snapshot = structuredClone(input);

    evaluateRefundEligibility(input);

    expect(input).toEqual(snapshot);
  });
});
