'use client';

/**
 * RepoSearchInput — 저장소명 부분 일치 필터 입력(디바운스)
 *
 * 담당 PRD 수용 기준
 *  - 1-3: 검색창에 문자열을 입력하면 저장소명에 해당 문자열을 포함하는 항목만 남는다.
 *  - 접근성 1항: label과 연결된 네이티브 input, 지우기 버튼 모두 키보드로 조작 가능
 *  - 접근성 5항: 필터 결과 개수를 aria-live로 알린다.
 *
 * 입력값은 로컬 상태로 즉시 반영하고, DEBOUNCE_MS 후 상위 onChange로 전달한다.
 */
import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

export interface RepoSearchInputProps {
  /** 상위(훅)가 보관 중인 확정 검색어 */
  value: string;
  onChange: (next: string) => void;
  /** 디바운스 지연(ms). 기본 250 (TECH_SPEC §9 항목 2) */
  debounceMs?: number;
  /** 필터 적용 후 남은 저장소 수 */
  resultCount?: number;
  /** 누적 로드된 전체 저장소 수 */
  totalCount?: number;
  disabled?: boolean;
  id?: string;
}

export const DEFAULT_SEARCH_DEBOUNCE_MS = 250;

const INPUT_ID_FALLBACK = 'repo-search-input';

export function RepoSearchInput({
  value,
  onChange,
  debounceMs = DEFAULT_SEARCH_DEBOUNCE_MS,
  resultCount,
  totalCount,
  disabled = false,
  id = INPUT_ID_FALLBACK,
}: RepoSearchInputProps) {
  const [draft, setDraft] = useState(value);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // 외부에서 검색어가 초기화되면(예: 로그아웃, 검색어 지우기) 입력값도 맞춘다.
  useEffect(() => {
    setDraft((current) => (current === value ? current : value));
  }, [value]);

  // 디바운스: 입력이 멎은 뒤에만 상위 상태를 갱신한다.
  useEffect(() => {
    if (draft === value) return;

    const timer = window.setTimeout(() => {
      onChangeRef.current(draft);
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [draft, value, debounceMs]);

  const handleClear = () => {
    setDraft('');
    onChangeRef.current('');
  };

  const statusId = `${id}-status`;
  const showCount = typeof resultCount === 'number' && typeof totalCount === 'number';

  return (
    <div className="flex w-full flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        저장소 검색
      </label>

      <div className="relative flex items-center">
        <Search size={16} className="pointer-events-none absolute left-3 text-ink-muted" aria-hidden="true" />
        <input
          id={id}
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={disabled}
          placeholder="저장소명 일부를 입력하세요"
          aria-describedby={showCount ? statusId : undefined}
          autoComplete="off"
          className="w-full rounded-md border border-line bg-surface py-2 pr-10 pl-9 text-sm text-ink placeholder:text-ink-muted disabled:cursor-not-allowed disabled:bg-surface-muted"
        />
        {draft.length > 0 ? (
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            aria-label="검색어 지우기"
            className="absolute right-2 rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink"
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {showCount ? (
        <p id={statusId} role="status" aria-live="polite" className="text-xs text-ink-muted">
          {`저장소 ${totalCount}개 중 ${resultCount}개 표시 중`}
        </p>
      ) : null}
    </div>
  );
}
