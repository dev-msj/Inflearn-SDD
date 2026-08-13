'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useDashboard } from '@/components/DashboardProvider';
import { toApiError } from '@/lib/api-error';
import type { ActivityResponse, ApiError, ApiErrorResponse, AsyncStatus } from '@/types/api';
import type { ActivitySummary, PeriodDays } from '@/types/domain';

/**
 * `GET /api/activity` 호출·상태 전이 훅 (TECH_SPEC 3. 기능 1 > 1-C).
 *
 * 상태는 `DashboardProvider` 가 보유하고 이 훅은 소비·갱신만 한다.
 * `periodDays` 변경 또는 스냅샷 복원 완료 직후 자동 호출하되,
 * 복원된 스냅샷에 **동일 기간** 활동이 있으면 재호출을 생략한다 (AC-1.4, AC-3.9).
 */

export interface UseActivityResult {
  activity: ActivitySummary | null;
  status: AsyncStatus;
  error: ApiError | null;
  /** 현재 `periodDays` 로 다시 조회 (AC-1.8 재시도) */
  refresh(): Promise<void>;
}

export function useActivity(): UseActivityResult {
  const {
    activity,
    activityStatus,
    activityError,
    periodDays,
    restored,
    requestGeneration,
    setActivity,
    setActivityStatus,
    setActivityError,
    getRequestGeneration,
  } = useDashboard();

  // 기간을 빠르게 바꿨을 때 늦게 도착한 응답이 최신 결과를 덮어쓰지 않게 한다
  const requestIdRef = useRef(0);
  // 이미 조회를 시작한 기간. 자동 조회의 중복 실행을 막는다
  const loadedPeriodRef = useRef<PeriodDays | null>(null);

  const load = useCallback(
    async (days: PeriodDays): Promise<void> => {
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;
      // 기간 변경·초기화로 이 요청이 무효화됐는지 판정하기 위한 기준값 (H-1)
      const generation = getRequestGeneration();

      /** 이 호출이 여전히 최신이고, 그 사이 상태가 초기화되지 않았을 때만 반영한다 */
      const isCurrent = (): boolean =>
        requestId === requestIdRef.current && generation === getRequestGeneration();

      setActivityError(null);
      setActivityStatus('loading');

      try {
        const response = await fetch(`/api/activity?period=${days}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });

        if (!isCurrent()) return;

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as ApiErrorResponse | null;
          if (!isCurrent()) return;

          setActivity(null);
          setActivityError(body?.error ?? toApiError('INTERNAL'));
          setActivityStatus('error');
          return;
        }

        const body = (await response.json()) as ActivityResponse;
        if (!isCurrent()) return;

        setActivity(body.activity);
        setActivityStatus('success');
      } catch {
        // 네트워크 단절 등 fetch 자체 실패
        if (!isCurrent()) return;

        setActivityError(toApiError('INTERNAL'));
        setActivityStatus('error');
      }
    },
    [getRequestGeneration, setActivity, setActivityError, setActivityStatus],
  );

  // 기간 변경·초기화(세대 증가)로 기존 결과가 폐기되면 자동 조회를 다시 허용한다.
  // 이 초기화가 없으면 "초기화" 직후 화면이 빈 채로 멈춘다 (아래 조회 이펙트보다 먼저 실행돼야 한다)
  useEffect(() => {
    loadedPeriodRef.current = null;
  }, [requestGeneration]);

  useEffect(() => {
    // 스냅샷 복원 전에는 조회하지 않는다 (복원 결과를 덮어쓰지 않기 위해)
    if (!restored) return;
    if (loadedPeriodRef.current === periodDays) return;

    if (activity !== null && activity.period.days === periodDays) {
      loadedPeriodRef.current = periodDays;
      return;
    }

    loadedPeriodRef.current = periodDays;
    void load(periodDays);
  }, [restored, periodDays, activity, load]);

  const refresh = useCallback(async (): Promise<void> => {
    loadedPeriodRef.current = periodDays;
    await load(periodDays);
  }, [load, periodDays]);

  return {
    activity,
    status: activityStatus,
    error: activityError,
    refresh,
  };
}

export default useActivity;
