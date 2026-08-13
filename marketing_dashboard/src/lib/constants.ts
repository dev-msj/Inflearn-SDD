import type { PeriodDays, Platform } from '@/types/domain';

/** 기간 선택 옵션 (AC-1.4) */
export const PERIOD_OPTIONS: readonly PeriodDays[] = [7, 30, 90] as const;

/** 기본 선택 기간 (AC-1.4) */
export const DEFAULT_PERIOD_DAYS: PeriodDays = 7;

/**
 * AI 프롬프트 투입 데이터 상한 (Q2).
 * 커밋만 최신순 100건으로 자르고 PR·이슈는 전체, 스타는 저장소명만 넣는다.
 */
export const AI_INPUT_LIMITS = {
  maxCommits: 100,
} as const;

/** 플랫폼 규격 (AC-3.3 표와 1:1) */
export const PLATFORM_SPECS = {
  linkedin: { label: 'LinkedIn', min: 600, max: 1300, hashtags: '3~5개' },
  x: { label: 'X', min: 0, max: 280, hashtags: '1~2개' },
  blog: { label: '블로그', min: 800, max: null, hashtags: null },
} as const;

/** 화면 표시 순서 (AC-3.2: 3개 카드 동시 노출) */
export const PLATFORM_ORDER: readonly Platform[] = ['linkedin', 'x', 'blog'] as const;

/** 블로그 초안이 갖춰야 할 최소 소제목 수 (Q4, AC-3.3) */
export const BLOG_MIN_HEADINGS = 2;

/** Gemini 호출 타임아웃 (AC-2.5) */
export const ANALYSIS_TIMEOUT_MS = 60_000;
export const CONTENT_TIMEOUT_MS = 60_000;

/** localStorage 단일 키. 새 스냅샷 저장 시 항상 덮어쓴다 (Q5) */
export const LOCAL_STORE_KEY = 'marketing-dashboard:snapshot:v1';

/** 스냅샷 직렬화 상한 (512KB). 초과 시 커밋을 잘라 재시도 (Q5) */
export const MAX_SNAPSHOT_BYTES = 512 * 1024;

/** 스냅샷 용량 초과 시 커밋 배열을 잘라낼 건수 (Q5) */
export const SNAPSHOT_COMMIT_FALLBACK_LIMIT = 100;

/** 활동 총건수가 이 값 미만이면 초안 품질 안내를 표시 (Q6) */
export const LOW_ACTIVITY_THRESHOLD = 5;

/** GitHub 공개 이벤트 수집 상한 (C2: Events API 300건) */
export const GITHUB_EVENTS_PER_PAGE = 100;
export const GITHUB_EVENTS_MAX_PAGES = 3;
