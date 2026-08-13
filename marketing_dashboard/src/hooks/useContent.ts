'use client';

import { useCallback, useRef } from 'react';
import { useDashboard } from '@/components/DashboardProvider';
import { toApiError } from '@/lib/api-error';
import { PLATFORM_ORDER } from '@/lib/constants';
import type { ApiError, ApiErrorResponse, AsyncStatus, ContentResponse } from '@/types/api';
import type { ContentDraft, Platform } from '@/types/domain';

/**
 * `POST /api/content` 호출·상태 전이 훅 (TECH_SPEC 3. 기능 3 > 3-E).
 *
 * - 상태·오류는 **플랫폼 키 단위**로 관리한다. 한 플랫폼의 실패가 다른 카드에 번지지 않는다 (AC-3.10).
 * - `regenerate` 는 대상 플랫폼의 상태·본문만 교체하므로 다른 플랫폼의 사용자 편집분은 유지된다 (AC-3.7).
 * - 자동 실행하지 않는다. 분석과 콘텐츠 생성은 별도 2단계 액션이다 (Q3).
 */

export interface UseContentResult {
  drafts: ContentDraft[];
  statusOf(platform: Platform): AsyncStatus;
  errorOf(platform: Platform): ApiError | null;
  /** 3개 플랫폼을 1회 호출로 동시 생성 (AC-3.2) */
  generateAll(): Promise<void>;
  /** 대상 플랫폼만 단건 재생성 (AC-3.7) */
  regenerate(platform: Platform): Promise<void>;
  /** 초안 본문 수정 — `edited=true` 로 표시된다 (AC-3.5) */
  editDraft(platform: Platform, content: string): void;
  isBusy: boolean;
}

const IDLE_REQUEST_IDS: Record<Platform, number> = { linkedin: 0, x: 0, blog: 0 };

export function useContent(): UseContentResult {
  const {
    activity,
    analysis,
    drafts,
    draftStatus,
    draftErrors,
    setDraft,
    setDraftStatus,
    setDraftError,
    updateDraftContent,
    getRequestGeneration,
  } = useDashboard();

  // 전체 생성과 단건 재생성이 겹쳤을 때 늦게 도착한 응답이 최신 결과를 덮어쓰지 않게 한다
  const requestIdsRef = useRef<Record<Platform, number>>({ ...IDLE_REQUEST_IDS });

  const run = useCallback(
    async (platforms: readonly Platform[]): Promise<void> => {
      // 분석 결과가 없으면 애초에 호출하지 않는다 (AC-3.1)
      if (analysis === null || activity === null || platforms.length === 0) return;

      // 기간 변경·초기화로 이 요청이 무효화됐는지 판정하기 위한 기준값 (H-1)
      const generation = getRequestGeneration();

      const requestIds = new Map<Platform, number>();
      for (const platform of platforms) {
        requestIdsRef.current[platform] += 1;
        requestIds.set(platform, requestIdsRef.current[platform]);
        setDraftError(platform, null);
        setDraftStatus(platform, 'loading');
      }

      /**
       * 이 호출이 해당 플랫폼의 최신 요청이고, 그 사이 기간 변경·초기화가 없었을 때만 반영한다.
       * (초기화 직후 응답이 도착해 초안이 되살아나는 것을 막는다)
       */
      const isCurrent = (platform: Platform): boolean =>
        requestIds.get(platform) === requestIdsRef.current[platform] &&
        generation === getRequestGeneration();

      const failAll = (error: ApiError): void => {
        for (const platform of platforms) {
          if (!isCurrent(platform)) continue;
          setDraftError(platform, error);
          setDraftStatus(platform, 'error');
        }
      };

      try {
        const response = await fetch('/api/content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({ platforms, analysis, activity }),
        });

        if (!response.ok) {
          // 인증·스키마 실패만 4xx 로 온다. 개별 실패는 200 본문에 담긴다
          const body = (await response.json().catch(() => null)) as ApiErrorResponse | null;
          failAll(body?.error ?? toApiError('INTERNAL'));
          return;
        }

        const body = (await response.json()) as ContentResponse;

        for (const platform of platforms) {
          if (!isCurrent(platform)) continue;

          const result = body.results.find((item) => item.platform === platform);

          if (result === undefined || result.status === 'error' || result.draft === undefined) {
            setDraftError(platform, result?.error ?? toApiError('AI_ERROR'));
            setDraftStatus(platform, 'error');
            continue;
          }

          setDraftError(platform, null);
          setDraft(platform, result.draft);
          setDraftStatus(platform, 'success');
        }
      } catch {
        // 네트워크 단절 등 fetch 자체 실패
        failAll(toApiError('INTERNAL'));
      }
    },
    [activity, analysis, getRequestGeneration, setDraft, setDraftError, setDraftStatus],
  );

  const generateAll = useCallback(async (): Promise<void> => {
    await run(PLATFORM_ORDER);
  }, [run]);

  const regenerate = useCallback(
    async (platform: Platform): Promise<void> => {
      await run([platform]);
    },
    [run],
  );

  const statusOf = useCallback(
    (platform: Platform): AsyncStatus => draftStatus[platform],
    [draftStatus],
  );

  const errorOf = useCallback(
    (platform: Platform): ApiError | null => draftErrors[platform],
    [draftErrors],
  );

  const editDraft = useCallback(
    (platform: Platform, content: string) => updateDraftContent(platform, content),
    [updateDraftContent],
  );

  return {
    drafts,
    statusOf,
    errorOf,
    generateAll,
    regenerate,
    editDraft,
    isBusy: PLATFORM_ORDER.some((platform) => draftStatus[platform] === 'loading'),
  };
}

export default useContent;
