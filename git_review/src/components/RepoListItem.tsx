'use client';

/**
 * RepoListItem — 저장소명·기본 브랜치·공개/비공개 배지 1행
 *
 * 담당 PRD 수용 기준
 *  - 1-2: 각 항목에 저장소명·기본 브랜치명·공개/비공개 여부가 함께 표시된다.
 *  - 1-3: 목록에서 저장소 1개를 선택할 수 있다.
 *  - 접근성 1항: role="option" + 로빙 tabindex + Enter/Space 선택 (TECH_SPEC §7.3)
 *  - 접근성 2항: 공개/비공개는 StatusBadge(아이콘+텍스트+색상)로 구분
 *
 * 상위 RepoPicker가 방향키 이동을, 이 컴포넌트가 Enter/Space 선택을 담당한다.
 */
import type { KeyboardEvent } from 'react';
import { CircleCheck, GitBranch } from 'lucide-react';

import { StatusBadge } from '@/components/StatusBadge';
import type { RepoSummary } from '@/types/github';

export interface RepoListItemProps {
  repo: RepoSummary;
  /** 검증 대상으로 선택된 항목인지 */
  selected: boolean;
  /** 로빙 tabindex 대상(=Tab 키로 진입하는 항목)인지 */
  active: boolean;
  /** 상위 listbox가 초점을 옮길 때 사용하는 DOM id */
  optionId: string;
  onSelect: (repo: RepoSummary) => void;
  /** 마우스/키보드로 초점이 이동했을 때 상위의 활성 인덱스를 동기화한다. */
  onFocus?: () => void;
}

/** 마지막 푸시 시각을 한국어 날짜 문자열로 표시한다. */
function formatPushedAt(pushedAt: string): string {
  const time = Date.parse(pushedAt);
  if (Number.isNaN(time)) return '수정일 정보 없음';
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(time));
}

export function RepoListItem({ repo, selected, active, optionId, onSelect, onFocus }: RepoListItemProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      onSelect(repo);
    }
  };

  return (
    <li
      id={optionId}
      role="option"
      aria-selected={selected}
      tabIndex={active ? 0 : -1}
      onClick={() => onSelect(repo)}
      onKeyDown={handleKeyDown}
      onFocus={onFocus}
      className={[
        'flex cursor-pointer flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-3 py-2.5 last:border-b-0',
        selected ? 'bg-brand-surface' : 'bg-surface hover:bg-surface-muted',
      ].join(' ')}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {selected ? (
          <CircleCheck size={16} className="shrink-0 text-brand" aria-hidden="true" />
        ) : (
          <span className="w-4 shrink-0" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{repo.name}</p>
          <p className="truncate text-xs text-ink-muted">{repo.fullName}</p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
          <GitBranch size={14} aria-hidden="true" />
          <span className="sr-only">기본 브랜치 </span>
          {repo.defaultBranch}
        </span>
        <StatusBadge variant={repo.isPrivate ? 'private' : 'public'} />
        <span className="text-xs text-ink-muted">
          <span className="sr-only">최근 수정일 </span>
          {formatPushedAt(repo.pushedAt)}
        </span>
      </div>
    </li>
  );
}
