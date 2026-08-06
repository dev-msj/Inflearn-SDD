'use client';

/**
 * ArtifactList — 추출된 기대 산출물 목록 + 총 항목 수 표시
 *
 * 담당 PRD 수용 기준
 *  - 2-2: 추출한 기대 산출물(파일·폴더 경로) 목록을 화면에 나열한다.
 *  - 2-3: 삭제 결과가 즉시 목록과 총 항목 수에 반영된다. (totalCount는 상위의 파생값)
 *  - 2-5 (엣지): 추출 0건이면 "기대 산출물을 찾지 못했습니다" 안내를 표시한다.
 *    (수동 입력 폼은 ArtifactAddForm이 담당하며 페이지가 항상 함께 노출한다)
 *  - 접근성 5항: 총 항목 수 변화는 aria-live로 전달한다.
 */
import { LoaderCircle } from 'lucide-react';

import { ArtifactItemRow } from '@/components/ArtifactItemRow';
import { EmptyState } from '@/components/EmptyState';
import type { ExpectedArtifact } from '@/types/artifact';

export interface ArtifactListProps {
  artifacts: ExpectedArtifact[];
  /** 총 항목 수(파생값). 헤더에 그대로 표시한다. */
  totalCount: number;
  onRemoveArtifact: (artifactId: string) => void;
  /** 추출 진행 중 여부 */
  isExtracting?: boolean;
  /** 업로드된 문서가 1개 이상인지. 문서가 없으면 "추출 실패"가 아닌 대기 안내를 보여준다. */
  hasDocuments?: boolean;
  className?: string;
}

export function ArtifactList({
  artifacts,
  totalCount,
  onRemoveArtifact,
  isExtracting = false,
  hasDocuments = false,
  className,
}: ArtifactListProps) {
  return (
    <section
      aria-labelledby="artifact-list-heading"
      className={['flex w-full flex-col gap-3', className ?? ''].filter(Boolean).join(' ')}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="artifact-list-heading" className="text-base font-bold text-ink">
          기대 산출물
        </h2>
        <p role="status" aria-live="polite" className="text-sm font-semibold text-ink-muted">
          {`총 ${totalCount}개`}
        </p>
      </div>

      {isExtracting ? (
        <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-ink-muted">
          <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
          문서에서 기대 산출물을 추출하는 중입니다
        </p>
      ) : null}

      {!isExtracting && artifacts.length === 0 ? (
        <EmptyState
          variant={hasDocuments ? 'no-artifacts' : 'no-documents'}
          description={
            hasDocuments
              ? '문서에서 경로를 찾지 못했습니다. 아래에서 검증할 경로를 직접 추가하면 그대로 검증을 진행할 수 있습니다.'
              : undefined
          }
        />
      ) : null}

      {artifacts.length > 0 ? (
        <ul className="w-full rounded-md border border-line bg-surface">
          {artifacts.map((artifact) => (
            <ArtifactItemRow key={artifact.id} artifact={artifact} onRemove={onRemoveArtifact} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
