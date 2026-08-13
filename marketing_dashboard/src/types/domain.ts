import { z } from 'zod';

/**
 * 도메인 타입의 단일 출처.
 * zod 스키마를 정의하고 타입은 전부 `z.infer` 로 파생한다 (TECH_SPEC 4. 데이터 모델).
 */

// ── F1: 활동 ─────────────────────────────────────────────

export const periodDaysSchema = z.union([z.literal(7), z.literal(30), z.literal(90)]);
export type PeriodDays = z.infer<typeof periodDaysSchema>; // 7 | 30 | 90

export const commitActivitySchema = z.object({
  sha: z.string(),
  message: z.string(), // 첫 줄만 보관
  repo: z.string(), // "owner/name"
  occurredAt: z.string(), // ISO 8601
});
export type CommitActivity = z.infer<typeof commitActivitySchema>;

export const pullRequestActivitySchema = z.object({
  number: z.number(),
  title: z.string(),
  repo: z.string(),
  state: z.enum(['opened', 'merged', 'closed']), // AC-1.5: 생성/머지 구분
  url: z.string(),
  occurredAt: z.string(),
});
export type PullRequestActivity = z.infer<typeof pullRequestActivitySchema>;

export const issueActivitySchema = z.object({
  number: z.number(),
  title: z.string(),
  repo: z.string(),
  state: z.enum(['opened', 'closed']), // AC-1.5: 생성/종료 구분
  url: z.string(),
  occurredAt: z.string(),
});
export type IssueActivity = z.infer<typeof issueActivitySchema>;

export const starActivitySchema = z.object({ repo: z.string(), occurredAt: z.string() });
export type StarActivity = z.infer<typeof starActivitySchema>;

export const activityCountsSchema = z.object({
  commits: z.number(),
  pullRequests: z.object({
    total: z.number(),
    opened: z.number(),
    merged: z.number(),
    closed: z.number(),
  }),
  issues: z.object({ total: z.number(), opened: z.number(), closed: z.number() }),
  stars: z.number(),
});
export type ActivityCounts = z.infer<typeof activityCountsSchema>;

export const activitySummarySchema = z.object({
  period: z.object({ days: periodDaysSchema, from: z.string(), to: z.string() }),
  counts: activityCountsSchema,
  commits: z.array(commitActivitySchema),
  pullRequests: z.array(pullRequestActivitySchema),
  issues: z.array(issueActivitySchema),
  stars: z.array(starActivitySchema),
  repositories: z.array(z.string()), // 활동이 발생한 저장소 전체 목록 (AC-1.5 And, AC-3.8 대조 기준)
  totalCount: z.number(), // commits + PR + issues + stars 총합
  truncated: z.boolean(), // GitHub Events API 300건 상한 도달 여부 (C2)
});
export type ActivitySummary = z.infer<typeof activitySummarySchema>;

// ── F2: 분석 ─────────────────────────────────────────────

export const analysisHighlightSchema = z.object({
  title: z.string(), // 하이라이트 제목
  description: z.string(), // 1~2문장 설명
  evidence: z.array(z.string()).min(1), // 근거: 저장소명 또는 PR/이슈 제목 (AC-2.3)
});
export type AnalysisHighlight = z.infer<typeof analysisHighlightSchema>;

export const analysisResultSchema = z.object({
  periodSummary: z.string(), // 3~5문장 문단 (AC-2.2)
  highlights: z.array(analysisHighlightSchema).min(3).max(5),
  insights: z.array(z.string()).min(2), // 관찰 2개 이상 (AC-2.2)
});
export type AnalysisResult = z.infer<typeof analysisResultSchema> & {
  generatedAt: string; // 서버가 부여
  lowVolume: boolean; // totalCount < LOW_ACTIVITY_THRESHOLD (Q6)
};

// ── F3: 콘텐츠 ───────────────────────────────────────────

export const platformSchema = z.enum(['linkedin', 'x', 'blog']);
export type Platform = z.infer<typeof platformSchema>;

export const contentDraftSchema = z.object({
  platform: platformSchema,
  content: z.string(), // 마크다운(blog) 또는 플레인 텍스트
  generatedAt: z.string(),
  edited: z.boolean(), // 사용자가 수정했는지 (AC-3.5, AC-3.9 복원 시 유지)
});
export type ContentDraft = z.infer<typeof contentDraftSchema>;

export interface DraftValidation {
  charCount: number; // Array.from(content).length — 공백 포함
  withinLimit: boolean; // 플랫폼별 분량 기준 충족 여부
  message: string | null; // 위반 시 사용자 경고 문구
  unknownRepos: string[]; // 활동 데이터에 없는 저장소명 (AC-3.8)
}
