'use client';

/**
 * DocumentUploader — 파일 선택 + 드래그앤드롭 업로드 진입점
 *
 * 담당 PRD 수용 기준
 *  - 2-1: 마크다운 문서를 파일 선택 또는 끌어놓기로 최대 2개까지 업로드할 수 있다.
 *  - 2-6 (에러): 허용 확장자(.md)와 최대 크기(1MB)를 화면에 명시한다. (실제 검증은 validateUploads가 수행)
 *  - 접근성 1항: 드롭 영역은 role="button" + tabIndex={0} + Enter/Space로 파일 대화상자를 열어
 *    드래그앤드롭의 키보드 대체 수단을 제공한다. (TECH_SPEC §7.3)
 *
 * 파일 내용은 상위 훅(useDocumentUpload)이 메모리에서만 다룬다. 이 컴포넌트는 File 객체만 전달한다.
 */
import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react';
import { LoaderCircle, Upload } from 'lucide-react';

import { UPLOAD_LIMITS, formatBytes } from '@/lib/upload/validateUpload';

export interface DocumentUploaderProps {
  /** 선택·드롭된 파일 전달. 검증(확장자/크기/개수)은 상위에서 수행한다. */
  onFilesSelected: (files: File[]) => void;
  /** 이미 업로드된 문서 수 (남은 슬롯 계산용) */
  uploadedCount: number;
  /** 최대 문서 수. 기본 UPLOAD_LIMITS.maxFiles */
  maxFiles?: number;
  /** 최대 파일 크기(byte). 기본 UPLOAD_LIMITS.maxBytes */
  maxBytes?: number;
  /** 업로드/파싱 진행 중 여부 */
  isProcessing?: boolean;
  disabled?: boolean;
  className?: string;
}

const ACCEPT_ATTRIBUTE = '.md,text/markdown';
const INPUT_ID = 'document-uploader-input';
const HINT_ID = 'document-uploader-hint';

export function DocumentUploader({
  onFilesSelected,
  uploadedCount,
  maxFiles = UPLOAD_LIMITS.maxFiles,
  maxBytes = UPLOAD_LIMITS.maxBytes,
  isProcessing = false,
  disabled = false,
  className,
}: DocumentUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const isFull = uploadedCount >= maxFiles;
  const isDisabled = disabled || isFull || isProcessing;
  const remaining = Math.max(maxFiles - uploadedCount, 0);

  const openFileDialog = () => {
    if (isDisabled) return;
    inputRef.current?.click();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      openFileDialog();
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (isDisabled) return;
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    if (isDisabled) return;

    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFilesSelected(files);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) onFilesSelected(files);
    // 같은 파일을 연속으로 선택해도 change 이벤트가 발생하도록 초기화한다.
    event.target.value = '';
  };

  const hintText = isFull
    ? `문서는 최대 ${maxFiles}개까지 업로드할 수 있습니다. 기존 문서를 제거한 뒤 다시 시도해 주세요.`
    : `마크다운(.md) 파일만 업로드할 수 있으며, 파일당 최대 ${formatBytes(maxBytes)}입니다. ${remaining}개 더 추가할 수 있습니다.`;

  return (
    <div className={['flex w-full flex-col gap-2', className ?? ''].filter(Boolean).join(' ')}>
      <div
        role="button"
        tabIndex={isDisabled ? -1 : 0}
        aria-disabled={isDisabled}
        aria-describedby={HINT_ID}
        aria-label="스펙 문서 업로드. 파일을 끌어놓거나 Enter 키를 눌러 파일을 선택하세요."
        onClick={openFileDialog}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={[
          'flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center',
          isDisabled ? 'cursor-not-allowed border-line bg-surface-muted' : 'cursor-pointer border-line bg-surface',
          isDragOver && !isDisabled ? 'border-brand bg-brand-surface' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {isProcessing ? (
          <LoaderCircle size={28} className="animate-spin text-brand" aria-hidden="true" />
        ) : (
          <Upload size={28} className="text-ink-muted" aria-hidden="true" />
        )}
        <p className="text-sm font-semibold text-ink">
          {isProcessing ? '문서를 읽는 중입니다' : '문서를 끌어놓거나 Enter 키로 파일을 선택하세요'}
        </p>
        <p className="text-xs text-ink-muted">PRD.md · TECH_SPEC.md 같은 마크다운 문서를 올려 주세요</p>
      </div>

      <p id={HINT_ID} className="text-xs text-ink-muted">
        {hintText}
      </p>

      {/* 키보드 초점 순서를 흐트러뜨리지 않도록 화면에서 숨기고 tabIndex를 제외한다. */}
      <input
        ref={inputRef}
        id={INPUT_ID}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        multiple
        tabIndex={-1}
        aria-hidden="true"
        disabled={isDisabled}
        onChange={handleInputChange}
        className="sr-only"
      />
    </div>
  );
}
