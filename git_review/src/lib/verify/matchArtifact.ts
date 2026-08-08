/**
 * 경로 매칭 및 존재/없음 판정 (TECH_SPEC §4 기능3-3)
 *
 * 판정 규칙은 kind별로 분리한다.
 *  - file      : 완전 일치 → 대소문자 무시 일치 → 접미사 유일 일치
 *  - directory : 파일보유 폴더 완전 일치 → 대소문자 무시 일치 → 접미사 유일 일치
 *  - unknown   : 파일 규칙을 먼저 적용하고, 실패하면 폴더 규칙을 적용한다.
 *                (Dockerfile 같은 확장자 없는 파일을 놓치지 않기 위해 파일을 먼저 본다)
 *
 * 접미사 유일 일치가 필요한 근거:
 *   설계 문서는 같은 파일을 구조 트리에서는 전체 경로로, 본문에서는 `AppHeader.tsx`나
 *   `components/AppHeader.tsx`처럼 앞을 생략해 적는다. 완전 일치만으로는 후자가 모두
 *   "없음"으로 판정돼 준수율이 실제보다 크게 낮아진다.
 *   오탐을 막기 위해 후보가 정확히 1개일 때만 인정하고, 2개 이상이면 매칭하지 않는다.
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

/** 접미사 인덱스에서 후보가 정확히 1개일 때만 그 경로를 돌려준다. */
function uniqueBySuffix(path: string, suffixes: Map<string, string[]>): string | null {
  const candidates = suffixes.get(path.toLowerCase());
  if (candidates === undefined || candidates.length !== 1) return null;
  return candidates[0];
}

/** 후보가 2개 이상이라 특정할 수 없는 경우의 후보 목록. 없으면 빈 배열. */
function ambiguousCandidates(path: string, index: TreeIndex): string[] {
  const key = path.toLowerCase();
  for (const suffixes of [index.fileSuffixes, index.dirSuffixes]) {
    const candidates = suffixes.get(key);
    if (candidates !== undefined && candidates.length > 1) return [...candidates].sort();
  }
  return [];
}

/** 파일 규칙: 완전 일치 → 대소문자 무시 일치 → 접미사 유일 일치 */
function matchAsFile(path: string, index: TreeIndex): MatchHit | null {
  if (index.files.has(path)) {
    return { matchedPath: path, matchMethod: 'exact-file', isDirectory: false };
  }

  const matched = index.filesLower.get(path.toLowerCase());
  if (matched !== undefined) {
    return { matchedPath: matched, matchMethod: 'case-insensitive-file', isDirectory: false };
  }

  const bySuffix = uniqueBySuffix(path, index.fileSuffixes);
  if (bySuffix !== null) {
    return { matchedPath: bySuffix, matchMethod: 'suffix-file', isDirectory: false };
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

  const bySuffix = uniqueBySuffix(path, index.dirSuffixes);
  if (bySuffix !== null) {
    return { matchedPath: bySuffix, matchMethod: 'suffix-directory', isDirectory: true };
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
    // 후보가 여러 개라 특정하지 못한 경우와 아예 없는 경우를 화면에서 구분할 수 있게 남긴다.
    // 존재를 확인한 게 아니므로 status는 'missing'을 유지한다. (준수율 계산 방식은 변경 없음)
    const candidates = ambiguousCandidates(path, index);
    return {
      artifactId: artifact.id,
      path,
      kind,
      status: 'missing',
      matchedPath: null,
      matchMethod: candidates.length > 0 ? 'ambiguous-suffix' : 'none',
      htmlUrl: null,
      childFileCount: 0,
      candidatePaths: candidates,
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
    candidatePaths: [],
  };
}
