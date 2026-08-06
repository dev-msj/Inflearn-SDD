/**
 * 준수율 계산 및 PASS/FAIL 판정 (TECH_SPEC §4 기능3-5)
 */
import type { ComplianceScore, VerificationItem } from '@/types/verification';

/** PRD 명시값: 준수율 80% 이상 PASS */
export const PASS_THRESHOLD = 80;

/**
 * 준수율 = 존재 항목 수 ÷ 전체 항목 수 × 100.
 *
 * 판정은 표시값(rateText)이 아닌 원값(rate)으로 수행한다.
 * (79.96%가 "80.0"으로 표시되면서 PASS로 뒤집히는 것을 방지)
 */
export function calculateCompliance(
  items: VerificationItem[],
  threshold: number = PASS_THRESHOLD,
): ComplianceScore {
  const total = items.length;
  const present = items.filter((item) => item.status === 'present').length;
  const missing = total - present;
  const rate = total === 0 ? 0 : (present / total) * 100;

  return {
    total,
    present,
    missing,
    rate,
    rateText: rate.toFixed(1),
    verdict: rate >= threshold ? 'PASS' : 'FAIL',
    threshold,
  };
}
