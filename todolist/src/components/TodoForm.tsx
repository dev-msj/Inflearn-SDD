'use client';

import { useId, useState } from 'react';
import {
  TITLE_MAX_LENGTH,
  VALIDATION_MESSAGES,
  validateDueDate,
  validateTitle,
} from '@/lib/todoValidation';
import type { ValidationResult } from '@/lib/todoValidation';

const LABELS = {
  title: '할 일 내용',
  dueDate: '마감일',
  submit: '등록',
  titlePlaceholder: '무엇을 해야 하나요?',
  titleHint: `최대 ${TITLE_MAX_LENGTH}자까지 입력할 수 있습니다.`,
  dueDateHint: '마감일은 선택 사항입니다.',
} as const;

export interface TodoFormProps {
  /** 등록 성공 시 true, 검증 실패 시 false를 반환한다. */
  onSubmit: (input: { title: string; dueDate: string | null }) => boolean;
  disabled: boolean;
}

export function TodoForm({ onSubmit, disabled }: TodoFormProps) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [dueDateError, setDueDateError] = useState<string | null>(null);
  /** 날짜 입력기가 값을 해석하지 못한 상태. 빈 문자열과 구분하기 위해 따로 기억한다. */
  const [hasInvalidDueDateInput, setHasInvalidDueDateInput] = useState(false);

  const titleId = useId();
  const titleHintId = useId();
  const titleErrorId = useId();
  const dueDateId = useId();
  const dueDateErrorId = useId();
  const dueDateHintId = useId();

  const handleDueDateChange = (input: HTMLInputElement) => {
    setHasInvalidDueDateInput(input.validity.badInput);
    setDueDate(input.value);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const titleResult = validateTitle(title);
    setTitleError(titleResult.ok ? null : titleResult.message);

    // 존재하지 않는 날짜는 값이 빈 문자열로 전달되므로, 마감일 없음으로 넘기지 않고 오류로 처리한다.
    const dueDateResult: ValidationResult<string | null> =
      hasInvalidDueDateInput
        ? { ok: false, message: VALIDATION_MESSAGES.invalidDueDate }
        : validateDueDate(dueDate);
    setDueDateError(dueDateResult.ok ? null : dueDateResult.message);

    if (!titleResult.ok || !dueDateResult.ok) return;

    // 저장까지 성공했을 때에만 입력란을 초기화한다.
    if (onSubmit({ title: titleResult.value, dueDate: dueDateResult.value })) {
      setTitle('');
      setDueDate('');
      setHasInvalidDueDateInput(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="할 일 등록"
      className="flex flex-col gap-3 rounded-lg border border-slate-300 bg-white p-4"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={titleId} className="text-sm font-medium text-slate-900">
          {LABELS.title}
        </label>
        <input
          id={titleId}
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={LABELS.titlePlaceholder}
          disabled={disabled}
          aria-invalid={titleError !== null}
          aria-describedby={titleError !== null ? titleErrorId : titleHintId}
          className="w-full rounded-md border border-slate-400 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:bg-slate-100"
        />
        {titleError === null ? (
          <p id={titleHintId} className="text-sm text-slate-600">
            {LABELS.titleHint}
          </p>
        ) : (
          <p id={titleErrorId} role="alert" className="text-sm text-red-700">
            {titleError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor={dueDateId}
          className="text-sm font-medium text-slate-900"
        >
          {LABELS.dueDate}
        </label>
        <input
          id={dueDateId}
          type="date"
          value={dueDate}
          onChange={(event) => handleDueDateChange(event.currentTarget)}
          disabled={disabled}
          aria-invalid={dueDateError !== null}
          aria-describedby={
            dueDateError !== null ? dueDateErrorId : dueDateHintId
          }
          className="w-full rounded-md border border-slate-400 bg-white px-3 py-2 text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:bg-slate-100 sm:w-auto"
        />
        {dueDateError === null ? (
          <p id={dueDateHintId} className="text-sm text-slate-600">
            {LABELS.dueDateHint}
          </p>
        ) : (
          <p id={dueDateErrorId} role="alert" className="text-sm text-red-700">
            {dueDateError}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={disabled}
        className="rounded-md bg-blue-700 px-4 py-2 font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 hover:bg-blue-800 disabled:bg-slate-400 sm:self-start"
      >
        {LABELS.submit}
      </button>
    </form>
  );
}
