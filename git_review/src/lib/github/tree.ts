/**
 * Git Trees API 단일 호출로 저장소 전체 트리 조회 (TECH_SPEC §3-1)
 *
 * !! 서버 전용 모듈 !!
 *
 * 단일 요청 원칙:
 *   GET /repos/{owner}/{repo}/git/trees/{ref}?recursive=1 을 항목 수와 무관하게 정확히 1회만 호출한다.
 *   Contents API로 항목마다 조회하면 50개 = 50요청이 되어
 *   "항목 50개 15초 이내"(PRD 성능)와 요청 한도 제약을 동시에 위협한다.
 *   → 이 파일에서 반복 호출을 추가하지 말 것.
 *
 * - 브랜치명을 그대로 ref로 사용할 수 있어 커밋 SHA 선조회가 불필요하다(요청 1회 절감).
 * - 409 Conflict(빈 저장소) → entries: [], fileCount: 0 으로 정상 반환하고 repoEmpty 처리로 넘긴다.
 * - 응답 truncated=true → RepoTree.truncated에 그대로 전달(결과 신뢰도 경고에 사용).
 */
import 'server-only';

import { createOctokit, normalizeGitHubError } from '@/lib/github/client';
import { parseRateLimitOrUnknown, UNKNOWN_RATE_LIMIT } from '@/lib/github/rateLimit';
import type { RateLimitInfo, RepoTree, TreeEntry } from '@/types/github';

const ENTRY_TYPES = new Set<TreeEntry['type']>(['blob', 'tree', 'commit']);

/** Trees API 응답 엔트리 → TreeEntry 축약 (path/type만 사용) */
export function toTreeEntries(raw: ReadonlyArray<{ path?: string; type?: string }> | undefined): TreeEntry[] {
  if (!raw) return [];

  const entries: TreeEntry[] = [];
  for (const item of raw) {
    const path = item.path;
    const type = item.type as TreeEntry['type'] | undefined;
    if (typeof path !== 'string' || path.length === 0) continue;
    if (type === undefined || !ENTRY_TYPES.has(type)) continue;
    entries.push({ path, type });
  }
  return entries;
}

/** 빈 저장소(커밋 없음) 응답 */
function emptyTree(ref: string, rateLimit: RateLimitInfo): { tree: RepoTree; rateLimit: RateLimitInfo } {
  return {
    tree: { ref, entries: [], truncated: false, fileCount: 0 },
    rateLimit,
  };
}

/** 저장소 전체 트리를 단일 요청으로 조회한다. */
export async function fetchRepoTree(
  accessToken: string,
  params: { owner: string; repo: string; ref: string },
): Promise<{ tree: RepoTree; rateLimit: RateLimitInfo }> {
  const { owner, repo, ref } = params;
  const octokit = createOctokit(accessToken);

  try {
    const response = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: ref,
      recursive: '1',
    });

    const rateLimit = parseRateLimitOrUnknown(response.headers as Record<string, string | number | undefined>);
    const entries = toTreeEntries(response.data.tree);

    return {
      tree: {
        ref,
        entries,
        truncated: response.data.truncated === true,
        fileCount: entries.reduce((count, entry) => (entry.type === 'blob' ? count + 1 : count), 0),
      },
      rateLimit,
    };
  } catch (error) {
    const appError = normalizeGitHubError(error);

    // 409 Conflict = 커밋이 없는 빈 저장소. 오류가 아니라 "파일 0개" 결과로 처리한다.
    if (appError.code === 'REPO_EMPTY') {
      return emptyTree(ref, UNKNOWN_RATE_LIMIT);
    }

    throw appError;
  }
}
