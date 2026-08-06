'use client';

/**
 * ComplianceSummary — 준수율(소수 첫째 자리)·PASS/FAIL·기준값 안내
 *
 * 담당 PRD 수용 기준
 *  - 3-1: 준수율(존재 ÷ 전체 × 100)이 소수점 첫째 자리까지 표시된다. (score.rateText 사용)
 *  - 3-2: 80% 이상 PASS / 미만 FAIL 판정이 결과 화면 상단에 표시되고, 기준값이 함께 안내된다.
 *  - 3-6 (엣지): 저장소에 파일이 없으면 "저장소에 파일이 없습니다" 안내를 함께 표시한다.
 *  - 접근성 2항: 판정은 StatusBadge(아이콘+텍스트+색상) 3중 표기
 *  - 접근성 5항: 결과 갱신을 role="status" aria-live="polite"로 전달
 *
 * 판정값(verdict)과 표시값(rateText)은 상위(lib/verify/compliance.ts)에서 계산된 값을 그대로 사용한다.
 */
import { EmptyState } from '@/components/EmptyState';
import { ErrorNotice } from '@/components/ErrorNotice';
import { StatusBadge } from '@/components/StatusBadge';
import type { ComplianceScore } from '@/types/verification';

export interface ComplianceSummaryProps {
  score: ComplianceScore;
  /** 검증한 저장소 이름 (예: dev-msj/git_review) */
  repoFullName?: string;
  /** 검증에 사용한 브랜치명 */
  refName?: string;
  /** 저장소에 파일이 0개였는지 (PRD 3-6) */
  repoEmpty?: boolean;
  /** 트리가 잘려 결과가 불완전할 수 있는지 (TECH_SPEC §6.2 TREE_TRUNCATED) */
  treeTruncated?: boolean;
  className?: string;
}

export function ComplianceSummary({
  score,
  repoFullName,
  refName,
  repoEmpty = false,
  treeTruncated = false,
  className,
}: ComplianceSummaryProps) {
  const isPass = score.verdict === 'PASS';

  return (
    <section
      role="status"
      aria-live="polite"
      aria-labelledby="compliance-summary-heading"
      className={['flex w-full flex-col gap-3 rounded-md border border-line bg-surface p-4', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="compliance-summary-heading" className="text-base font-bold text-ink">
          준수율 요약
        </h2>
        <StatusBadge variant={isPass ? 'pass' : 'fail'} size="md" />
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <p className="flex items-baseline gap-1">
          <span className="sr-only">준수율 </span>
          <span className="text-4xl font-bold text-ink">{score.rateText}</span>
          <span className="text-xl font-bold text-ink">%</span>
        </p>

        <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ink-muted">
          <div className="flex items-center gap-1">
            <dt>전체</dt>
            <dd className="font-semibold text-ink">{`${score.total}개`}</dd>
          </div>
          <div className="flex items-center gap-1">
            <dt>존재</dt>
            <dd className="font-semibold text-success">{`${score.present}개`}</dd>
          </div>
          <div className="flex items-center gap-1">
            <dt>없음</dt>
            <dd className="font-semibold text-danger">{`${score.missing}개`}</dd>
          </div>
        </dl>
      </div>

      {repoFullName ? (
        <p className="text-xs break-all text-ink-muted">
          {`검증 대상: ${repoFullName}${refName ? ` (${refName} 브랜치)` : ''}`}
        </p>
      ) : null}

      <p className="text-xs text-ink-muted">
        {`판정 기준: 준수율 ${score.threshold}% 이상이면 PASS, 미만이면 FAIL입니다.`}
      </p>

      {/* PRD 3-6 (엣지): 저장소에 파일이 0개면 준수율 0%·FAIL과 함께 안내를 노출한다. */}
      {repoEmpty ? <EmptyState variant="empty-repo" /> : null}
      {treeTruncated ? <ErrorNotice code="TREE_TRUNCATED" retryable={false} /> : null}
    </section>
  );
}
