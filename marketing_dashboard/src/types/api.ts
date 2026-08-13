import { z } from 'zod';
import {
  activitySummarySchema,
  analysisResultSchema,
  contentDraftSchema,
  periodDaysSchema,
  platformSchema,
  type ActivitySummary,
  type AnalysisResult,
  type ContentDraft,
  type PeriodDays,
  type Platform,
} from '@/types/domain';

/**
 * Route Handler 요청·응답 계약 + 세션/로컬 저장 타입 (TECH_SPEC 4. 데이터 모델).
 * 클라이언트 컴포넌트도 import 하므로 서버 전용 모듈을 참조하지 않는다.
 */

// ── 공통 ────────────────────────────────────────────────

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

export type ApiErrorCode =
  | 'UNAUTHORIZED' // 401 세션 없음
  | 'FORBIDDEN_USER' // 403 화이트리스트 미포함
  | 'INVALID_REQUEST' // 400 스키마/파라미터 오류
  | 'GITHUB_TOKEN_INVALID' // 401 GitHub 토큰 만료·무효 → 재로그인 유도
  | 'GITHUB_RATE_LIMIT' // 429 호출 한도 초과
  | 'GITHUB_ERROR' // 502 그 외 GitHub 실패
  | 'AI_TIMEOUT' // 504 Gemini 60초 초과
  | 'AI_ERROR' // 502 Gemini 실패·응답 파싱 실패
  | 'INTERNAL'; // 500

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  retryable: boolean;
}

export interface ApiErrorResponse {
  error: ApiError;
}

// ── 세션 ────────────────────────────────────────────────

export interface SessionUser {
  login: string; // GitHub 로그인 ID
  name: string | null; // 표시 이름
  avatarUrl: string; // 아바타 URL
}

export interface SessionData {
  accessToken: string; // GitHub OAuth access token (서버 전용)
  user: SessionUser;
  createdAt: number; // epoch ms
}

// ── GET /api/activity ───────────────────────────────────

/** `?period=7|30|90` — 쿼리 문자열을 숫자로 변환한 뒤 검증 */
export const activityQuerySchema = z.object({
  period: z.coerce.number().pipe(periodDaysSchema),
});
export type ActivityQuery = z.infer<typeof activityQuerySchema>;

export interface ActivityResponse {
  activity: ActivitySummary;
}

// ── POST /api/analyze ───────────────────────────────────

export const analyzeRequestSchema = z.object({ activity: activitySummarySchema });
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;

export interface AnalyzeResponse {
  analysis: AnalysisResult;
}

// ── POST /api/content ───────────────────────────────────

export const contentRequestSchema = z.object({
  platforms: z
    .array(platformSchema)
    .min(1)
    .max(3)
    .refine((values) => new Set(values).size === values.length, {
      message: '중복된 플랫폼이 포함되어 있습니다.',
    }),
  analysis: analysisResultSchema,
  activity: activitySummarySchema,
});
export type ContentRequest = z.infer<typeof contentRequestSchema>;

export interface ContentGenerationResult {
  platform: Platform;
  status: 'success' | 'error';
  draft?: ContentDraft;
  error?: ApiError; // 실패한 플랫폼만
}

export interface ContentResponse {
  results: ContentGenerationResult[];
}

// ── 로컬 스냅샷 (localStorage 단일 키, Q5) ────────────────

export const LOCAL_SNAPSHOT_VERSION = 1 as const;

export interface LocalSnapshot {
  version: 1; // 스키마 버전. 불일치 시 스냅샷 폐기
  savedAt: string; // ISO 8601
  login: string; // 저장 시점의 GitHub 로그인 ID. 불일치 시 폐기
  periodDays: PeriodDays; // 7 | 30 | 90
  activity: ActivitySummary | null;
  analysis: AnalysisResult | null;
  drafts: ContentDraft[]; // 사용자가 편집한 최신 본문 포함
}

/** 저장된 JSON 복원용 스키마. 실패하면 스냅샷을 폐기한다 */
export const localSnapshotSchema = z.object({
  version: z.literal(LOCAL_SNAPSHOT_VERSION),
  savedAt: z.string(),
  login: z.string(),
  periodDays: periodDaysSchema,
  activity: activitySummarySchema.nullable(),
  analysis: analysisResultSchema
    .extend({ generatedAt: z.string(), lowVolume: z.boolean() })
    .nullable(),
  drafts: z.array(contentDraftSchema),
});
