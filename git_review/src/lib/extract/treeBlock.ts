/**
 * 코드블록 디렉터리 트리 판별 및 전체 경로 복원 (TECH_SPEC §4 기능2 R1)
 *
 * 들여쓰기 폭을 고정값(4칸)으로 가정하지 않고 "이름이 시작하는 컬럼 위치" 스택으로
 * 부모-자식을 판정한다. 2/3/4칸 들여쓰기와 `│   ` 혼용이 실제 문서에 모두 존재하기 때문이다.
 */
import type { ArtifactKind } from '@/types/artifact';
import { normalizePath } from '@/lib/extract/normalizePath';
import { looksLikePath } from '@/lib/extract/pathHeuristics';
import type { RawCandidate } from '@/lib/extract/extractArtifacts';

/** 트리 그리기 문자 */
export const TREE_GLYPHS = /[├└│─┬┐┌]/;

/** 꼬리 주석 제거: 공백 2칸 이상을 요구해 "a#b.txt" 같은 파일명 오손상을 방지한다. */
const TRAILING_COMMENT_RE = /\s{2,}(#|\/\/|←|→|<--).*$/;

/** 들여쓰기 / 가지 기호 / 이름 분해 */
const TREE_LINE_RE =
  /^(?<indent>[\s│|]*)(?<branch>(?:[├└`+][-─]{1,3}|[-*+])\s+)?(?<name>\S.*?)\s*$/;

/** 줄 전체가 주석인 경우의 시작 기호 */
const LINE_COMMENT_PREFIXES = ['#', '//', '/*', '*/'];

/** 생략 표시 */
const OMISSION_MARKERS = ['...', '…'];

/** 스니펫 최대 길이 */
const SNIPPET_MAX_LENGTH = 120;

interface TreeLine {
  /** 블록 내 0-base 줄 인덱스 */
  index: number;
  /** 이름이 시작하는 컬럼 위치 */
  nameColumn: number;
  /** 가지 기호를 제거한 이름 원문 */
  name: string;
  /** 원본 줄 (스니펫용) */
  rawLine: string;
}

/** 꼬리 주석을 제거한다. */
function stripTrailingComment(line: string): string {
  return line.replace(TRAILING_COMMENT_RE, '');
}

/** 이름에서 후행 '/'(폴더 표시)와 후행 '*'(변경 표시)를 제거한다. */
function stripName(name: string): string {
  return name.replace(/[/*]+$/, '');
}

/** 건너뛰어야 하는 줄인지 (빈 줄, 생략 표시, 전체 주석) */
function isSkippableName(name: string): boolean {
  if (name.length === 0) return true;
  if (OMISSION_MARKERS.some((marker) => name.startsWith(marker))) return true;
  return LINE_COMMENT_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/** 한 줄을 들여쓰기/가지/이름으로 분해한다. 분해 불가 시 null. */
function parseLine(rawLine: string, index: number): TreeLine | null {
  const withoutComment = stripTrailingComment(rawLine);
  if (withoutComment.trim().length === 0) return null;

  const match = TREE_LINE_RE.exec(withoutComment);
  if (!match?.groups) return null;

  const indent = match.groups.indent ?? '';
  const branch = match.groups.branch ?? '';
  const name = match.groups.name ?? '';
  if (isSkippableName(name)) return null;

  return {
    index,
    nameColumn: indent.length + branch.length,
    name,
    rawLine: withoutComment.trim(),
  };
}

/** 블록 본문을 트리 줄 목록으로 분해한다. */
function parseLines(code: string): TreeLine[] {
  const lines: TreeLine[] = [];
  code.split('\n').forEach((rawLine, index) => {
    const parsed = parseLine(rawLine, index);
    if (parsed !== null) lines.push(parsed);
  });
  return lines;
}

/**
 * 트리 블록 판별 (둘 중 하나라도 만족):
 *  (a) 본문에 TREE_GLYPHS가 1회 이상 등장한다.
 *  (b) 2줄 이상이고, 들여쓰기 깊이가 서로 다른 줄이 존재하며,
 *      전체 줄의 50% 이상이 looksLikePath()를 통과한다.
 */
export function isTreeBlock(code: string): boolean {
  if (TREE_GLYPHS.test(code)) return true;

  const lines = parseLines(code);
  if (lines.length < 2) return false;

  const columns = new Set(lines.map((line) => line.nameColumn));
  if (columns.size < 2) return false;

  const pathLikeCount = lines.filter((line) => looksLikePath(stripName(line.name))).length;
  return pathLikeCount * 2 >= lines.length;
}

interface StackEntry {
  column: number;
  path: string;
  /** candidates 배열에서의 위치 (hasChildren 갱신용) */
  candidateIndex: number;
}

interface PendingCandidate {
  fullPath: string;
  /** 이름이 '/'로 끝났는지 (폴더 확정 근거) */
  explicitDirectory: boolean;
  hasChildren: boolean;
  /** 부모 없이 push된 최상위 노드인지 (단일 루트 절단 판정용) */
  isRoot: boolean;
  line: number;
  snippet: string;
}

/**
 * 단일 루트 절단 (TECH_SPEC §4 R1 8단계)
 *
 * 문서의 트리 블록은 대개 저장소 이름을 루트 노드로 얹어 그린다.
 *
 *   git_review/
 *   └── src/app/page.tsx
 *
 * 이때 복원 경로가 `git_review/src/app/page.tsx`가 되는데, TreeEntry.path는
 * 저장소 루트 기준 상대 경로이므로(§3.1) 이 경로는 어떤 저장소와도 매칭되지 않는다.
 * 최상위 노드가 정확히 1개이고 나머지 전 노드가 그 자손이면, 루트를 후보에서 빼고
 * 자손 경로에서 `${root}/` 접두사를 제거한다.
 *
 * 최상위 노드가 2개 이상이면(= 루트 없이 형제 목록을 나열한 트리) 절단하지 않는다.
 */
function truncateSingleRoot(pending: PendingCandidate[]): PendingCandidate[] {
  const roots = pending.filter((item) => item.isRoot);
  const root = roots.length === 1 ? roots[0] : null;
  if (root === null || !root.hasChildren) return pending;

  const prefix = `${root.fullPath}/`;
  return pending
    .filter((item) => item !== root)
    .map((item) =>
      item.fullPath.startsWith(prefix)
        ? { ...item, fullPath: item.fullPath.slice(prefix.length) }
        : item,
    );
}

/** 트리 블록을 전체 경로 목록으로 복원한다. */
export function parseTreeBlock(code: string, blockStartLine: number): RawCandidate[] {
  const lines = parseLines(code);
  const pending: PendingCandidate[] = [];
  const stack: StackEntry[] = [];

  for (const line of lines) {
    // 형제/상위로 복귀: top의 컬럼이 현재 이름 컬럼 이상이면 pop
    while (stack.length > 0 && stack[stack.length - 1].column >= line.nameColumn) {
      stack.pop();
    }

    const name = stripName(line.name);
    if (name.length === 0) continue;

    const parent = stack.length > 0 ? stack[stack.length - 1] : null;
    if (parent !== null) {
      // 자식이 push되는 시점에 부모를 폴더로 확정한다.
      pending[parent.candidateIndex].hasChildren = true;
    }

    const fullPath = parent !== null ? `${parent.path}/${name}` : name;
    const candidateIndex = pending.length;
    pending.push({
      fullPath,
      explicitDirectory: line.name.endsWith('/'),
      hasChildren: false,
      isRoot: parent === null,
      // 펜스 라인 보정: 코드 노드 시작 줄 다음 줄부터 본문이 시작한다.
      line: blockStartLine + line.index + 1,
      snippet: line.rawLine.slice(0, SNIPPET_MAX_LENGTH),
    });

    stack.push({ column: line.nameColumn, path: fullPath, candidateIndex });
  }

  const candidates: RawCandidate[] = [];
  for (const item of truncateSingleRoot(pending)) {
    const normalized = normalizePath(item.fullPath);
    if (normalized === null) continue;

    const kind: ArtifactKind =
      item.explicitDirectory || item.hasChildren ? 'directory' : normalized.kind;

    candidates.push({
      rawText: item.fullPath,
      path: normalized.path,
      kind,
      rule: 'tree-block',
      line: item.line,
      snippet: item.snippet,
      hasChildren: item.hasChildren,
    });
  }

  return candidates;
}
