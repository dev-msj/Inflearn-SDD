'use client';

import { useDashboard } from '@/components/DashboardProvider';
import { PERIOD_OPTIONS } from '@/lib/constants';
import { cn } from '@/lib/utils';

/**
 * 7 / 30 / 90일 세그먼트 컨트롤 (AC-1.4, AC-1.6).
 * 기본값은 `DEFAULT_PERIOD_DAYS`(7)이며 `DashboardProvider` 가 보유한다.
 * 활동 조회 중에는 비활성화해 요청이 겹치지 않게 한다.
 */
export function PeriodSelector() {
  const { periodDays, setPeriod, activityStatus } = useDashboard();
  const disabled = activityStatus === 'loading';

  return (
    <div
      role="group"
      aria-label="조회 기간 선택"
      className="inline-flex rounded-control border border-border-subtle bg-surface p-0.5"
    >
      {PERIOD_OPTIONS.map((days) => {
        const selected = days === periodDays;

        return (
          <button
            key={days}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => setPeriod(days)}
            className={cn(
              'h-8 rounded-control px-3 text-sm font-medium transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-50',
              selected ? 'bg-brand text-white' : 'text-ink-muted hover:bg-surface-muted',
            )}
          >
            {days}일
          </button>
        );
      })}
    </div>
  );
}

export default PeriodSelector;
