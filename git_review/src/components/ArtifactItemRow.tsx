'use client';

/**
 * ArtifactItemRow — 기대 산출물 1건(경로·종류·출처 배지·삭제 버튼)
 *
 * 담당 PRD 수용 기준
 *  - 2-2: 각 항목마다 어느 문서의 어느 위치에서 추출되었는지 출처를 함께 표시한다.
 *  - 2-3: 추출된 항목을 사용자가 개별 삭제할 수 있다.
 *  - 2-4 (엣지): 두 문서에서 동일 경로가 추출되면 출처 2건을 모두 표시한다. (sources 배열 전체 렌더)
 *  - 접근성 2항: 산출물 종류(파일/폴더/미상)를 StatusBadge의 아이콘+텍스트로 구분
 */
import { Trash2 } from 'lucide-react';

import { StatusBadge, type StatusBadgeVariant } from '@/components/StatusBadge';
import type { ArtifactKind, ExpectedArtifact, ExtractionRule } from '@/types/artifact';

export interface ArtifactItemRowProps {
  artifact: ExpectedArtifact;
  onRemove: (artifactId: string) => void;
}

/** 산출물 종류 → 배지 종류 */
const KIND_BADGE: Record<ArtifactKind, StatusBadgeVariant> = {
  file: 'file',
  directory: 'directory',
  unknown: 'unknown',
};

/** 추출 규칙 → 화면 표기 (출처 근거를 사용자가 이해할 수 있는 한국어로) */
const RULE_LABELS: Record<ExtractionRule, string> = {
  'tree-block': '디렉터리 트리',
  'code-block-path': '코드블록 경로',
  'inline-code': '인라인 코드',
  'table-cell': '표 셀',
  'list-label': '목록 라벨',
  manual: '직접 추가',
};

export function ArtifactItemRow({ artifact, onRemove }: ArtifactItemRowProps) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-line px-3 py-2.5 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <code className="min-w-0 text-sm font-semibold break-all text-ink">{artifact.path}</code>
          <StatusBadge variant={KIND_BADGE[artifact.kind]} />
          {artifact.origin === 'manual' ? <StatusBadge variant="info" label="직접 추가" /> : null}
        </div>

        <ul className="flex flex-wrap items-center gap-1.5">
          <li className="text-xs text-ink-muted">출처</li>
          {artifact.sources.map((source) => (
            <li key={`${source.documentId}-${source.line}-${source.rule}`}>
              <span
                title={source.snippet}
                className="inline-flex max-w-full items-center gap-1 rounded border border-line bg-surface-muted px-2 py-0.5 text-xs text-ink-muted"
              >
                <span className="truncate">{source.documentName}</span>
                <span aria-hidden="true">·</span>
                <span>{`${source.line}줄`}</span>
                <span aria-hidden="true">·</span>
                <span>{RULE_LABELS[source.rule]}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        onClick={() => onRemove(artifact.id)}
        aria-label={`${artifact.path} 항목 삭제`}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink hover:bg-surface-muted"
      >
        <Trash2 size={14} aria-hidden="true" />
        삭제
      </button>
    </li>
  );
}
