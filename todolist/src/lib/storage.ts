import type { SortOrder, Todo, TodoStorePayload } from '@/types/todo';

export const STORAGE_KEYS = {
  todos: 'todolist.todos.v1',
  sortOrder: 'todolist.sortOrder.v1',
} as const;

export type StorageErrorCode = 'UNAVAILABLE' | 'PARSE_FAILED' | 'WRITE_FAILED';

export type StorageResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: StorageErrorCode };

/** 저장 스키마 버전. 형식이 바뀌면 키와 함께 올린다. */
const STORE_VERSION = 1;

/** 정렬 기준 기본값 및 허용 값 목록 */
export const DEFAULT_SORT_ORDER: SortOrder = 'dueAsc';
const SORT_ORDER_VALUES: readonly SortOrder[] = ['dueAsc', 'dueDesc'];

/** SSR·프라이빗 모드 등에서 localStorage 사용 가능 여부를 확인한다. */
export function isStorageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage !== null;
  } catch {
    return false;
  }
}

function isTodo(value: unknown): value is Todo {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<keyof Todo, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.completed === 'boolean' &&
    (candidate.dueDate === null || typeof candidate.dueDate === 'string') &&
    typeof candidate.seq === 'number' &&
    Number.isFinite(candidate.seq) &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}

function isSortOrder(value: unknown): value is SortOrder {
  return (
    typeof value === 'string' &&
    SORT_ORDER_VALUES.includes(value as SortOrder)
  );
}

/** 파싱 실패 시 예외를 던지지 않고 PARSE_FAILED를 반환한다. */
export function readTodos(): StorageResult<Todo[]> {
  if (!isStorageAvailable()) return { ok: false, error: 'UNAVAILABLE' };
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEYS.todos);
  } catch {
    return { ok: false, error: 'UNAVAILABLE' };
  }
  if (raw === null) return { ok: true, value: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, error: 'PARSE_FAILED' };
    }
    const payload = parsed as Partial<TodoStorePayload>;
    if (payload.version !== STORE_VERSION || !Array.isArray(payload.todos)) {
      return { ok: false, error: 'PARSE_FAILED' };
    }
    // 손상된 항목은 제외하고 필수 필드를 갖춘 항목만 복원한다.
    return { ok: true, value: payload.todos.filter(isTodo) };
  } catch {
    return { ok: false, error: 'PARSE_FAILED' };
  }
}

/** 용량 초과(QuotaExceededError) 등 쓰기 실패를 WRITE_FAILED로 변환한다. */
export function writeTodos(todos: Todo[]): StorageResult<Todo[]> {
  if (!isStorageAvailable()) return { ok: false, error: 'UNAVAILABLE' };
  const payload: TodoStorePayload = { version: STORE_VERSION, todos };
  try {
    window.localStorage.setItem(STORAGE_KEYS.todos, JSON.stringify(payload));
    return { ok: true, value: todos };
  } catch {
    return { ok: false, error: 'WRITE_FAILED' };
  }
}

export function readSortOrder(): StorageResult<SortOrder> {
  if (!isStorageAvailable()) return { ok: false, error: 'UNAVAILABLE' };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.sortOrder);
    if (raw === null) return { ok: true, value: DEFAULT_SORT_ORDER };
    if (!isSortOrder(raw)) return { ok: false, error: 'PARSE_FAILED' };
    return { ok: true, value: raw };
  } catch {
    return { ok: false, error: 'UNAVAILABLE' };
  }
}

export function writeSortOrder(order: SortOrder): StorageResult<SortOrder> {
  if (!isStorageAvailable()) return { ok: false, error: 'UNAVAILABLE' };
  try {
    window.localStorage.setItem(STORAGE_KEYS.sortOrder, order);
    return { ok: true, value: order };
  } catch {
    return { ok: false, error: 'WRITE_FAILED' };
  }
}
