/**
 * 접근 가능 저장소 목록 조회 (TECH_SPEC §4 기능1 "저장소 목록 조회")
 *
 * !! 서버 전용 모듈 !!
 * access token을 인자로 받는다. 응답은 RepoSummary로 축약해 불필요한 필드를 클라이언트로 보내지 않는다.
 */
import 'server-only';

import { AppError } from '@/lib/errors';
import { createOctokit, withGitHubErrorHandling } from '@/lib/github/client';
import { parseRateLimitOrUnknown } from '@/lib/github/rateLimit';
import type { RateLimitInfo, RepoPage, RepoSummary } from '@/types/github';

/** 페이지 크기 (TECH_SPEC §9 임의 결정 사항 #1: 3초 목표와 요청 횟수의 절충) */
export const REPOS_PER_PAGE = 50;

/** GitHub API가 허용하는 페이지 크기 상한 */
export const MAX_REPOS_PER_PAGE = 100;

/** Link 헤더에 rel="next"가 있으면 다음 페이지가 존재한다. */
export function hasNextPage(linkHeader: string | undefined): boolean {
  if (!linkHeader) return false;
  return /;\s*rel="next"/.test(linkHeader);
}

function invalidPayload(field: string): AppError {
  return new AppError('GITHUB_UNAVAILABLE', { details: { reason: 'invalid-repo-payload', field } });
}

/** Octokit 응답 → RepoSummary 축약 매핑 (불필요한 필드를 클라이언트로 보내지 않음) */
export function toRepoSummary(raw: unknown): RepoSummary {
  if (typeof raw !== 'object' || raw === null) {
    throw invalidPayload('root');
  }

  const source = raw as {
    id?: unknown;
    name?: unknown;
    full_name?: unknown;
    default_branch?: unknown;
    private?: unknown;
    html_url?: unknown;
    pushed_at?: unknown;
    updated_at?: unknown;
    created_at?: unknown;
    owner?: { login?: unknown } | null;
  };

  if (typeof source.id !== 'number') throw invalidPayload('id');
  if (typeof source.name !== 'string') throw invalidPayload('name');
  if (typeof source.full_name !== 'string') throw invalidPayload('full_name');
  if (typeof source.html_url !== 'string') throw invalidPayload('html_url');

  const ownerLogin =
    typeof source.owner?.login === 'string' ? source.owner.login : source.full_name.split('/')[0] ?? '';

  // pushed_at이 null인 저장소(푸시 이력 없음)는 updated_at → created_at 순으로 대체한다.
  const pushedAt =
    (typeof source.pushed_at === 'string' && source.pushed_at) ||
    (typeof source.updated_at === 'string' && source.updated_at) ||
    (typeof source.created_at === 'string' && source.created_at) ||
    new Date(0).toISOString();

  return {
    id: source.id,
    owner: ownerLogin,
    name: source.name,
    fullName: source.full_name,
    defaultBranch: typeof source.default_branch === 'string' ? source.default_branch : 'main',
    isPrivate: source.private === true,
    htmlUrl: source.html_url,
    pushedAt,
  };
}

/** 페이지 번호·크기 정규화 (잘못된 값이 GitHub 요청으로 새어나가지 않게 한다) */
export function normalizeReposParams(params: { page?: number; perPage?: number }): {
  page: number;
  perPage: number;
} {
  const page = Number.isFinite(params.page) && (params.page as number) >= 1 ? Math.floor(params.page as number) : 1;
  const rawPerPage = Number.isFinite(params.perPage) ? Math.floor(params.perPage as number) : REPOS_PER_PAGE;
  const perPage = Math.min(Math.max(rawPerPage, 1), MAX_REPOS_PER_PAGE);
  return { page, perPage };
}

/**
 * GET /user/repos?sort=pushed&direction=desc&per_page=50&page=N
 * - GitHub App user access token으로 호출하면 "사용자와 앱이 모두 접근 가능한 저장소"만 반환된다.
 * - sort=pushed&direction=desc → PRD "최근 수정일 내림차순" 요구를 서버 측에서 충족(페이지 간 순서 보장).
 * - Link 헤더의 rel="next" 유무로 hasNext 판정 → 100개 초과 저장소의 순차 로드 지원.
 */
export async function listAccessibleRepos(
  accessToken: string,
  params: { page: number; perPage?: number },
): Promise<{ page: RepoPage; rateLimit: RateLimitInfo }> {
  const { page, perPage } = normalizeReposParams(params);
  const octokit = createOctokit(accessToken);

  return withGitHubErrorHandling(async () => {
    const response = await octokit.rest.repos.listForAuthenticatedUser({
      sort: 'pushed',
      direction: 'desc',
      per_page: perPage,
      page,
    });

    const items = response.data.map(toRepoSummary);
    const linkHeader = response.headers.link;

    return {
      page: {
        items,
        page,
        hasNext: hasNextPage(typeof linkHeader === 'string' ? linkHeader : undefined),
      },
      rateLimit: parseRateLimitOrUnknown(response.headers as Record<string, string | number | undefined>),
    };
  });
}
