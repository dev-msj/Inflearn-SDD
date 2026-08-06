/**
 * API 요청/응답 스키마 타입 (TECH_SPEC §5)
 *
 * 응답 타입에는 access token이 존재하지 않는다.
 * 세션 응답은 GitHubUser만 노출한다. (TECH_SPEC §5 보안 규칙 1항)
 */
import type { AppErrorCode } from '@/lib/errors';
import type { ArtifactKind } from '@/types/artifact';
import type { GitHubUser, RateLimitInfo, RepoPage } from '@/types/github';

/** 모든 실패 응답의 공통 스키마 */
export interface ApiErrorBody {
  error: { code: AppErrorCode; message: string; retryable: boolean };
}

/** GET /api/session */
export interface SessionResponse {
  authenticated: boolean;
  user: GitHubUser | null;
}

/** POST /api/auth/logout */
export interface LogoutResponse {
  ok: true;
}

/** GET /api/repos 쿼리 파라미터 */
export interface ReposQuery {
  page: number; // 기본 1
  perPage: number; // 기본 50, 최대 100
}

/** GET /api/repos 응답 */
export interface ReposResponse {
  page: RepoPage;
  rateLimit: RateLimitInfo;
}

/** POST /api/verify 요청 본문의 저장소 식별 정보 */
export interface VerifyRequestRepo {
  owner: string;
  name: string;
  defaultBranch: string;
}

/** POST /api/verify 요청 본문의 산출물 1건 (문서 원문은 전송하지 않는다) */
export interface VerifyRequestArtifact {
  id: string;
  path: string;
  kind: ArtifactKind;
}

/** POST /api/verify 요청 본문 */
export interface VerifyRequest {
  repo: VerifyRequestRepo;
  artifacts: VerifyRequestArtifact[];
  // 문서 원문은 전송하지 않는다. (보안 요구: 업로드 문서가 서버로 나가지 않음)
}
