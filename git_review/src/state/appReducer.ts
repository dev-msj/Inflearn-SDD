/**
 * 세션 스코프 전역 상태의 액션 정의와 상태 전이 (TECH_SPEC §2 state/appReducer.ts)
 *
 * 이 상태는 React 메모리에만 존재한다.
 * localStorage / sessionStorage / indexedDB / 서버 전송 어디에도 기록하지 않는다.
 * (PRD 보안 요구 2항, TECH_SPEC §7.2)
 *
 * 담당 PRD 수용 기준
 *  - 1-5 (엣지): selectedRepo를 repos 배열과 분리 보관하므로 추가 페이지 로드로 repos가 바뀌어도 선택이 유지된다.
 *  - 1-7 (에러): RESET_ALL 하나로 계정·저장소·문서·산출물·결과를 전부 초기값으로 되돌린다.
 *  - 2-3: 산출물 추가/삭제가 artifacts 배열에 즉시 반영되고 총 항목 수는 파생값으로 계산된다.
 */
import type { ExpectedArtifact, ExtractResult, UploadedDocument } from '@/types/artifact';
import type { GitHubUser, RepoSummary } from '@/types/github';
import type { VerificationReport } from '@/types/verification';

/** 세션 확인 상태. 'unknown'은 /api/session 응답 대기 중을 뜻한다. */
export type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated';

export type ExtractStats = ExtractResult['stats'];

export interface AppState {
  authStatus: AuthStatus;
  /** 로그인 사용자 프로필. 토큰은 어떤 경우에도 여기에 담기지 않는다. */
  user: GitHubUser | null;
  /** 누적 로드된 저장소 전체 */
  repos: RepoSummary[];
  /** 마지막으로 불러온 페이지 번호 (0 = 아직 불러오지 않음) */
  reposPage: number;
  reposHasNext: boolean;
  repoQuery: string;
  /** 검증 대상. repos 배열과 분리해 값 전체를 복사 보관한다. */
  selectedRepo: RepoSummary | null;
  documents: UploadedDocument[];
  artifacts: ExpectedArtifact[];
  extractStats: ExtractStats | null;
  /** 마지막으로 성공한 검증 리포트. 실패 시 덮어쓰지 않는다. (수용 기준 3-7) */
  report: VerificationReport | null;
}

export const INITIAL_APP_STATE: AppState = {
  authStatus: 'unknown',
  user: null,
  repos: [],
  reposPage: 0,
  reposHasNext: false,
  repoQuery: '',
  selectedRepo: null,
  documents: [],
  artifacts: [],
  extractStats: null,
  report: null,
};

export type AppAction =
  | { type: 'SET_USER'; user: GitHubUser }
  | { type: 'SET_UNAUTHENTICATED' }
  | {
      type: 'APPEND_REPOS';
      items: RepoSummary[];
      page: number;
      hasNext: boolean;
    }
  | { type: 'SET_REPO_QUERY'; query: string }
  | { type: 'SELECT_REPO'; repo: RepoSummary }
  | { type: 'ADD_DOCUMENTS'; documents: UploadedDocument[] }
  | { type: 'REMOVE_DOCUMENT'; documentId: string }
  | { type: 'SET_EXTRACTED_ARTIFACTS'; artifacts: ExpectedArtifact[]; stats: ExtractStats }
  | { type: 'ADD_ARTIFACT'; artifact: ExpectedArtifact }
  | { type: 'REMOVE_ARTIFACT'; artifactId: string }
  | { type: 'SET_REPORT'; report: VerificationReport }
  | { type: 'RESET_ALL' };

/** path 사전순 오름차순 (화면 안정성 확보 — mergeArtifacts와 동일한 정렬 기준) */
function byPath(a: ExpectedArtifact, b: ExpectedArtifact): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

/** 같은 id의 저장소가 다시 오면 뒤에 온 값으로 갱신한다. (페이지 경계 중복 방지) */
function appendRepos(current: RepoSummary[], incoming: RepoSummary[]): RepoSummary[] {
  const merged = [...current];
  const indexById = new Map(merged.map((repo, index) => [repo.id, index]));

  for (const repo of incoming) {
    const index = indexById.get(repo.id);
    if (index === undefined) {
      indexById.set(repo.id, merged.length);
      merged.push(repo);
    } else {
      merged[index] = repo;
    }
  }

  return merged;
}

/**
 * 추출 결과로 목록을 교체하되, 사용자가 직접 추가한 항목은 보존한다.
 * (문서를 추가·제거해 재추출이 일어나도 수동 입력이 사라지지 않게 한다 — 수용 기준 2-3, 2-5)
 */
function replaceExtractedArtifacts(
  current: ExpectedArtifact[],
  extracted: ExpectedArtifact[],
): ExpectedArtifact[] {
  const extractedPaths = new Set(extracted.map((artifact) => artifact.path));
  const preservedManual = current.filter(
    (artifact) => artifact.origin === 'manual' && !extractedPaths.has(artifact.path),
  );
  return [...extracted, ...preservedManual].sort(byPath);
}

/** 로그아웃·세션 만료 시의 초기 상태. 로그인 화면으로 돌아가야 하므로 인증 상태만 확정한다. */
function resetAll(): AppState {
  return { ...INITIAL_APP_STATE, authStatus: 'unauthenticated' };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, authStatus: 'authenticated', user: action.user };

    case 'SET_UNAUTHENTICATED':
      return { ...resetAll() };

    case 'APPEND_REPOS':
      return {
        ...state,
        repos: action.page <= 1 ? action.items : appendRepos(state.repos, action.items),
        reposPage: action.page,
        reposHasNext: action.hasNext,
      };

    case 'SET_REPO_QUERY':
      return { ...state, repoQuery: action.query };

    case 'SELECT_REPO':
      // 다른 저장소를 고르면 이전 저장소의 리포트는 더 이상 유효하지 않으므로 비운다.
      return {
        ...state,
        selectedRepo: action.repo,
        report: state.report?.repo.fullName === action.repo.fullName ? state.report : null,
      };

    case 'ADD_DOCUMENTS':
      return { ...state, documents: [...state.documents, ...action.documents] };

    case 'REMOVE_DOCUMENT':
      return {
        ...state,
        documents: state.documents.filter((document) => document.id !== action.documentId),
      };

    case 'SET_EXTRACTED_ARTIFACTS':
      return {
        ...state,
        artifacts: replaceExtractedArtifacts(state.artifacts, action.artifacts),
        extractStats: action.stats,
      };

    case 'ADD_ARTIFACT':
      return { ...state, artifacts: [...state.artifacts, action.artifact].sort(byPath) };

    case 'REMOVE_ARTIFACT':
      return {
        ...state,
        artifacts: state.artifacts.filter((artifact) => artifact.id !== action.artifactId),
      };

    case 'SET_REPORT':
      return { ...state, report: action.report };

    case 'RESET_ALL':
      return resetAll();

    default:
      return state;
  }
}
