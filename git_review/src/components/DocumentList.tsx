'use client';

/**
 * DocumentList — 업로드된 문서의 파일명·크기 표시 및 제거
 *
 * 담당 PRD 수용 기준
 *  - 2-1: 업로드 직후 각 파일의 이름과 크기가 화면에 표시된다.
 *  - 접근성 1항: 제거 버튼은 네이티브 button이며 파일명을 포함한 aria-label을 갖는다.
 *  - 접근성 5항: 문서 목록 변경을 aria-live로 알린다.
 *
 * 문서 내용(content)은 화면에 노출하지 않는다. (메모리 전용 데이터)
 */
import { FileText, Trash2 } from 'lucide-react';

import { EmptyState } from '@/components/EmptyState';
import { UPLOAD_LIMITS, formatBytes } from '@/lib/upload/validateUpload';
import type { UploadedDocument } from '@/types/artifact';

export interface DocumentListProps {
  documents: UploadedDocument[];
  /** 문서 제거 처리 */
  onRemove: (documentId: string) => void;
  /** 최대 문서 수. 기본 UPLOAD_LIMITS.maxFiles */
  maxFiles?: number;
  className?: string;
}

export function DocumentList({
  documents,
  onRemove,
  maxFiles = UPLOAD_LIMITS.maxFiles,
  className,
}: DocumentListProps) {
  return (
    <div className={['flex w-full flex-col gap-2', className ?? ''].filter(Boolean).join(' ')}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">업로드한 문서</h3>
        <p role="status" aria-live="polite" className="text-xs text-ink-muted">
          {`${documents.length} / ${maxFiles}개`}
        </p>
      </div>

      {documents.length === 0 ? (
        <EmptyState variant="no-documents" />
      ) : (
        <ul className="flex w-full flex-col gap-2">
          {documents.map((uploaded) => (
            <li
              key={uploaded.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-md border border-line bg-surface px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileText size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="min-w-0 text-sm font-semibold break-all text-ink">{uploaded.fileName}</p>
                  <p className="text-xs text-ink-muted">
                    <span className="sr-only">파일 크기 </span>
                    {formatBytes(uploaded.sizeBytes)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onRemove(uploaded.id)}
                aria-label={`${uploaded.fileName} 문서 제거`}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink hover:bg-surface-muted"
              >
                <Trash2 size={14} aria-hidden="true" />
                제거
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
