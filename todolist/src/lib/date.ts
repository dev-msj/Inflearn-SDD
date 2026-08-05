import type { Todo } from '@/types/todo';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_SEPARATOR = '-';
const MONTH_OFFSET = 1;
const PAD_LENGTH = 2;
const PAD_CHARACTER = '0';

/** 'YYYY-MM-DD' 형식이며 실제 존재하는 날짜인지 검사한다. 2026-02-30은 false. */
export function isValidDateString(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split(DATE_SEPARATOR).map(Number);
  const parsed = new Date(year, month - MONTH_OFFSET, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - MONTH_OFFSET &&
    parsed.getDate() === day
  ); // Date의 자동 롤오버(2/30 → 3/2)를 역검증으로 차단
}

/** 로컬 타임존 기준 오늘 날짜를 'YYYY-MM-DD'로 반환한다. */
export function todayString(date: Date = new Date()): string {
  const year = String(date.getFullYear()).padStart(4, PAD_CHARACTER);
  const month = String(date.getMonth() + MONTH_OFFSET).padStart(
    PAD_LENGTH,
    PAD_CHARACTER
  );
  const day = String(date.getDate()).padStart(PAD_LENGTH, PAD_CHARACTER);
  return [year, month, day].join(DATE_SEPARATOR);
}

/** 미완료 + 마감일이 오늘보다 이전이면 true. */
export function isOverdue(todo: Todo, today: string): boolean {
  return !todo.completed && todo.dueDate !== null && todo.dueDate < today;
} // 'YYYY-MM-DD'는 사전순 비교가 날짜순 비교와 일치

/** '2026-08-06' → '2026년 8월 6일' */
export function formatDueDate(dueDate: string): string {
  const [year, month, day] = dueDate.split(DATE_SEPARATOR).map(Number);
  return `${year}년 ${month}월 ${day}일`;
}
