'use client';

/**
 * RepoPicker — 저장소 검색 + 목록 + 더 보기를 묶는 컨테이너
 *
 * 담당 PRD 수용 기준
 *  - 1-2: 저장소 목록(최근 수정일 내림차순)을 표시한다. 정렬은 서버(listAccessibleRepos)가 보장한다.
 *  - 1-3: 검색 필터 적용 및 저장소 1개 선택
 *  - 1-4 (엣지): 접근 가능한 저장소가 0개이면 EmptyState + 다음 행동 링크
 *  - 1-5 (엣지): hasNext인 동안 "더 보기"로 순차 로드, 선택 상태는 상위가 보관하므로 유지된다.
 *  - 3-7 / 1-6 (에러): 목록 조회 실패 시 ErrorNotice + 재시도
 *  - 접근성 1항: role="listbox" + 방향키/Home/End 이동 + Enter·Space 선택 (TECH_SPEC §7.3)
 *
 * 데이터·상태는 모두 props로 받는 프레젠테이셔널 컴포넌트다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ChevronDown, LoaderCircle } from 'lucide-react';

import { EmptyState } from '@/components/EmptyState';
import { ErrorNotice } from '@/components/ErrorNotice';
import { RepoListItem } from '@/components/RepoListItem';
import { RepoSearchInput } from '@/components/RepoSearchInput';
import type { AppErrorCode } from '@/lib/errors';
import type { RepoSummary } from '@/types/github';

export interface RepoPickerError {
  code: AppErrorCode;
  message?: string;
  retryable?: boolean;
}

export interface RepoPickerProps {
  /** 검색 필터가 적용된 저장소 목록(visibleRepos) */
  repos: RepoSummary[];
  /** 누적 로드된 전체 저장소 수(필터 이전) */
  totalCount: number;
  query: string;
  onQueryChange: (next: string) => void;
  selectedRepo: RepoSummary | null;
  onSelectRepo: (repo: RepoSummary) => void;
  hasNext: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  error?: RepoPickerError | null;
  onRetry?: () => void;
  /** 저장소 0개일 때 안내할 GitHub App 설치 페이지 URL */
  installUrl?: string;
  className?: string;
}

const LIST_ID = 'repo-listbox';
const LIST_LABEL_ID = 'repo-listbox-label';

export function RepoPicker({
  repos,
  totalCount,
  query,
  onQueryChange,
  selectedRepo,
  onSelectRepo,
  hasNext,
  isLoading,
  onLoadMore,
  error = null,
  onRetry,
  installUrl,
  className,
}: RepoPickerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // 필터 결과가 바뀌면 활성 위치를 목록 안으로 되돌린다.
  useEffect(() => {
    setActiveIndex((current) => (current < repos.length ? current : 0));
  }, [repos.length]);

  const optionId = useCallback((index: number) => `${LIST_ID}-option-${index}`, []);

  const focusOption = useCallback(
    (index: number) => {
      setActiveIndex(index);
      const element = listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(optionId(index))}`);
      element?.focus();
    },
    [optionId],
  );

  const handleListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (repos.length === 0) return;

    const lastIndex = repos.length - 1;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusOption(activeIndex >= lastIndex ? 0 : activeIndex + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusOption(activeIndex <= 0 ? lastIndex : activeIndex - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusOption(0);
        break;
      case 'End':
        event.preventDefault();
        focusOption(lastIndex);
        break;
      default:
        break;
    }
  };

  const showNoRepos = totalCount === 0 && !isLoading && !error;
  const showNoSearchResults = totalCount > 0 && repos.length === 0;

  return (
    <section
      aria-labelledby={LIST_LABEL_ID}
      className={['flex w-full flex-col gap-3', className ?? ''].filter(Boolean).join(' ')}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={LIST_LABEL_ID} className="text-base font-bold text-ink">
          검증 대상 저장소 선택
        </h2>
        <p className="text-xs text-ink-muted">최근 수정일 내림차순</p>
      </div>

      <RepoSearchInput
        value={query}
        onChange={onQueryChange}
        resultCount={repos.length}
        totalCount={totalCount}
        disabled={totalCount === 0}
      />

      {error ? (
        <ErrorNotice
          code={error.code}
          message={error.message}
          retryable={error.retryable}
          onRetry={onRetry}
          retryLabel="저장소 목록 다시 불러오기"
        />
      ) : null}

      {showNoRepos ? <EmptyState variant="no-repos" actionHref={installUrl} /> : null}

      {showNoSearchResults ? (
        <EmptyState variant="no-search-results" onAction={() => onQueryChange('')} />
      ) : null}

      {repos.length > 0 ? (
        <ul
          id={LIST_ID}
          ref={listRef}
          role="listbox"
          aria-labelledby={LIST_LABEL_ID}
          onKeyDown={handleListKeyDown}
          className="max-h-96 w-full overflow-y-auto rounded-md border border-line bg-surface"
        >
          {repos.map((repo, index) => (
            <RepoListItem
              key={repo.id}
              repo={repo}
              selected={selectedRepo?.id === repo.id}
              active={index === activeIndex}
              optionId={optionId(index)}
              onSelect={onSelectRepo}
              onFocus={() => setActiveIndex(index)}
            />
          ))}
        </ul>
      ) : null}

      <div role="status" aria-live="polite" className="text-xs text-ink-muted">
        {isLoading ? '저장소 목록을 불러오는 중입니다' : ''}
      </div>

      {hasNext ? (
        <div>
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? (
              <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <ChevronDown size={16} aria-hidden="true" />
            )}
            저장소 더 보기
          </button>
        </div>
      ) : null}
    </section>
  );
}
