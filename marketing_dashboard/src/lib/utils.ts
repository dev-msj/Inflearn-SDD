/** 공용 헬퍼. 서버·클라이언트 양쪽에서 쓰이므로 외부 의존성을 두지 않는다. */

export type ClassValue = string | number | false | null | undefined;

/** 조건부 클래스명 결합. 외부 라이브러리(clsx 등) 없이 최소 구현 */
export function cn(...values: ClassValue[]): string {
  return values
    .filter((value): value is string | number => value !== null && value !== undefined && value !== false && value !== '')
    .join(' ')
    .trim();
}

/** 기준 시각에서 days 일 이전 시각 */
export function subtractDays(base: Date, days: number): Date {
  const result = new Date(base.getTime());
  result.setDate(result.getDate() - days);
  return result;
}

/** ISO 8601 문자열 (기간 계약에 사용) */
export function toIsoString(date: Date): string {
  return date.toISOString();
}

/** `2026. 8. 11.` 형태의 한국어 날짜 표기. 파싱 실패 시 원문 반환 */
export function formatDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : '';
  }
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/** `2026년 8월 4일 ~ 2026년 8월 11일` 형태의 기간 표기 */
export function formatDateRange(from: string | Date, to: string | Date): string {
  return `${formatDate(from)} ~ ${formatDate(to)}`;
}

/** `2026-08-11 14:03` 형태의 생성 시각 표기 */
export function formatDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : '';
  }
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** 최대 길이를 넘으면 말줄임. 서로게이트 페어를 1자로 계산 */
export function truncate(value: string, maxLength: number): string {
  const chars = Array.from(value);
  if (chars.length <= maxLength) return value;
  if (maxLength <= 1) return '…';
  return `${chars.slice(0, maxLength - 1).join('')}…`;
}

/** 여러 줄 문자열의 첫 줄만 (커밋 메시지 요약용) */
export function firstLine(value: string): string {
  return value.split('\n', 1)[0]?.trim() ?? '';
}
