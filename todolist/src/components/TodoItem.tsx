'use client';

import { useId, useState } from 'react';
import { formatDueDate, isOverdue } from '@/lib/date';
import { VALIDATION_MESSAGES, validateDueDate } from '@/lib/todoValidation';
import type { Todo } from '@/types/todo';

const LABELS = {
  completedStatus: '완료됨',
  incompleteStatus: '미완료',
  overdue: '기한 지남',
  noDueDate: '마감일 없음',
  dueDateField: '마감일',
  remove: '삭제',
} as const;

export interface TodoItemProps {
  todo: Todo;
  today: string;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onChangeDueDate: (id: string, dueDate: string | null) => boolean;
}

export function TodoItem({
  todo,
  today,
  onToggle,
  onRemove,
  onChangeDueDate,
}: TodoItemProps) {
  /** 변경 시도 중인 값. 저장에 성공하면 null로 되돌려 항목 값을 따라간다. */
  const [draftDueDate, setDraftDueDate] = useState<string | null>(null);
  const [dueDateError, setDueDateError] = useState<string | null>(null);

  const checkboxId = useId();
  const dueDateId = useId();
  const dueDateErrorId = useId();

  const overdue = isOverdue(todo, today);
  const dueDateValue = draftDueDate ?? todo.dueDate ?? '';

  const handleDueDateChange = (input: HTMLInputElement) => {
    // 날짜 입력기는 2026-02-30처럼 존재하지 않는 날짜를 빈 문자열로 넘긴다.
    // 그대로 저장하면 이미 지정된 마감일이 안내 없이 해제되므로, 저장하지 않고 오류만 알린다.
    if (input.validity.badInput) {
      setDueDateError(VALIDATION_MESSAGES.invalidDueDate);
      return;
    }

    const value = input.value;
    setDraftDueDate(value);

    const result = validateDueDate(value);
    if (!result.ok) {
      // 저장을 실행하지 않고 입력한 값과 오류 안내만 유지한다.
      setDueDateError(result.message);
      return;
    }
    setDueDateError(null);

    onChangeDueDate(todo.id, result.value);
    // 성공하면 저장된 값, 실패하면 변경 직전 값을 따라가 입력란과 표시 텍스트가 어긋나지 않는다.
    setDraftDueDate(null);
  };

  return (
    <li
      className={`flex flex-col gap-3 rounded-lg border bg-white p-4 sm:flex-row sm:items-start sm:justify-between ${
        overdue ? 'border-l-4 border-l-red-700 border-slate-300' : 'border-slate-300'
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <input
          id={checkboxId}
          type="checkbox"
          checked={todo.completed}
          onChange={() => onToggle(todo.id)}
          className="mt-1 h-5 w-5 shrink-0 accent-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
        />
        <div className="min-w-0 flex-1">
          <label
            htmlFor={checkboxId}
            className={`block break-words text-base ${
              todo.completed
                ? 'text-slate-500 line-through'
                : 'text-slate-900'
            }`}
          >
            {todo.title}
            <span className="sr-only">
              {todo.completed ? LABELS.completedStatus : LABELS.incompleteStatus}
            </span>
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span>
              {todo.dueDate === null
                ? LABELS.noDueDate
                : formatDueDate(todo.dueDate)}
            </span>
            {overdue && (
              <span className="rounded border border-red-700 px-1.5 py-0.5 text-xs font-medium text-red-700">
                {LABELS.overdue}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:items-end">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={dueDateId} className="text-sm text-slate-900">
            {LABELS.dueDateField}
          </label>
          <input
            id={dueDateId}
            type="date"
            value={dueDateValue}
            onChange={(event) => handleDueDateChange(event.currentTarget)}
            aria-invalid={dueDateError !== null}
            aria-describedby={dueDateError !== null ? dueDateErrorId : undefined}
            className="rounded-md border border-slate-400 bg-white px-2 py-1 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
          />
          <button
            type="button"
            onClick={() => onRemove(todo.id)}
            className="rounded-md border border-slate-400 px-3 py-1 text-sm font-medium text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 hover:bg-slate-100"
          >
            {LABELS.remove}
            <span className="sr-only">: {todo.title}</span>
          </button>
        </div>
        {dueDateError !== null && (
          <p id={dueDateErrorId} role="alert" className="text-sm text-red-700">
            {dueDateError}
          </p>
        )}
      </div>
    </li>
  );
}
