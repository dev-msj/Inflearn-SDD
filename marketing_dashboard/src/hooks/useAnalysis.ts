'use client';

import { useCallback, useRef } from 'react';
import { useDashboard } from '@/components/DashboardProvider';
import { toApiError } from '@/lib/api-error';
import type { AnalyzeResponse, ApiError, ApiErrorResponse, AsyncStatus } from '@/types/api';
import type { AnalysisResult } from '@/types/domain';

/**
 * `POST /api/analyze` 호출·상태 전이 훅 (TECH_SPEC 3. 기능 2 > 2-E).
 *
 * - 실행 전 이전 분석 결과를 비워 새 결과로 교체한다 (AC-2.8).
 * - 실패해도 `setActivity` 를 호출하지 않아 활동 요약은 그대로 유지된다 (AC-2.6).
 * - 자동 실행하지 않는다. 분석과 콘텐츠 생성은 별도 2단계 액션이다 (Q3).
 */

export interface UseAnalysisResult {
  analysis: AnalysisResult | null;
  status: AsyncStatus;
  error: ApiError | null;
  /** 컨텍스트의 `activity` 를 본문으로 분석을 실행한다 */
  runAnalysis(): Promise<void>;
}

export function useAnalysis(): UseAnalysisResult {
  const {
    activity,
    analysis,
    analysisStatus,
    analysisError,
    setAnalysis,
    setAnalysisStatus,
    setAnalysisError,
    getRequestGeneration,
  } = useDashboard();

  // 연속 실행 시 늦게 도착한 응답이 최신 결과를 덮어쓰지 않게 한다
  const requestIdRef = useRef(0);

  const runAnalysis = useCallback(async (): Promise<void> => {
    if (activity === null || activity.totalCount === 0) return;

    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    // 기간 변경·초기화로 이 요청이 무효화됐는지 판정하기 위한 기준값 (H-1)
    const generation = getRequestGeneration();

    /** 이 호출이 여전히 최신이고, 그 사이 상태가 초기화되지 않았을 때만 반영한다 */
    const isCurrent = (): boolean =>
      requestId === requestIdRef.current && generation === getRequestGeneration();

    setAnalysisError(null);
    setAnalysis(null); // 이전 결과를 교체한다 (AC-2.8)
    setAnalysisStatus('loading');

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ activity }),
      });

      if (!isCurrent()) return;

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiErrorResponse | null;
        if (!isCurrent()) return;

        // 활동 상태는 건드리지 않는다 (AC-2.6)
        setAnalysisError(body?.error ?? toApiError('INTERNAL'));
        setAnalysisStatus('error');
        return;
      }

      const body = (await response.json()) as AnalyzeResponse;
      if (!isCurrent()) return;

      setAnalysis(body.analysis);
      setAnalysisStatus('success');
    } catch {
      // 네트워크 단절 등 fetch 자체 실패
      if (!isCurrent()) return;

      setAnalysisError(toApiError('INTERNAL'));
      setAnalysisStatus('error');
    }
  }, [activity, getRequestGeneration, setAnalysis, setAnalysisError, setAnalysisStatus]);

  return {
    analysis,
    status: analysisStatus,
    error: analysisError,
    runAnalysis,
  };
}

export default useAnalysis;
