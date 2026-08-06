/**
 * 트리 엔트리 → 파일 집합 · 파일보유 폴더 집합 인덱스 (TECH_SPEC §4 기능3-2)
 *
 * type === 'tree' 엔트리는 dirsWithFiles에 넣지 않는다.
 *   근거: PRD 엣지 수용기준 "폴더는 하위에 파일이 1개 이상 존재해야 존재로 판정".
 *         blob 경로에서 역산한 조상 접두사만 사용하면 이 규칙이 정의상 항상 성립한다.
 * type === 'commit'(서브모듈)은 파일로 취급하지 않는다.
 */
import type { TreeEntry } from '@/types/github';

export interface TreeIndex {
  /** blob 경로 원본 */
  files: Set<string>;
  /** blob 1개 이상을 하위에 가진 모든 조상 경로 */
  dirsWithFiles: Set<string>;
  /** 소문자 경로 → 원본 경로 */
  filesLower: Map<string, string>;
  dirsLower: Map<string, string>;
  /** 폴더 경로 → 하위(재귀) 파일 수 */
  childFileCount: Map<string, number>;
  fileCount: number;
}

/** 저장소 루트 기준 표기로 통일한다. (선행 슬래시 제거, 중복 슬래시 축약) */
function normalizeEntryPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * 트리 엔트리 목록을 매칭용 인덱스로 변환한다.
 * 복잡도 O(총 경로 세그먼트 수).
 */
export function buildTreeIndex(entries: TreeEntry[]): TreeIndex {
  const files = new Set<string>();
  const dirsWithFiles = new Set<string>();
  const filesLower = new Map<string, string>();
  const dirsLower = new Map<string, string>();
  const childFileCount = new Map<string, number>();

  for (const entry of entries) {
    if (entry.type !== 'blob') continue;

    const path = normalizeEntryPath(entry.path);
    if (path.length === 0) continue;
    if (files.has(path)) continue;

    files.add(path);
    const lower = path.toLowerCase();
    if (!filesLower.has(lower)) filesLower.set(lower, path);

    const segments = path.split('/');
    for (let index = 0; index < segments.length - 1; index += 1) {
      const prefix = segments.slice(0, index + 1).join('/');
      dirsWithFiles.add(prefix);

      const prefixLower = prefix.toLowerCase();
      if (!dirsLower.has(prefixLower)) dirsLower.set(prefixLower, prefix);

      childFileCount.set(prefix, (childFileCount.get(prefix) ?? 0) + 1);
    }
  }

  return {
    files,
    dirsWithFiles,
    filesLower,
    dirsLower,
    childFileCount,
    fileCount: files.size,
  };
}
