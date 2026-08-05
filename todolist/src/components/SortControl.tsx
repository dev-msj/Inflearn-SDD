'use client';

import { useId } from 'react';
import type { SortOrder } from '@/types/todo';

const LABELS = {
  sortOrder: '정렬 기준',
} as const;

export interface SortControlProps {
  value: SortOrder;
  onChange: (value: SortOrder) => void;
}

export const SORT_OPTIONS: ReadonlyArray<{ value: SortOrder; label: string }> = [
  { value: 'dueAsc', label: '마감일 빠른 순' },
  { value: 'dueDesc', label: '마감일 늦은 순' },
];

export function SortControl({ value, onChange }: SortControlProps) {
  const selectId = useId();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={selectId} className="text-sm font-medium text-slate-900">
        {LABELS.sortOrder}
      </label>
      <select
        id={selectId}
        value={value}
        onChange={(event) => onChange(event.target.value as SortOrder)}
        className="rounded-md border border-slate-400 bg-white px-2 py-1 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
