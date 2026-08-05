'use client';

import { TodoItem } from '@/components/TodoItem';
import type { Todo } from '@/types/todo';

const MESSAGES = {
  empty: '등록된 할 일이 없습니다',
  loading: '할 일 목록을 불러오는 중입니다',
} as const;

const SKELETON_ROW_COUNT = 3;
const SKELETON_ROWS = Array.from(
  { length: SKELETON_ROW_COUNT },
  (_, index) => index
);

export interface TodoListProps {
  todos: Todo[]; // 이미 정렬이 끝난 배열
  isLoaded: boolean;
  today: string; // 'YYYY-MM-DD'
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onChangeDueDate: (id: string, dueDate: string | null) => boolean;
}

export function TodoList({
  todos,
  isLoaded,
  today,
  onToggle,
  onRemove,
  onChangeDueDate,
}: TodoListProps) {
  if (!isLoaded) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-3">
        <span className="sr-only">{MESSAGES.loading}</span>
        {SKELETON_ROWS.map((row) => (
          <div
            key={row}
            className="h-20 animate-pulse rounded-lg border border-slate-300 bg-slate-100"
          />
        ))}
      </div>
    );
  }

  if (todos.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-400 bg-white p-6 text-center text-slate-600">
        {MESSAGES.empty}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {todos.map((todo) => (
        <TodoItem
          key={todo.id}
          todo={todo}
          today={today}
          onToggle={onToggle}
          onRemove={onRemove}
          onChangeDueDate={onChangeDueDate}
        />
      ))}
    </ul>
  );
}
