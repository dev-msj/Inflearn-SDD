'use client';

import { useMemo, useState } from 'react';
import { SortControl } from '@/components/SortControl';
import { TodoForm } from '@/components/TodoForm';
import { TodoList } from '@/components/TodoList';
import { TodoSummary } from '@/components/TodoSummary';
import { useSortOrder } from '@/hooks/useSortOrder';
import { useTodos } from '@/hooks/useTodos';
import { todayString } from '@/lib/date';
import { sortTodos } from '@/lib/todoSort';

const TEXTS = {
  heading: '할 일 목록',
  description: '등록한 할 일은 이 기기의 브라우저에만 저장됩니다.',
} as const;

export function TodoApp() {
  const {
    todos,
    isLoaded: isTodosLoaded,
    errorMessage,
    totalCount,
    completedCount,
    addTodo,
    removeTodo,
    toggleTodo,
    setDueDate,
  } = useTodos();
  const { sortOrder, setSortOrder, isLoaded: isSortOrderLoaded } =
    useSortOrder();

  // 마운트 시 1회만 계산해 항목마다 Date 객체를 만들지 않는다.
  const [today] = useState(() => todayString());

  const isLoaded = isTodosLoaded && isSortOrderLoaded;

  const sortedTodos = useMemo(
    () => sortTodos(todos, sortOrder),
    [todos, sortOrder]
  );

  const handleChangeDueDate = (id: string, dueDate: string | null): boolean =>
    setDueDate(id, dueDate ?? '');

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{TEXTS.heading}</h1>
        <p className="mt-1 text-sm text-slate-600">{TEXTS.description}</p>
      </header>

      <div className="mb-6">
        <TodoForm onSubmit={addTodo} disabled={!isLoaded} />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TodoSummary completedCount={completedCount} totalCount={totalCount} />
        <SortControl value={sortOrder} onChange={setSortOrder} />
      </div>

      {errorMessage !== null && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-4 rounded-md border border-red-700 bg-white px-3 py-2 text-sm text-red-700"
        >
          {errorMessage}
        </div>
      )}

      <TodoList
        todos={sortedTodos}
        isLoaded={isLoaded}
        today={today}
        onToggle={toggleTodo}
        onRemove={removeTodo}
        onChangeDueDate={handleChangeDueDate}
      />
    </main>
  );
}
