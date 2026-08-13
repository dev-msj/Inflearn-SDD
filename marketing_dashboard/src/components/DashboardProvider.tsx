'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { DEFAULT_PERIOD_DAYS, PLATFORM_ORDER } from '@/lib/constants';
import { clearSnapshot, loadSnapshot, saveSnapshot } from '@/lib/local-store';
import type { ApiError, AsyncStatus, SessionUser } from '@/types/api';
import type {
  ActivitySummary,
  AnalysisResult,
  ContentDraft,
  PeriodDays,
  Platform,
} from '@/types/domain';

/**
 * 전 기능이 공유하는 전역 상태 컨테이너 (TECH_SPEC 3. 기능 1 > 1-C).
 *
 * feature 훅(useActivity/useAnalysis/useContent)을 import 하지 않는 **순수 상태 컨테이너**다.
 * 훅들이 이 컨텍스트를 소비한다.
 */

const SAVE_DEBOUNCE_MS = 300;

export interface DashboardState {
  user: SessionUser;
  periodDays: PeriodDays; // 기본 7 (AC-1.4)
  activity: ActivitySummary | null;
  activityStatus: AsyncStatus;
  activityError: ApiError | null;
  analysis: AnalysisResult | null;
  analysisStatus: AsyncStatus;
  analysisError: ApiError | null;
  drafts: ContentDraft[]; // 사용자가 편집한 최신 본문 유지
  draftStatus: Record<Platform, AsyncStatus>;
  draftErrors: Record<Platform, ApiError | null>;
  restored: boolean; // localStorage 복원 완료 여부
  /**
   * 요청 세대. `setPeriod`·`resetAll` 처럼 **기존 결과를 무효화하는 조작**마다 증가한다.
   * 훅은 요청 시작 시점의 값을 캡처해 응답 반영 직전에 대조하고, 다르면 응답을 폐기한다.
   * (진행 중이던 이전 기간의 분석·초안이 뒤늦게 되살아나는 것을 막는다)
   */
  requestGeneration: number;
}

export interface DashboardActions {
  setPeriod(days: PeriodDays): void; // 변경 시 analysis·drafts 초기화 (AC-2.8)
  setActivity(activity: ActivitySummary | null): void;
  setActivityStatus(status: AsyncStatus): void;
  setActivityError(error: ApiError | null): void;
  setAnalysis(analysis: AnalysisResult | null): void;
  setAnalysisStatus(status: AsyncStatus): void;
  setAnalysisError(error: ApiError | null): void;
  setDraft(platform: Platform, draft: ContentDraft): void;
  updateDraftContent(platform: Platform, content: string): void; // AC-3.5
  setDraftStatus(platform: Platform, status: AsyncStatus): void;
  setDraftError(platform: Platform, error: ApiError | null): void;
  resetAll(): void; // 화면 상태 + 로컬 스냅샷 삭제 (AC-3.9)
  /**
   * 현재 요청 세대를 **호출 시점 값으로** 반환한다.
   * 클로저에 캡처된 상태값은 오래될 수 있으므로 비동기 응답 대조에는 이 함수를 쓴다.
   */
  getRequestGeneration(): number;
}

export type DashboardContextValue = DashboardState & DashboardActions;

// ── 리듀서 ───────────────────────────────────────────────

type Action =
  | { type: 'restore'; payload: RestorePayload | null }
  | { type: 'setPeriod'; days: PeriodDays; generation: number }
  | { type: 'setActivity'; activity: ActivitySummary | null }
  | { type: 'setActivityStatus'; status: AsyncStatus }
  | { type: 'setActivityError'; error: ApiError | null }
  | { type: 'setAnalysis'; analysis: AnalysisResult | null }
  | { type: 'setAnalysisStatus'; status: AsyncStatus }
  | { type: 'setAnalysisError'; error: ApiError | null }
  | { type: 'setDraft'; platform: Platform; draft: ContentDraft }
  | { type: 'updateDraftContent'; platform: Platform; content: string }
  | { type: 'setDraftStatus'; platform: Platform; status: AsyncStatus }
  | { type: 'setDraftError'; platform: Platform; error: ApiError | null }
  | { type: 'resetAll'; generation: number };

interface RestorePayload {
  periodDays: PeriodDays;
  activity: ActivitySummary | null;
  analysis: AnalysisResult | null;
  drafts: ContentDraft[];
}

const IDLE_DRAFT_STATUS: Record<Platform, AsyncStatus> = {
  linkedin: 'idle',
  x: 'idle',
  blog: 'idle',
};

const EMPTY_DRAFT_ERRORS: Record<Platform, ApiError | null> = {
  linkedin: null,
  x: null,
  blog: null,
};

function createInitialState(user: SessionUser): DashboardState {
  return {
    user,
    periodDays: DEFAULT_PERIOD_DAYS,
    activity: null,
    activityStatus: 'idle',
    activityError: null,
    analysis: null,
    analysisStatus: 'idle',
    analysisError: null,
    drafts: [],
    draftStatus: { ...IDLE_DRAFT_STATUS },
    draftErrors: { ...EMPTY_DRAFT_ERRORS },
    restored: false,
    requestGeneration: 0,
  };
}

/** 플랫폼 표시 순서를 유지하며 초안을 교체·추가한다 */
function upsertDraft(drafts: ContentDraft[], draft: ContentDraft): ContentDraft[] {
  const next = drafts.some((item) => item.platform === draft.platform)
    ? drafts.map((item) => (item.platform === draft.platform ? draft : item))
    : [...drafts, draft];

  return [...next].sort(
    (a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform),
  );
}

function reducer(state: DashboardState, action: Action): DashboardState {
  switch (action.type) {
    case 'restore': {
      if (action.payload === null) return { ...state, restored: true };
      return {
        ...state,
        periodDays: action.payload.periodDays,
        activity: action.payload.activity,
        activityStatus: action.payload.activity === null ? 'idle' : 'success',
        analysis: action.payload.analysis,
        analysisStatus: action.payload.analysis === null ? 'idle' : 'success',
        drafts: action.payload.drafts,
        draftStatus: action.payload.drafts.reduce<Record<Platform, AsyncStatus>>(
          (acc, draft) => ({ ...acc, [draft.platform]: 'success' }),
          { ...IDLE_DRAFT_STATUS },
        ),
        restored: true,
      };
    }

    case 'setPeriod': {
      if (action.days === state.periodDays) return state;
      // 기간이 바뀌면 이전 분석·초안은 더 이상 유효하지 않다 (AC-2.8)
      return {
        ...state,
        periodDays: action.days,
        analysis: null,
        analysisStatus: 'idle',
        analysisError: null,
        drafts: [],
        draftStatus: { ...IDLE_DRAFT_STATUS },
        draftErrors: { ...EMPTY_DRAFT_ERRORS },
        // 진행 중이던 분석·생성 응답을 폐기시킨다 (H-1)
        requestGeneration: action.generation,
      };
    }

    case 'setActivity':
      return { ...state, activity: action.activity };

    case 'setActivityStatus':
      return { ...state, activityStatus: action.status };

    case 'setActivityError':
      return { ...state, activityError: action.error };

    case 'setAnalysis':
      return { ...state, analysis: action.analysis };

    case 'setAnalysisStatus':
      return { ...state, analysisStatus: action.status };

    case 'setAnalysisError':
      return { ...state, analysisError: action.error };

    case 'setDraft':
      return { ...state, drafts: upsertDraft(state.drafts, action.draft) };

    case 'updateDraftContent':
      return {
        ...state,
        drafts: state.drafts.map((draft) =>
          draft.platform === action.platform
            ? { ...draft, content: action.content, edited: true }
            : draft,
        ),
      };

    case 'setDraftStatus':
      return {
        ...state,
        draftStatus: { ...state.draftStatus, [action.platform]: action.status },
      };

    case 'setDraftError':
      return {
        ...state,
        draftErrors: { ...state.draftErrors, [action.platform]: action.error },
      };

    case 'resetAll':
      return {
        ...createInitialState(state.user),
        restored: true,
        // 진행 중이던 요청의 응답이 초기화 직후 되살아나지 않게 한다 (H-1)
        requestGeneration: action.generation,
      };

    default:
      return state;
  }
}

// ── 컨텍스트 ─────────────────────────────────────────────

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ user, children }: { user: SessionUser; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, user, createInitialState);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 세대 값의 단일 출처. 리듀서 상태는 이 값을 그대로 미러링하므로 둘이 어긋나지 않는다
  const generationRef = useRef(0);

  // 마운트 시 스냅샷 복원 (AC-3.9)
  useEffect(() => {
    const snapshot = loadSnapshot(user.login);
    dispatch({
      type: 'restore',
      payload:
        snapshot === null
          ? null
          : {
              periodDays: snapshot.periodDays,
              activity: snapshot.activity,
              analysis: snapshot.analysis,
              drafts: snapshot.drafts,
            },
    });
  }, [user.login]);

  // 상태 변경 시 300ms 디바운스로 스냅샷 저장 (Q5)
  useEffect(() => {
    if (!state.restored) return;

    if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      const isEmpty =
        state.activity === null && state.analysis === null && state.drafts.length === 0;

      if (isEmpty) {
        // 초기화·로그아웃 직후 빈 스냅샷을 남기지 않는다 (AC-1.9, AC-3.9)
        clearSnapshot();
        return;
      }

      saveSnapshot({
        login: state.user.login,
        periodDays: state.periodDays,
        activity: state.activity,
        analysis: state.analysis,
        drafts: state.drafts,
      });
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);
    };
  }, [
    state.restored,
    state.user.login,
    state.periodDays,
    state.activity,
    state.analysis,
    state.drafts,
  ]);

  const setPeriod = useCallback(
    (days: PeriodDays) => {
      // 같은 기간을 다시 눌렀을 때는 진행 중인 요청을 취소하지 않는다
      if (days === state.periodDays) return;
      generationRef.current += 1;
      dispatch({ type: 'setPeriod', days, generation: generationRef.current });
    },
    [state.periodDays],
  );

  const setActivity = useCallback(
    (activity: ActivitySummary | null) => dispatch({ type: 'setActivity', activity }),
    [],
  );

  const setActivityStatus = useCallback(
    (status: AsyncStatus) => dispatch({ type: 'setActivityStatus', status }),
    [],
  );

  const setActivityError = useCallback(
    (error: ApiError | null) => dispatch({ type: 'setActivityError', error }),
    [],
  );

  const setAnalysis = useCallback(
    (analysis: AnalysisResult | null) => dispatch({ type: 'setAnalysis', analysis }),
    [],
  );

  const setAnalysisStatus = useCallback(
    (status: AsyncStatus) => dispatch({ type: 'setAnalysisStatus', status }),
    [],
  );

  const setAnalysisError = useCallback(
    (error: ApiError | null) => dispatch({ type: 'setAnalysisError', error }),
    [],
  );

  const setDraft = useCallback(
    (platform: Platform, draft: ContentDraft) => dispatch({ type: 'setDraft', platform, draft }),
    [],
  );

  const updateDraftContent = useCallback(
    (platform: Platform, content: string) =>
      dispatch({ type: 'updateDraftContent', platform, content }),
    [],
  );

  const setDraftStatus = useCallback(
    (platform: Platform, status: AsyncStatus) =>
      dispatch({ type: 'setDraftStatus', platform, status }),
    [],
  );

  const setDraftError = useCallback(
    (platform: Platform, error: ApiError | null) =>
      dispatch({ type: 'setDraftError', platform, error }),
    [],
  );

  /** 대기 중인 디바운스 저장을 취소하고 스냅샷을 지운다 — 타이머가 뒤늦게 되살리지 못하게 한다 (M-2) */
  const discardSnapshot = useCallback(() => {
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    clearSnapshot();
  }, []);

  const resetAll = useCallback(() => {
    discardSnapshot();
    generationRef.current += 1;
    dispatch({ type: 'resetAll', generation: generationRef.current });
  }, [discardSnapshot]);

  const getRequestGeneration = useCallback(() => generationRef.current, []);

  const value = useMemo<DashboardContextValue>(
    () => ({
      ...state,
      setPeriod,
      setActivity,
      setActivityStatus,
      setActivityError,
      setAnalysis,
      setAnalysisStatus,
      setAnalysisError,
      setDraft,
      updateDraftContent,
      setDraftStatus,
      setDraftError,
      resetAll,
      getRequestGeneration,
    }),
    [
      state,
      setPeriod,
      setActivity,
      setActivityStatus,
      setActivityError,
      setAnalysis,
      setAnalysisStatus,
      setAnalysisError,
      setDraft,
      updateDraftContent,
      setDraftStatus,
      setDraftError,
      resetAll,
      getRequestGeneration,
    ],
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): DashboardContextValue {
  const context = useContext(DashboardContext);
  if (context === null) {
    throw new Error('useDashboard 는 DashboardProvider 내부에서만 사용할 수 있습니다.');
  }
  return context;
}
