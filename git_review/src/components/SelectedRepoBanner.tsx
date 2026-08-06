'use client';

/**
 * SelectedRepoBanner — 선택된 "검증 대상"을 화면에 고정 표시
 *
 * 담당 PRD 수용 기준
 *  - 1-3: 목록에서 저장소 1개를 선택하면 "검증 대상"으로 화면에 고정 표시된다.
 *  - 1-5 (엣지): 추가 로드 후에도 선택 상태가 유지된다(선택값은 상위 상태에 보관).
 *  - 접근성 5항: 선택 변경을 aria-live로 알린다.
 */
import { ExternalLink, GitBranch, Target, X } from 'lucide-react';

import { StatusBadge } from '@/components/StatusBadge';
import type { RepoSummary } from '@/types/github';

export interface SelectedRepoBannerProps {
  /** 선택된 저장소. 없으면 안내 문구를 표시한다. */
  repo: RepoSummary | null;
  /** 선택 해제 처리. 지정하면 해제 버튼을 노출한다. */
  onClear?: () => void;
  /** 미선택 시 표시할 문구 */
  emptyMessage?: string;
  className?: string;
}

const DEFAULT_EMPTY_MESSAGE = '검증 대상 저장소를 아직 선택하지 않았습니다.';

export function SelectedRepoBanner({
  repo,
  onClear,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  className,
}: SelectedRepoBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'sticky top-0 z-10 flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border px-4 py-3',
        repo ? 'border-brand bg-brand-surface' : 'border-line bg-surface',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Target size={18} className={repo ? 'shrink-0 text-brand' : 'shrink-0 text-ink-muted'} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-ink-muted">검증 대상</p>
          {repo ? (
            <p className="min-w-0 text-sm font-bold break-all text-ink">{repo.fullName}</p>
          ) : (
            <p className="text-sm text-ink-muted">{emptyMessage}</p>
          )}
        </div>
      </div>

      {repo ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-xs text-ink-muted">
            <GitBranch size={14} aria-hidden="true" />
            <span className="sr-only">기본 브랜치 </span>
            {repo.defaultBranch}
          </span>
          <StatusBadge variant={repo.isPrivate ? 'private' : 'public'} />

          <a
            href={repo.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink hover:bg-surface-muted"
          >
            <ExternalLink size={14} aria-hidden="true" />
            GitHub에서 열기
            <span className="sr-only">(새 탭에서 열림)</span>
          </a>

          {onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink hover:bg-surface-muted"
            >
              <X size={14} aria-hidden="true" />
              선택 해제
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
