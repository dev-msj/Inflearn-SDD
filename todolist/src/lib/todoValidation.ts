import { isValidDateString } from '@/lib/date';

export const TITLE_MAX_LENGTH = 100;

export const VALIDATION_MESSAGES = {
  emptyTitle: '할 일 내용을 입력해 주세요',
  tooLongTitle: `최대 ${TITLE_MAX_LENGTH}자까지 입력할 수 있습니다`,
  invalidDueDate: '올바른 날짜를 입력해 주세요',
  saveFailed: '상태를 저장하지 못했습니다',
  loadFailed:
    '저장된 할 일을 불러오지 못했습니다. 지금 할 일을 등록하면 기존 데이터는 덮어써집니다',
  storageUnavailable:
    '이 브라우저에서는 할 일이 저장되지 않습니다. 화면을 새로고침하면 목록이 사라집니다',
} as const;

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

/** 앞뒤 공백 제거 후 1~100자인지 검사한다. 통과 시 trim된 문자열을 반환. */
export function validateTitle(raw: string): ValidationResult<string> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: VALIDATION_MESSAGES.emptyTitle };
  }
  if (trimmed.length > TITLE_MAX_LENGTH) {
    return { ok: false, message: VALIDATION_MESSAGES.tooLongTitle };
  }
  return { ok: true, value: trimmed };
}

/** 빈 문자열은 '마감일 없음'(null)으로 허용, 형식/실재하지 않는 날짜는 오류. */
export function validateDueDate(raw: string): ValidationResult<string | null> {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: null };
  if (!isValidDateString(trimmed)) {
    return { ok: false, message: VALIDATION_MESSAGES.invalidDueDate };
  }
  return { ok: true, value: trimmed };
}
