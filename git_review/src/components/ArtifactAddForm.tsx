'use client';

/**
 * ArtifactAddForm — 기대 산출물 경로 수동 추가 입력 폼
 *
 * 담당 PRD 수용 기준
 *  - 2-3: 사용자가 새 경로를 직접 추가할 수 있고, 결과가 즉시 목록과 총 항목 수에 반영된다.
 *  - 2-5 (엣지): 추출 0건일 때에도 이 폼으로 검증을 계속 진행할 수 있다.
 *  - 접근성 1항: 네이티브 form + submit 버튼이므로 Enter 키만으로 추가 가능
 *  - 접근성 5항: 실패 사유는 role="alert", 성공 안내는 role="status"로 전달
 *
 * 경로 정규화·중복 검사는 상위 훅(useExpectedArtifacts.addManualArtifact)이 수행한다.
 */
import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Plus } from 'lucide-react';

/** useExpectedArtifacts.addManualArtifact의 반환 형태 (TECH_SPEC §2-4) */
export type ArtifactAddResult = { ok: true } | { ok: false; message: string };

export interface ArtifactAddFormProps {
  /** 경로 추가 처리. 실패 시 사용자에게 보여줄 message를 반환한다. */
  onAdd: (rawPath: string) => ArtifactAddResult;
  disabled?: boolean;
  className?: string;
}

const EMPTY_INPUT_MESSAGE = '추가할 경로를 입력해 주세요';
const SUCCESS_MESSAGE_PREFIX = '목록에 추가했습니다: ';

export function ArtifactAddForm({ onAdd, disabled = false, className }: ArtifactAddFormProps) {
  const inputId = useId();
  const feedbackId = `${inputId}-feedback`;

  const [value, setValue] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;

    const rawPath = value.trim();
    if (rawPath.length === 0) {
      setSuccessMessage(null);
      setErrorMessage(EMPTY_INPUT_MESSAGE);
      return;
    }

    const result = onAdd(rawPath);
    if (result.ok) {
      setErrorMessage(null);
      setSuccessMessage(`${SUCCESS_MESSAGE_PREFIX}${rawPath}`);
      setValue('');
      return;
    }

    setSuccessMessage(null);
    setErrorMessage(result.message);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={['flex w-full flex-col gap-2 rounded-md border border-line bg-surface p-3', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      <label htmlFor={inputId} className="text-sm font-semibold text-ink">
        경로 직접 추가
      </label>

      <div className="flex flex-wrap items-start gap-2">
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={disabled}
          placeholder="예: src/components/AppHeader.tsx"
          autoComplete="off"
          aria-describedby={feedbackId}
          aria-invalid={errorMessage !== null}
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted disabled:cursor-not-allowed disabled:bg-surface-muted"
        />
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-brand bg-brand px-4 py-2 text-sm font-semibold text-ink-inverse hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-70"
        >
          <Plus size={16} aria-hidden="true" />
          추가
        </button>
      </div>

      <div id={feedbackId} className="min-h-5 text-xs">
        {errorMessage ? (
          <p role="alert" className="text-danger">
            {errorMessage}
          </p>
        ) : null}
        {successMessage ? (
          <p role="status" aria-live="polite" className="text-success">
            {successMessage}
          </p>
        ) : null}
        {!errorMessage && !successMessage ? (
          <p className="text-ink-muted">저장소 루트 기준 경로를 입력하세요. 폴더는 끝에 /를 붙여 구분합니다.</p>
        ) : null}
      </div>
    </form>
  );
}
