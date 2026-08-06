/**
 * 업로드 검증 (TECH_SPEC §2-1)
 *
 * 브라우저에서 실행된다. 문서 내용은 서버로 전송되지 않으며,
 * 어떤 스토리지(localStorage/sessionStorage/indexedDB)에도 기록하지 않는다.
 * (PRD 보안 요구 2항)
 */
import { AppError } from '@/lib/errors';
import type { UploadedDocument } from '@/types/artifact';

export const UPLOAD_LIMITS = {
  maxFiles: 2, // PRD 명시
  maxBytes: 1 * 1024 * 1024, // PRD 명시: 1MB
  allowedExtensions: ['.md'] as const, // PRD 명시
} as const;

export interface UploadValidationError {
  fileName: string;
  error: AppError;
}

/** 바이트 크기를 사람이 읽는 문자열로 변환한다. (예: 1.5MB, 320KB) */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0B';
  if (bytes < 1024) return `${bytes}B`;

  const units = ['KB', 'MB', 'GB'] as const;
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded}${units[unitIndex]}`;
}

/** 파일명에서 소문자 확장자를 얻는다. 확장자가 없으면 빈 문자열. */
export function getExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) return '';
  return fileName.slice(dotIndex).toLowerCase();
}

function hasAllowedExtension(fileName: string): boolean {
  const extension = getExtension(fileName);
  return (UPLOAD_LIMITS.allowedExtensions as readonly string[]).includes(extension);
}

/**
 * 확장자 → 크기 → 총 개수 순으로 검사. 통과분과 거부분을 함께 반환해 부분 업로드를 허용한다.
 * (TECH_SPEC §6.1 처리 원칙 3항: 부분 실패 허용)
 */
export function validateUploads(
  files: File[],
  alreadyUploadedCount: number,
): { accepted: File[]; rejected: UploadValidationError[] } {
  const accepted: File[] = [];
  const rejected: UploadValidationError[] = [];

  const remainingSlots = Math.max(UPLOAD_LIMITS.maxFiles - alreadyUploadedCount, 0);

  for (const file of files) {
    if (!hasAllowedExtension(file.name)) {
      rejected.push({
        fileName: file.name,
        error: new AppError('UPLOAD_INVALID_EXTENSION', { details: { fileName: file.name } }),
      });
      continue;
    }

    if (file.size > UPLOAD_LIMITS.maxBytes) {
      rejected.push({
        fileName: file.name,
        error: new AppError('UPLOAD_TOO_LARGE', {
          details: { fileName: file.name, sizeText: formatBytes(file.size) },
        }),
      });
      continue;
    }

    if (accepted.length >= remainingSlots) {
      rejected.push({
        fileName: file.name,
        error: new AppError('UPLOAD_TOO_MANY', {
          details: { fileName: file.name, maxFiles: UPLOAD_LIMITS.maxFiles },
        }),
      });
      continue;
    }

    accepted.push(file);
  }

  return { accepted, rejected };
}

/** 문서 식별자 생성. crypto.randomUUID가 없는 환경을 위한 대체 경로를 포함한다. */
function createDocumentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** File을 메모리 전용 UploadedDocument로 읽어들인다. */
export async function readAsUploadedDocument(file: File): Promise<UploadedDocument> {
  const content = await file.text();

  return {
    id: createDocumentId(),
    fileName: file.name,
    sizeBytes: file.size,
    content,
    uploadedAt: new Date().toISOString(),
  };
}
