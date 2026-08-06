'use client';

/**
 * ResultChecklist — 항목별 존재·없음 체크리스트 + GitHub 링크
 *
 * 담당 PRD 수용 기준
 *  - 3-1: 기대 산출물 각 항목에 "존재" 또는 "없음" 상태가 표시된다.
 *  - 3-3: "존재" 항목은 해당 저장소의 파일 위치로 이동할 수 있는 링크를 제공한다.
 *  - 3-5 (엣지): 폴더 항목은 하위 파일 수를 함께 표시해 존재 판정 근거를 보여준다.
 *  - 접근성 2항: 상태는 StatusBadge(아이콘+텍스트+색상) 3중 표기
 *  - 접근성 4항: 긴 경로는 break-all + min-w-0으로 가로 스크롤을 만들지 않는다.
 *
 * 항목 데이터는 서버 매칭 결과(VerificationItem)를 그대로 사용한다.
 */
import { ExternalLink } from 'lucide-react';

import { getResultFilterTabId, type ResultFilter } from '@/components/ResultFilterTabs';
import { StatusBadge, type StatusBadgeVariant } from '@/components/StatusBadge';
import type { ArtifactKind } from '@/types/artifact';
import type { VerificationItem } from '@/types/verification';

export interface ResultChecklistProps {
  /** 필터가 적용된 항목 목록 (useVerification.visibleItems) */
  items: VerificationItem[];
  /** 현재 필터. 비어 있을 때의 안내 문구를 결정한다. */
  filter: ResultFilter;
  /** 검증 진행 중 여부 */
  isRunning?: boolean;
  /** ResultFilterTabs의 aria-controls와 연결할 DOM id */
  id?: string;
  className?: string;
}

const KIND_BADGE: Record<ArtifactKind, StatusBadgeVariant> = {
  file: 'file',
  directory: 'directory',
  unknown: 'unknown',
};

const EMPTY_MESSAGES: Record<ResultFilter, string> = {
  all: '표시할 검증 항목이 없습니다.',
  missing: '"없음"으로 판정된 항목이 없습니다. 모든 기대 산출물이 저장소에 존재합니다.',
};

export function ResultChecklist({ items, filter, isRunning = false, id, className }: ResultChecklistProps) {
  if (items.length === 0) {
    return (
      <div
        id={id}
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={getResultFilterTabId(filter)}
        className={['rounded-md border border-line bg-surface px-4 py-6 text-sm text-ink-muted', className ?? '']
          .filter(Boolean)
          .join(' ')}
      >
        {isRunning ? '검증 결과를 기다리는 중입니다.' : EMPTY_MESSAGES[filter]}
      </div>
    );
  }

  return (
    <ul
      id={id}
      role="tabpanel"
      tabIndex={0}
      aria-labelledby={getResultFilterTabId(filter)}
      className={['w-full rounded-md border border-line bg-surface', className ?? ''].filter(Boolean).join(' ')}
    >
      {items.map((item) => {
        const isCaseMismatch = item.matchedPath !== null && item.matchedPath !== item.path;
        const showChildCount = item.kind === 'directory' && item.status === 'present';

        return (
          <li
            key={item.artifactId}
            className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-line px-3 py-2.5 last:border-b-0"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <StatusBadge variant={item.status === 'present' ? 'present' : 'missing'} />
                <code className="min-w-0 text-sm font-semibold break-all text-ink">{item.path}</code>
                <StatusBadge variant={KIND_BADGE[item.kind]} />
                {isCaseMismatch ? <StatusBadge variant="case-mismatch" /> : null}
              </div>

              {isCaseMismatch ? (
                <p className="text-xs break-all text-ink-muted">{`저장소의 실제 경로: ${item.matchedPath}`}</p>
              ) : null}

              {showChildCount ? (
                <p className="text-xs text-ink-muted">{`하위 파일 ${item.childFileCount}개`}</p>
              ) : null}
            </div>

            {item.htmlUrl ? (
              <a
                href={item.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${item.path} 위치를 GitHub에서 열기 (새 탭)`}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-brand-strong hover:bg-surface-muted"
              >
                <ExternalLink size={14} aria-hidden="true" />
                GitHub에서 열기
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
