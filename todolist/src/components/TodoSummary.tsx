'use client';

export interface TodoSummaryProps {
  completedCount: number;
  totalCount: number;
}

function formatSummary(completedCount: number, totalCount: number): string {
  return `완료 ${completedCount} / 전체 ${totalCount}`;
}

export function TodoSummary({ completedCount, totalCount }: TodoSummaryProps) {
  return (
    <p
      aria-live="polite"
      className="text-sm font-medium text-slate-900"
    >
      {formatSummary(completedCount, totalCount)}
    </p>
  );
}
