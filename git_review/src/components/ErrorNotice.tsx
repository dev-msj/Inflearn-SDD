'use client';

/**
 * ErrorNotice — AppErrorCode별 안내 문구 + 재시도 버튼
 *
 * 담당 PRD 수용 기준
 *  - 1-6 (에러): 인증 취소 시 "인증이 취소되었습니다. 다시 시도해 주세요" 표시 및 재시도
 *  - 2-6 (에러): 확장자·용량 위반 시 허용 확장자와 최대 크기를 명시한 오류 메시지
 *  - 3-7 (에러): 권한 부족·한도 초과·네트워크 오류를 원인별로 안내하고 재시도 수단 제공
 *  - 접근성: 오류 영역은 role="alert"로 스크린리더에 즉시 전달 (TECH_SPEC §7.3)
 *
 * 문구는 ERROR_CATALOG 단일 정의를 사용한다. (TECH_SPEC §6.1 처리 원칙 1항)
 */
import { Info, RefreshCw, TriangleAlert, X, type LucideIcon } from 'lucide-react';

import { ERROR_CATALOG, formatUserMessage, type AppErrorCode } from '@/lib/errors';

export type ErrorNoticeTone = 'danger' | 'warning' | 'info';

export interface ErrorNoticeProps {
  code: AppErrorCode;
  /** AppError.userMessage. 생략하면 ERROR_CATALOG의 기본 문구를 사용한다. */
  message?: string;
  /** 파일명 등 보조 정보 줄 (부분 실패 목록 표시용) */
  details?: string[];
  /** 재시도 가능 여부. 생략하면 ERROR_CATALOG 값을 사용한다. */
  retryable?: boolean;
  /** 재시도 처리. retryable이 true이고 이 값이 있을 때만 버튼을 노출한다. */
  onRetry?: () => void;
  retryLabel?: string;
  /** 닫기 처리. 지정하면 닫기 버튼을 노출한다. */
  onDismiss?: () => void;
  className?: string;
}

/** 안내용 코드(httpStatus 200)는 경고/정보 톤으로, 나머지는 오류 톤으로 표시한다. */
const TONE_BY_CODE: Partial<Record<AppErrorCode, ErrorNoticeTone>> = {
  REPO_EMPTY: 'info',
  EXTRACTION_EMPTY: 'info',
  TREE_TRUNCATED: 'warning',
  RATE_LIMITED: 'warning',
  UPLOAD_TOO_MANY: 'warning',
};

const TONE_STYLES: Record<ErrorNoticeTone, { container: string; icon: LucideIcon; label: string }> = {
  danger: {
    container: 'border-danger bg-danger-surface text-danger',
    icon: TriangleAlert,
    label: '오류',
  },
  warning: {
    container: 'border-warning bg-warning-surface text-warning',
    icon: TriangleAlert,
    label: '주의',
  },
  info: {
    container: 'border-info bg-info-surface text-info',
    icon: Info,
    label: '안내',
  },
};

const DEFAULT_RETRY_LABEL = '다시 시도';

export function ErrorNotice({
  code,
  message,
  details,
  retryable,
  onRetry,
  retryLabel = DEFAULT_RETRY_LABEL,
  onDismiss,
  className,
}: ErrorNoticeProps) {
  // 카탈로그에 없는 코드가 넘어와도 렌더가 깨지지 않도록 폴백한다.
  const entry = ERROR_CATALOG[code] ?? ERROR_CATALOG.UNKNOWN;
  const tone = TONE_BY_CODE[code] ?? 'danger';
  const style = TONE_STYLES[tone];
  const Icon = style.icon;
  const text = message ?? formatUserMessage(entry.userMessage);
  const canRetry = (retryable ?? entry.retryable) && Boolean(onRetry);

  return (
    <div
      role={tone === 'info' ? 'status' : 'alert'}
      aria-live={tone === 'info' ? 'polite' : 'assertive'}
      className={['flex w-full flex-col gap-2 rounded-md border px-4 py-3', style.container, className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex min-w-0 items-start gap-2">
        <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold break-words">
            <span className="sr-only">{style.label}: </span>
            {text}
          </p>
          {details && details.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm break-words">
              {details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          ) : null}
        </div>

        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded p-1 hover:bg-surface"
            aria-label="알림 닫기"
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {canRetry ? (
        <div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-md border border-current bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-surface-muted"
          >
            <RefreshCw size={14} aria-hidden="true" />
            {retryLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
