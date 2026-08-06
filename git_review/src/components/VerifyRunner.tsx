'use client';

/**
 * VerifyRunner — 검증 실행 버튼 + 진행률(확인 완료 n / 전체 N) 표시
 *
 * 담당 PRD 수용 기준
 *  - 3-4: 검증 진행 중에는 전체 항목 수 대비 확인 완료 항목 수가 표시된다.
 *  - 3-7 (에러): 실패 시 상위가 전달한 ErrorNotice와 함께 재실행 진입점을 유지한다.
 *  - 접근성 1항: 검증 실행은 네이티브 button이므로 키보드만으로 수행 가능
 *  - 접근성 5항: 진행률 영역은 role="status" aria-live="polite" (TECH_SPEC §7.3)
 */
import { LoaderCircle, Play, RefreshCw } from 'lucide-react';

export type VerifyRunnerStatus = 'idle' | 'running' | 'done' | 'error';

export interface VerifyRunnerProgress {
  checked: number;
  total: number;
}

export interface VerifyRunnerProps {
  status: VerifyRunnerStatus;
  progress: VerifyRunnerProgress;
  /** 현재 단계 안내 문구 (예: "저장소 파일 목록을 불러오는 중") */
  phaseMessage?: string;
  /** 검증 대상 기대 산출물 총 개수 */
  totalArtifacts: number;
  /** 실행 가능 여부 (저장소 선택 + 산출물 1개 이상) */
  canRun: boolean;
  onRun: () => void;
  /** 실행할 수 없는 이유. canRun이 false일 때 안내한다. */
  disabledReason?: string;
  className?: string;
}

const RUN_LABEL = '검증 실행';
const RERUN_LABEL = '다시 검증';
const RUNNING_LABEL = '검증 중';

export function VerifyRunner({
  status,
  progress,
  phaseMessage,
  totalArtifacts,
  canRun,
  onRun,
  disabledReason,
  className,
}: VerifyRunnerProps) {
  const isRunning = status === 'running';
  const isDisabled = !canRun || isRunning;
  const total = progress.total > 0 ? progress.total : totalArtifacts;
  const percent = total > 0 ? Math.min(Math.round((progress.checked / total) * 100), 100) : 0;
  const buttonLabel = isRunning ? RUNNING_LABEL : status === 'idle' ? RUN_LABEL : RERUN_LABEL;

  return (
    <section
      aria-labelledby="verify-runner-heading"
      className={['flex w-full flex-col gap-3 rounded-md border border-line bg-surface p-4', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="verify-runner-heading" className="text-base font-bold text-ink">
            산출물 존재 검증
          </h2>
          <p className="text-xs text-ink-muted">{`기대 산출물 ${totalArtifacts}개를 저장소와 대조합니다`}</p>
        </div>

        <button
          type="button"
          onClick={onRun}
          disabled={isDisabled}
          aria-describedby={!canRun && disabledReason ? 'verify-runner-disabled-reason' : undefined}
          className="inline-flex shrink-0 items-center gap-2 rounded-md border border-brand bg-brand px-5 py-2.5 text-sm font-semibold text-ink-inverse hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isRunning ? (
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
          ) : status === 'idle' ? (
            <Play size={16} aria-hidden="true" />
          ) : (
            <RefreshCw size={16} aria-hidden="true" />
          )}
          {buttonLabel}
        </button>
      </div>

      {!canRun && disabledReason ? (
        <p id="verify-runner-disabled-reason" className="text-xs text-ink-muted">
          {disabledReason}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={progress.checked}
          aria-valuetext={`전체 ${total}개 중 ${progress.checked}개 확인 완료`}
          aria-label="검증 진행률"
          className="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
        >
          <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${percent}%` }} />
        </div>

        <p role="status" aria-live="polite" className="text-sm text-ink-muted">
          {isRunning || status === 'done'
            ? `확인 완료 ${progress.checked} / 전체 ${total}${phaseMessage ? ` · ${phaseMessage}` : ''}`
            : (phaseMessage ?? '검증을 실행하면 진행률이 표시됩니다')}
        </p>
      </div>
    </section>
  );
}
