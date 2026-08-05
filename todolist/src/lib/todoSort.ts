import type { SortOrder, Todo } from '@/types/todo';

/**
 * 정렬 규칙
 *  1) 마감일이 있는 항목이 없는 항목보다 항상 앞
 *  2) 마감일 있는 항목끼리: dueAsc는 오름차순, dueDesc는 내림차순
 *  3) 마감일이 같으면 seq 오름차순(먼저 등록된 항목이 앞)
 *  4) 마감일이 없는 항목끼리: 정렬 기준과 무관하게 seq 오름차순
 * 원본 배열을 변형하지 않고 새 배열을 반환한다.
 */
export function sortTodos(todos: readonly Todo[], order: SortOrder): Todo[] {
  return [...todos].sort((a, b) => {
    if (a.dueDate === null && b.dueDate === null) return a.seq - b.seq;
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    if (a.dueDate !== b.dueDate) {
      return order === 'dueAsc'
        ? a.dueDate.localeCompare(b.dueDate)
        : b.dueDate.localeCompare(a.dueDate);
    }
    return a.seq - b.seq;
  });
}
