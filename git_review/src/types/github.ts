/**
 * GitHub 도메인 타입 (TECH_SPEC §3.1)
 *
 * 이 파일의 어떤 타입도 access token 필드를 갖지 않는다.
 * 토큰은 서버의 암호화 세션(`src/lib/session.ts`) 안에만 존재한다.
 */

/** 로그인한 GitHub 사용자. 토큰은 절대 포함하지 않는다. */
export interface GitHubUser {
  login: string;
  name: string | null;
  avatarUrl: string;
}

/** 검증 대상 후보가 되는 저장소 요약 정보 */
export interface RepoSummary {
  id: number;
  owner: string; // 예: "dev-msj"
  name: string; // 예: "git_review"
  fullName: string; // 예: "dev-msj/git_review"
  defaultBranch: string; // 예: "main"
  isPrivate: boolean;
  htmlUrl: string;
  pushedAt: string; // ISO8601, 정렬 기준
}

/** 저장소 목록 한 페이지 */
export interface RepoPage {
  items: RepoSummary[];
  page: number;
  hasNext: boolean;
}

/** Git Trees API 엔트리 (필요한 필드만 축약) */
export interface TreeEntry {
  path: string; // 저장소 루트 기준 상대 경로 (선행 슬래시 없음)
  type: 'blob' | 'tree' | 'commit'; // commit = 서브모듈
}

/** 저장소 전체 파일 트리 (단일 요청 결과) */
export interface RepoTree {
  ref: string; // 조회에 사용한 기본 브랜치명
  entries: TreeEntry[];
  truncated: boolean; // GitHub이 응답을 잘랐는지 여부
  fileCount: number; // type === 'blob' 개수
}

/** GitHub 요청 한도 상태 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: string; // ISO8601
}
