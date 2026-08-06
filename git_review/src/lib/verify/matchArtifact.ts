/**
 * 경로 매칭 및 존재/없음 판정 (TECH_SPEC §4 기능3-3)
 *
 * 판정 규칙은 kind별로 분리한다.
 *  - file      : 완전 일치 → 대소문자 무시 일치
 *  - directory : 파일보유 폴더 완전 일치 → 대소문자 무시 일치
 *  - unknown   : 파일 규칙을 먼저 적용하고, 실패하면 폴더 규칙을 적용한다.
 *                (Dockerfile 같은 확장자 없는 파일을 놓치지 않기 위해 파일을 먼저 본다)
 */
import { buildRepoFileUrl } from '@/lib/github/urls';
import type { TreeIndex } from '@/lib/verify/buildTreeIndex';
import type { ExpectedArtifact } from '@/types/artifact';
import type { RepoSummary } from '@/types/github';
import type { MatchMethod, VerificationItem } from '@/types/verification';

export interface MatchContext {
  repo: RepoSummary;
  ref: string;
}

interface MatchHit {
  matchedPath: string;
  matchMethod: MatchMethod;
  isDirectory: boolean;
}

/** 파일 규칙: 완전 일치 → 대소문자 무시 일치 */
function matchAsFile(path: string, index: TreeIndex): MatchHit | null {
  if (index.files.has(path)) {
    return { matchedPath: path, matchMethod: 'exact-file', isDirectory: false };
  }

  const matched = index.filesLower.get(path.toLowerCase());
  if (matched !== undefined) {
    return { matchedPath: matched, matchMethod: 'case-insensitive-file', isDirectory: false };
  }

  return null;
}

/** 폴더 규칙: 하위에 파일이 1개 이상 있는 폴더만 존재로 인정한다. */
function matchAsDirectory(path: string, index: TreeIndex): MatchHit | null {
  if (index.dirsWithFiles.has(path)) {
    return { matchedPath: path, matchMethod: 'exact-directory', isDirectory: true };
  }

  const matched = index.dirsLower.get(path.toLowerCase());
  if (matched !== undefined) {
    return {
      matchedPath: matched,
      matchMethod: 'case-insensitive-directory',
      isDirectory: true,
    };
  }

  return null;
}

/** 기대 산출물 1건의 존재 여부를 판정한다. */
export function matchArtifact(
  artifact: ExpectedArtifact,
  index: TreeIndex,
  ctx: MatchContext,
): VerificationItem {
  const { path, kind } = artifact;

  let hit: MatchHit | null = null;
  if (kind === 'directory') {
    hit = matchAsDirectory(path, index);
  } else if (kind === 'file') {
    hit = matchAsFile(path, index);
  } else {
    hit = matchAsFile(path, index) ?? matchAsDirectory(path, index);
  }

  if (hit === null) {
    return {
      artifactId: artifact.id,
      path,
      kind,
      status: 'missing',
      matchedPath: null,
      matchMethod: 'none',
      htmlUrl: null,
      childFileCount: 0,
    };
  }

  return {
    artifactId: artifact.id,
    path,
    kind,
    status: 'present',
    matchedPath: hit.matchedPath,
    matchMethod: hit.matchMethod,
    htmlUrl: buildRepoFileUrl(
      ctx.repo,
      ctx.ref,
      hit.matchedPath,
      hit.isDirectory ? 'directory' : 'file',
    ),
    childFileCount: hit.isDirectory ? (index.childFileCount.get(hit.matchedPath) ?? 0) : 0,
  };
}
