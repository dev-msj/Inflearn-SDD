'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { Spinner } from '@/components/ui/Spinner';
import { PLATFORM_SPECS } from '@/lib/constants';
import { validateDraft } from '@/lib/drafts';
import { formatDateTime } from '@/lib/utils';
import type { ApiError, AsyncStatus } from '@/types/api';
import type { ContentDraft, Platform } from '@/types/domain';

/**
 * 플랫폼 초안 카드 (AC-3.3 ~ AC-3.7, AC-3.10).
 *
 * 글자 수·경고는 **textarea 의 현재 값**을 기준으로 매 렌더 재계산하므로 입력과 함께 갱신된다 (AC-3.4).
 * 복사 대상도 화면에 표시된 값이다 (AC-3.6).
 */

export interface DraftCardProps {
  platform: Platform;
  draft: ContentDraft | null;
  status: AsyncStatus;
  error: ApiError | null;
  knownRepositories: string[];
  /** 분석 결과가 있어야 재생성할 수 있다. false 면 버튼을 비활성화한다 (AC-3.1, M-3) */
  canRegenerate: boolean;
  onEdit(content: string): void;
  onRegenerate(): void;
}

type CopyState = 'idle' | 'copied' | 'failed';

const COPY_FEEDBACK_MS = 2_000;

const PLACEHOLDER = '아직 초안이 없습니다. 위의 "콘텐츠 생성" 버튼을 눌러 주세요.';
const LOADING_MESSAGE = '초안을 생성하고 있습니다…';

/** 분량 안내 문구 (규격 위반 여부와 무관하게 항상 보여 준다) */
function specHint(platform: Platform): string {
  const spec = PLATFORM_SPECS[platform];
  if (platform === 'x') return `${spec.max}자 이내 · 해시태그 ${spec.hashtags}`;
  if (platform === 'linkedin') return `${spec.min}~${spec.max}자 · 해시태그 ${spec.hashtags}`;
  return `${spec.min}자 이상 · 마크다운`;
}

/** `navigator.clipboard` 가 없거나 실패했을 때의 폴백 */
function copyWithExecCommand(text: string): boolean {
  if (typeof document === 'undefined') return false;

  const element = document.createElement('textarea');
  element.value = text;
  element.setAttribute('readonly', '');
  element.style.position = 'fixed';
  element.style.opacity = '0';
  document.body.appendChild(element);

  try {
    element.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(element);
  }
}

export function DraftCard({
  platform,
  draft,
  status,
  error,
  knownRepositories,
  canRegenerate,
  onEdit,
  onRegenerate,
}: DraftCardProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const spec = PLATFORM_SPECS[platform];
  const value = draft?.content ?? '';

  // textarea 의 현재 값으로 매 렌더 재계산 → 글자 수·경고가 실시간으로 갱신된다 (AC-3.4)
  const validation = validateDraft(platform, value, knownRepositories);

  const isLoading = status === 'loading';
  const hasDraft = draft !== null;

  const handleCopy = async () => {
    if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);

    let copied = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
        await navigator.clipboard.writeText(value);
        copied = true;
      }
    } catch {
      copied = false;
    }

    // 비보안 컨텍스트·권한 거부 등으로 Clipboard API 가 실패하면 폴백 (AC-3.6)
    if (!copied) copied = copyWithExecCommand(value);

    setCopyState(copied ? 'copied' : 'failed');
    copyTimerRef.current = setTimeout(() => setCopyState('idle'), COPY_FEEDBACK_MS);
  };

  return (
    <Card
      title={spec.label}
      description={specHint(platform)}
      actions={
        <span
          aria-live="polite"
          className={
            hasDraft && !validation.withinLimit
              ? 'text-xs font-medium text-warn'
              : 'text-xs text-ink-muted'
          }
        >
          {validation.charCount}자
        </span>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {hasDraft ? (
              <>
                생성 시각 {formatDateTime(draft.generatedAt)}
                {draft.edited ? ' · 수정됨' : ''}
              </>
            ) : (
              '미생성'
            )}
          </span>
          <span className="flex items-center gap-2">
            {copyState === 'copied' ? <span className="text-success">복사되었습니다</span> : null}
            {copyState === 'failed' ? (
              <span className="text-danger">복사하지 못했습니다. 직접 선택해 복사해 주세요.</span>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleCopy()}
              disabled={!hasDraft || isLoading}
            >
              복사
            </Button>
            {/* 분석 전에는 호출해도 아무 일이 없으므로 눌리지 않게 막는다 (M-3) */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onRegenerate}
              disabled={!canRegenerate || isLoading}
              loading={isLoading}
            >
              다시 생성
            </Button>
          </span>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {isLoading ? (
          <div className="flex h-56 items-center justify-center gap-2 rounded-card border border-border-subtle bg-surface-muted text-sm text-ink-muted">
            <Spinner size="sm" label={`${spec.label} 초안 생성 중`} />
            <span>{LOADING_MESSAGE}</span>
          </div>
        ) : (
          <>
            {/* 카드 하나가 실패해도 다른 카드는 영향을 받지 않는다 (AC-3.10) */}
            {status === 'error' && error !== null ? (
              <ErrorNotice error={error} onRetry={onRegenerate} retryLabel="다시 생성" />
            ) : null}

            {hasDraft ? (
              <>
                <label className="sr-only" htmlFor={`draft-${platform}`}>
                  {spec.label} 초안 본문
                </label>
                <textarea
                  id={`draft-${platform}`}
                  value={value}
                  onChange={(event) => onEdit(event.target.value)}
                  spellCheck={false}
                  className="h-56 w-full resize-y rounded-card border border-border-subtle bg-surface p-3 font-mono text-sm leading-relaxed text-ink"
                />
                {validation.message !== null ? (
                  <p className="rounded-card border border-warn-border bg-warn-surface p-3 text-xs text-warn">
                    {validation.message}
                  </p>
                ) : null}
              </>
            ) : status === 'error' ? null : (
              <p className="flex h-56 items-center justify-center rounded-card border border-dashed border-border-subtle bg-surface-muted p-3 text-center text-sm text-ink-muted">
                {PLACEHOLDER}
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

export default DraftCard;
