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
  /**
   * 소문자 부분 경로(진접미사) → 그 접미사를 갖는 원본 파일 경로 목록.
   * 문서가 `AppHeader.tsx`나 `components/AppHeader.tsx`처럼 앞을 생략해 적은 경우를
   * 실제 파일로 이어주기 위한 인덱스다. 후보가 2개 이상이면 매칭하지 않는다.
   */
  fileSuffixes: Map<string, string[]>;
  /** 폴더에 대한 동일한 접미사 인덱스 */
  dirSuffixes: Map<string, string[]>;
  fileCount: number;
}

/** 접미사 인덱스에 (진접미사 → 원본 경로)를 등록한다. 전체 경로는 완전 일치가 담당하므로 제외한다. */
function addSuffixes(target: Map<string, string[]>, path: string, segments: string[]): void {
  for (let index = 1; index < segments.length; index += 1) {
    const suffix = segments.slice(index).join('/').toLowerCase();
    const bucket = target.get(suffix);
    if (bucket === undefined) target.set(suffix, [path]);
    else if (!bucket.includes(path)) bucket.push(path);
  }
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
  const fileSuffixes = new Map<string, string[]>();
  const dirSuffixes = new Map<string, string[]>();

  for (const entry of entries) {
    if (entry.type !== 'blob') continue;

    const path = normalizeEntryPath(entry.path);
    if (path.length === 0) continue;
    if (files.has(path)) continue;

    files.add(path);
    const lower = path.toLowerCase();
    if (!filesLower.has(lower)) filesLower.set(lower, path);

    const segments = path.split('/');
    addSuffixes(fileSuffixes, path, segments);

    for (let index = 0; index < segments.length - 1; index += 1) {
      const prefixSegments = segments.slice(0, index + 1);
      const prefix = prefixSegments.join('/');
      const isNewDir = !dirsWithFiles.has(prefix);
      dirsWithFiles.add(prefix);

      const prefixLower = prefix.toLowerCase();
      if (!dirsLower.has(prefixLower)) dirsLower.set(prefixLower, prefix);

      // 폴더는 경로당 한 번만 접미사를 등록한다. (파일 수만큼 중복 순회하지 않도록)
      if (isNewDir) addSuffixes(dirSuffixes, prefix, prefixSegments);

      childFileCount.set(prefix, (childFileCount.get(prefix) ?? 0) + 1);
    }
  }

  return {
    files,
    dirsWithFiles,
    filesLower,
    dirsLower,
    childFileCount,
    fileSuffixes,
    dirSuffixes,
    fileCount: files.size,
  };
}
