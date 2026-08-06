/**
 * 저장소 파일/폴더 GitHub 웹 URL 생성 (TECH_SPEC §3-4)
 *
 * 순수 문자열 조합만 수행하며 access token을 다루지 않는다. (서버/클라이언트 공용)
 * 파일: /blob/{ref}/{path}, 폴더: /tree/{ref}/{path}
 */
import type { ArtifactKind } from '@/types/artifact';
import type { RepoSummary } from '@/types/github';

const GITHUB_WEB_ORIGIN = 'https://github.com';

/** 경로 세그먼트를 각각 인코딩한다. (슬래시는 구분자로 유지) */
function encodePath(path: string): string {
  return path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/** 저장소 루트 URL. htmlUrl이 비어 있으면 owner/name으로 조합한다. */
export function buildRepoBaseUrl(repo: Pick<RepoSummary, 'owner' | 'name' | 'htmlUrl'>): string {
  if (repo.htmlUrl) return repo.htmlUrl.replace(/\/+$/, '');
  return `${GITHUB_WEB_ORIGIN}/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
}

/**
 * 저장소 내 파일/폴더의 GitHub 웹 URL을 생성한다.
 * kind가 'unknown'이면 파일로 간주해 /blob/을 사용한다.
 * (GitHub은 blob 경로가 실제 폴더면 tree 페이지로 리다이렉트한다)
 */
export function buildRepoFileUrl(
  repo: Pick<RepoSummary, 'owner' | 'name' | 'htmlUrl'>,
  ref: string,
  path: string,
  kind: ArtifactKind,
): string {
  const base = buildRepoBaseUrl(repo);
  // 브랜치명에 '/'가 포함될 수 있으므로(예: feat/login) 슬래시는 그대로 두고 세그먼트만 인코딩한다.
  const encodedRef = encodePath(ref);
  const encodedPath = encodePath(path);
  const view = kind === 'directory' ? 'tree' : 'blob';

  if (encodedPath.length === 0) {
    return `${base}/tree/${encodedRef}`;
  }

  return `${base}/${view}/${encodedRef}/${encodedPath}`;
}
