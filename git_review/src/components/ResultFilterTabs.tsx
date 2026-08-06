'use client';

/**
 * ResultFilterTabs — 전체 / "없음"만 보기 필터
 *
 * 담당 PRD 수용 기준
 *  - 3-3: "없음" 항목만 모아 보는 필터를 제공한다.
 *  - 접근성 1항: role="tablist" + 로빙 tabindex + 좌우/Home/End 키 이동 (WAI-ARIA 탭 패턴)
 *  - 접근성 2항: 선택 상태를 색상 외에 aria-selected와 굵기·테두리로도 구분
 */
import { useRef } from 'react';
import type { KeyboardEvent } from 'react';

export type ResultFilter = 'all' | 'missing';

export interface ResultFilterCounts {
  all: number;
  missing: number;
}

export interface ResultFilterTabsProps {
  value: ResultFilter;
  onChange: (next: ResultFilter) => void;
  counts: ResultFilterCounts;
  /** 이 탭이 제어하는 결과 목록의 DOM id (ResultChecklist의 id와 맞춘다) */
  panelId?: string;
  disabled?: boolean;
  className?: string;
}

const FILTER_ORDER: ResultFilter[] = ['all', 'missing'];

const FILTER_LABELS: Record<ResultFilter, string> = {
  all: '전체',
  missing: '없음만 보기',
};

const TAB_ID_PREFIX = 'result-filter-tab';

/** 탭 버튼의 DOM id. 결과 목록(tabpanel)의 aria-labelledby와 연결하는 데 사용한다. */
export function getResultFilterTabId(filter: ResultFilter): string {
  return `${TAB_ID_PREFIX}-${filter}`;
}

export function ResultFilterTabs({
  value,
  onChange,
  counts,
  panelId,
  disabled = false,
  className,
}: ResultFilterTabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const focusTab = (filter: ResultFilter) => {
    onChange(filter);
    const element = listRef.current?.querySelector<HTMLElement>(`#${getResultFilterTabId(filter)}`);
    element?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;

    const currentIndex = FILTER_ORDER.indexOf(value);
    const lastIndex = FILTER_ORDER.length - 1;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        focusTab(FILTER_ORDER[currentIndex >= lastIndex ? 0 : currentIndex + 1]);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        focusTab(FILTER_ORDER[currentIndex <= 0 ? lastIndex : currentIndex - 1]);
        break;
      case 'Home':
        event.preventDefault();
        focusTab(FILTER_ORDER[0]);
        break;
      case 'End':
        event.preventDefault();
        focusTab(FILTER_ORDER[lastIndex]);
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="검증 결과 필터"
      onKeyDown={handleKeyDown}
      className={['inline-flex flex-wrap gap-1 rounded-md border border-line bg-surface p-1', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      {FILTER_ORDER.map((filter) => {
        const selected = filter === value;
        const count = filter === 'all' ? counts.all : counts.missing;

        return (
          <button
            key={filter}
            id={getResultFilterTabId(filter)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(filter)}
            className={[
              'rounded px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-70',
              selected
                ? 'border border-brand bg-brand-surface font-bold text-brand-strong'
                : 'border border-transparent font-medium text-ink-muted hover:bg-surface-muted',
            ].join(' ')}
          >
            {`${FILTER_LABELS[filter]} (${count})`}
          </button>
        );
      })}
    </div>
  );
}
