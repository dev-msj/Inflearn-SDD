'use client';

/**
 * 업로드 검증 후 문서 상태 등록 (TECH_SPEC §4 기능2-1)
 *
 * 담당 PRD 수용 기준
 *  - 2-1: 파일 선택·끌어놓기 두 경로 모두 이 훅의 addFiles()로 들어온다.
 *  - 2-6 (에러): 확장자·크기·개수 위반 파일만 거부하고 통과한 파일은 그대로 업로드한다(부분 수용).
 *
 * 파일 내용은 메모리(UploadedDocument.content)에만 담기며 서버로 전송하지 않는다.
 */
import { useCallback, useState } from 'react';

import { AppError } from '@/lib/errors';
import {
  readAsUploadedDocument,
  validateUploads,
  type UploadValidationError,
} from '@/lib/upload/validateUpload';
import { useAppDispatch, useAppState } from '@/state/AppStateProvider';
import type { UploadedDocument } from '@/types/artifact';

export interface UseDocumentUploadResult {
  documents: UploadedDocument[];
  /** 선택·드롭된 파일을 검증하고 통과분만 상태에 등록한다. */
  addFiles(files: File[]): Promise<void>;
  removeDocument(documentId: string): void;
  /** 거부된 파일 목록 (파일명 + 사유) */
  rejections: UploadValidationError[];
  clearRejections(): void;
  isProcessing: boolean;
}

export function useDocumentUpload(): UseDocumentUploadResult {
  const { documents } = useAppState();
  const dispatch = useAppDispatch();

  const [rejections, setRejections] = useState<UploadValidationError[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const addFiles = useCallback(
    async (files: File[]): Promise<void> => {
      if (files.length === 0) return;

      const { accepted, rejected } = validateUploads(files, documents.length);
      const failures = [...rejected];

      setIsProcessing(true);
      try {
        const uploaded: UploadedDocument[] = [];
        for (const file of accepted) {
          try {
            uploaded.push(await readAsUploadedDocument(file));
          } catch (cause) {
            // 파일 1건 읽기 실패가 나머지 업로드를 막지 않게 한다. (부분 실패 허용)
            failures.push({
              fileName: file.name,
              error: new AppError('UNKNOWN', { details: { fileName: file.name }, cause }),
            });
          }
        }

        if (uploaded.length > 0) {
          dispatch({ type: 'ADD_DOCUMENTS', documents: uploaded });
        }
      } finally {
        setRejections(failures);
        setIsProcessing(false);
      }
    },
    [dispatch, documents.length],
  );

  const removeDocument = useCallback(
    (documentId: string): void => {
      dispatch({ type: 'REMOVE_DOCUMENT', documentId });
    },
    [dispatch],
  );

  const clearRejections = useCallback((): void => {
    setRejections([]);
  }, []);

  return {
    documents,
    addFiles,
    removeDocument,
    rejections,
    clearRejections,
    isProcessing,
  };
}
