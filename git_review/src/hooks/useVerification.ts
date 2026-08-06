'use client';

/**
 * /api/verify NDJSON 스트림 소비 · 진행률/리포트 상태 (TECH_SPEC §4 기능3-6)
 *
 * 담당 PRD 수용 기준
 *  - 3-1 ~ 3-3: 서버가 계산한 항목·준수율을 리포트로 받아 필터와 함께 화면에 전달한다.
 *  - 3-4: progress 이벤트로 "확인 완료 n / 전체 N"을 갱신한다.
 *  - 3-7 (에러): report는 done 이벤트를 받았을 때만 교체한다.
 *    error 이벤트·네트워크 예외 시에는 error만 세팅하고 직전 리포트를 그대로 유지한다.
 *
 * 요청 본문에는 경로 문자열만 담는다. 업로드 문서 원문은 서버로 전송하지 않는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { type AppError, toAppError } from '@/lib/errors';
import { readNdjsonStream } from '@/lib/ndjson';
import { createClientError, useAppApi, useAppDispatch, useAppState } from '@/state/AppStateProvider';
import type { VerifyRequest } from '@/types/api';
import type { VerificationItem, VerificationReport, VerifyEvent } from '@/types/verification';

export const VERIFY_ENDPOINT = '/api/verify';

export type VerificationStatus = 'idle' | 'running' | 'done' | 'error';
export type VerificationFilter = 'all' | 'missing';

export interface VerificationProgress {
  checked: number;
  total: number;
}

export interface UseVerificationResult {
  status: VerificationStatus;
  progress: VerificationProgress;
  phaseMessage: string;
  /** 성공 시에만 교체되는 리포트 */
  report: VerificationReport | null;
  error: AppError | null;
  filter: VerificationFilter;
  setFilter(next: VerificationFilter): void;
  /** filter 적용 결과 */
  visibleItems: VerificationItem[];
  run(): Promise<void>;
  retry(): Promise<void>;
}

const START_PHASE_MESSAGE = '검증을 시작합니다';
const STREAM_INCOMPLETE_MESSAGE = '검증 결과를 끝까지 받지 못했습니다';

export function useVerification(): UseVerificationResult {
  const { selectedRepo, artifacts, report } = useAppState();
  const dispatch = useAppDispatch();
  const api = useAppApi();

  const [status, setStatus] = useState<VerificationStatus>('idle');
  const [progress, setProgress] = useState<VerificationProgress>({ checked: 0, total: 0 });
  const [phaseMessage, setPhaseMessage] = useState('');
  const [error, setError] = useState<AppError | null>(null);
  const [filter, setFilter] = useState<VerificationFilter>('all');

  const abortRef = useRef<AbortController | null>(null);

  // 화면을 떠나면 진행 중인 스트림을 중단한다. (불필요한 GitHub 요청 유지 방지)
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const run = useCallback(async (): Promise<void> => {
    if (selectedRepo === null || artifacts.length === 0) {
      setError(createClientError('INVALID_REQUEST'));
      setStatus('error');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const requestBody: VerifyRequest = {
      repo: {
        owner: selectedRepo.owner,
        name: selectedRepo.name,
        defaultBranch: selectedRepo.defaultBranch,
      },
      artifacts: artifacts.map((artifact) => ({
        id: artifact.id,
        path: artifact.path,
        kind: artifact.kind,
      })),
    };

    setStatus('running');
    setError(null);
    setPhaseMessage(START_PHASE_MESSAGE);
    setProgress({ checked: 0, total: artifacts.length });

    try {
      const response = await api.request(VERIFY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (response.body === null) {
        throw createClientError('NETWORK_ERROR');
      }

      let streamError: AppError | null = null;
      let isCompleted = false;

      for await (const event of readNdjsonStream<VerifyEvent>(response.body)) {
        switch (event.type) {
          case 'phase':
            setPhaseMessage(event.message);
            break;
          case 'progress':
            setProgress({ checked: event.checked, total: event.total });
            break;
          case 'item':
            // 진행 상황 보조 신호. 항목 목록은 done 리포트로만 교체한다.
            setProgress((current) => ({
              checked: Math.min(current.checked + 1, current.total),
              total: current.total,
            }));
            break;
          case 'done':
            isCompleted = true;
            dispatch({ type: 'SET_REPORT', report: event.report });
            setProgress({ checked: event.report.items.length, total: event.report.items.length });
            break;
          case 'error':
            streamError = createClientError(event.code, event.message);
            // 스트림 도중 인증이 끊긴 경우(토큰 폐기 등)도 화면 전체를 초기화한다. (수용 기준 1-7)
            if (event.code === 'UNAUTHENTICATED' || event.code === 'SESSION_EXPIRED') {
              dispatch({ type: 'RESET_ALL' });
            }
            break;
          default:
            break;
        }
      }

      if (streamError !== null) {
        // 직전 리포트는 그대로 둔다. (수용 기준 3-7)
        setError(streamError);
        setStatus('error');
        return;
      }

      if (!isCompleted) {
        setError(createClientError('NETWORK_ERROR', STREAM_INCOMPLETE_MESSAGE));
        setStatus('error');
        return;
      }

      setPhaseMessage('');
      setStatus('done');
    } catch (caught) {
      if (controller.signal.aborted) return;
      // 스트림 소비 중 연결이 끊기면 api.request의 정규화 범위 밖에서 원시 예외가 올라온다.
      // AppError로 변환해야 화면이 원인별 안내와 재시도 수단을 표시할 수 있다. (수용 기준 3-7)
      setError(toAppError(caught));
      setStatus('error');
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [api, artifacts, dispatch, selectedRepo]);

  const retry = useCallback((): Promise<void> => run(), [run]);

  const visibleItems = useMemo(() => {
    const items = report?.items ?? [];
    return filter === 'missing' ? items.filter((item) => item.status === 'missing') : items;
  }, [filter, report]);

  return {
    status,
    progress,
    phaseMessage,
    report,
    error,
    filter,
    setFilter,
    visibleItems,
    run,
    retry,
  };
}
