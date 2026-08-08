/**
 * 기대 산출물 추출 파이프라인 진입점 (TECH_SPEC §4 기능2)
 *
 * 파이프라인:
 *   문서 원문
 *     → [0] 전처리: CRLF→LF 치환, BOM 제거
 *     → [1] parseMarkdown(): remark-parse + remark-gfm → mdast (position 포함)
 *     → [2] 규칙별 후보 수집 R1~R5
 *     → [3] normalizePath(): 정규화 + 파일/폴더 종류 판정
 *     → [4] rejectionReason(): 거부 규칙 통과 검사
 *     → [5] mergeArtifacts(): 동일 경로 병합 + 출처 누적 + 종류 충돌 해소
 *     → [6] MAX_ARTIFACTS 상한 적용
 *
 * 이 모듈은 브라우저에서 실행된다. (문서 내용을 서버로 보내지 않기 위함)
 */
import type {
  ArtifactKind,
  ExtractResult,
  ExtractionRule,
  RejectReason,
  RejectedCandidate,
  UploadedDocument,
} from '@/types/artifact';
import type { MergeCandidate } from '@/lib/extract/mergeArtifacts';
import { mergeArtifacts } from '@/lib/extract/mergeArtifacts';
import { normalizePath } from '@/lib/extract/normalizePath';
import {
  COMMAND_PREFIXES,
  rejectionReason,
} from '@/lib/extract/pathHeuristics';
import {
  collectTargetNodes,
  nodeStartLine,
  parseMarkdown,
  preprocessMarkdown,
  toPlainText,
} from '@/lib/extract/parseMarkdown';
import { isTreeBlock, parseTreeBlock } from '@/lib/extract/treeBlock';
import type { Code, InlineCode, Nodes, Paragraph, Table } from 'mdast';
import { visit } from 'unist-util-visit';

/** 화면·성능 보호용 상한 */
export const MAX_ARTIFACTS = 300;

/** 출처 스니펫 최대 길이 */
const SNIPPET_MAX_LENGTH = 120;

/** R2에서 통째로 건너뛰는 셸 계열 언어 (명령어 인자와 경로 구분 불가) */
const SHELL_LANGUAGES: ReadonlySet<string> = new Set([
  'bash', 'sh', 'shell', 'console', 'powershell', 'zsh',
]);

/** R2에서 주석으로 간주하는 시작 기호 */
const COMMENT_PREFIXES = ['#', '//', '/*', '*'];

/** R4에서 "경로 열"로 분류하는 헤더 키워드 (소문자 비교) */
const PATH_HEADER_KEYWORDS = [
  '파일', '경로', '파일 경로', '위치', 'file', 'path', 'location', '산출물',
];

/**
 * R5 목록 라벨 패턴.
 * 긴 라벨(`파일 경로`, `생성 파일`)을 먼저 두어 짧은 라벨이 선점하지 않게 한다.
 */
const LIST_LABEL_RE =
  /^\s*(?:[-*]\s*)?(?:\*\*)?(?:파일 경로|생성 파일|파일|경로|위치|File|Path)(?:\*\*)?\s*[:：]\s*(?<value>.+)$/;

/** 명시적 URL 표기 (거부 사유를 is-url로 정확히 남기기 위한 선검사) */
const URL_LIKE_RE = /(:\/\/)|(^\/\/)|(^www\.)/;

const COMMAND_PREFIX_SET: ReadonlySet<string> = new Set(COMMAND_PREFIXES);

/** 규칙별 원시 후보 (정규화 전) */
export interface RawCandidate {
  rawText: string; // 원문 토큰 (정규화 전)
  path: string; // 정규화된 경로
  kind: ArtifactKind;
  rule: ExtractionRule;
  line: number;
  snippet: string;
  hasChildren?: boolean; // 트리 파싱 시 하위 노드 보유 여부 (폴더 판정 근거)
}

/** 정규화·거부 검사 이전의 토큰 */
interface CandidateToken {
  rawText: string;
  rule: ExtractionRule;
  line: number;
  snippet: string;
}

/** 문서 1건의 수집 결과 */
interface DocumentCollectResult {
  candidates: RawCandidate[];
  rejected: RejectedCandidate[];
}

function toSnippet(text: string): string {
  return text.trim().slice(0, SNIPPET_MAX_LENGTH);
}

/** 코드블록 본문의 첫 줄이 문서 전체에서 몇 번째 줄인지 계산한다. */
function codeBodyStartLine(node: Code, lines: string[]): number {
  const startLine = nodeStartLine(node);
  const fenceLine = lines[startLine - 1] ?? '';
  // 펜스 코드블록이면 본문은 다음 줄부터, 들여쓰기 코드블록이면 시작 줄이 곧 본문이다.
  const isFenced = /^\s*(```|~~~)/.test(fenceLine);
  return isFenced ? startLine + 1 : startLine;
}

/** 노드 하위의 inlineCode 값을 순서대로 모은다. */
function collectInlineCodeValues(node: Nodes): string[] {
  const values: string[] = [];
  visit(node, 'inlineCode', (inlineCode) => {
    values.push(inlineCode.value);
  });
  return values;
}

/** R1/R2: 코드블록 후보 수집 */
function collectFromCodeBlocks(codeBlocks: Code[], lines: string[]): {
  treeCandidates: RawCandidate[];
  tokens: CandidateToken[];
} {
  const treeCandidates: RawCandidate[] = [];
  const tokens: CandidateToken[] = [];

  for (const node of codeBlocks) {
    const bodyStartLine = codeBodyStartLine(node, lines);

    // R1. 코드블록 디렉터리 트리
    if (isTreeBlock(node.value)) {
      treeCandidates.push(...parseTreeBlock(node.value, bodyStartLine - 1));
      continue;
    }

    // R2. 코드블록 내 단독 경로 라인
    const language = (node.lang ?? '').trim().toLowerCase();
    if (SHELL_LANGUAGES.has(language)) continue;

    node.value.split('\n').forEach((rawLine, index) => {
      const token = rawLine.trim();
      if (token.length === 0) return;
      // (c) 주석으로 시작하는 줄 제외
      if (COMMENT_PREFIXES.some((prefix) => token.startsWith(prefix))) return;
      // (a) 줄 전체가 단일 토큰
      if (/\s/.test(token)) return;

      tokens.push({
        rawText: token,
        rule: 'code-block-path',
        line: bodyStartLine + index,
        snippet: toSnippet(rawLine),
      });
    });
  }

  return { treeCandidates, tokens };
}

/** R3: 인라인 코드 후보 수집 */
function collectFromInlineCodes(inlineCodes: InlineCode[]): {
  tokens: CandidateToken[];
  rejected: RejectedCandidate[];
} {
  const tokens: CandidateToken[] = [];
  const rejected: RejectedCandidate[] = [];

  for (const node of inlineCodes) {
    const value = node.value.trim();
    if (value.length === 0) continue;
    const line = nodeStartLine(node);

    if (/\s/.test(value)) {
      // 공백이 있으면 명령어 표기인지 먼저 확인한다. (예: `npm run build`)
      const parts = value.split(/\s+/);
      if (COMMAND_PREFIX_SET.has(parts[0].toLowerCase())) {
        rejected.push({ rawText: value, reason: 'shell-command', line });
        continue;
      }
    }

    tokens.push({
      rawText: value,
      rule: 'inline-code',
      line,
      snippet: toSnippet(value),
    });
  }

  return { tokens, rejected };
}

/** 표 헤더 셀 텍스트가 "경로 열"인지 판정한다. */
function isPathColumnHeader(headerText: string): boolean {
  const normalized = headerText.trim().toLowerCase();
  if (normalized.length === 0) return false;
  return PATH_HEADER_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

/** R4: GFM 표 셀 후보 수집 */
function collectFromTables(tables: Table[]): CandidateToken[] {
  const tokens: CandidateToken[] = [];

  for (const table of tables) {
    const [headerRow, ...bodyRows] = table.children;
    if (headerRow === undefined) continue;

    const pathColumns = headerRow.children.map((cell) => isPathColumnHeader(toPlainText(cell)));

    for (const row of bodyRows) {
      row.children.forEach((cell, columnIndex) => {
        const line = nodeStartLine(cell) || nodeStartLine(row);
        const inlineValues = collectInlineCodeValues(cell);
        const cellText = toPlainText(cell).trim();
        const seen = new Set<string>();

        const pushToken = (rawText: string): void => {
          const value = rawText.trim();
          if (value.length === 0 || seen.has(value)) return;
          seen.add(value);
          tokens.push({
            rawText: value,
            rule: 'table-cell',
            line,
            snippet: toSnippet(cellText.length > 0 ? cellText : value),
          });
        };

        if (pathColumns[columnIndex] === true) {
          // (a) 경로 열: 셀 텍스트 전체와 셀 안의 인라인 코드를 모두 검사한다.
          pushToken(cellText);
          inlineValues.forEach(pushToken);
        } else {
          // (b) 그 외 열: 백틱으로 감싼 값만 검사한다.
          inlineValues.forEach(pushToken);
        }
      });
    }
  }

  return tokens;
}

/** R5: 목록 라벨 후보 수집 */
function collectFromParagraphs(paragraphs: Paragraph[]): CandidateToken[] {
  const tokens: CandidateToken[] = [];

  for (const paragraph of paragraphs) {
    const text = toPlainText(paragraph);
    const match = LIST_LABEL_RE.exec(text);
    const value = match?.groups?.value;
    if (value === undefined) continue;

    const line = nodeStartLine(paragraph);
    const snippet = toSnippet(text);
    const inlineValues = collectInlineCodeValues(paragraph);
    const rawTexts = inlineValues.length > 0 ? inlineValues : [value];

    for (const rawText of rawTexts) {
      const trimmed = rawText.trim();
      if (trimmed.length === 0) continue;
      tokens.push({ rawText: trimmed, rule: 'list-label', line, snippet });
    }
  }

  return tokens;
}

/** [3][4] 정규화 + 거부 검사 */
function toRawCandidate(
  token: CandidateToken,
): { ok: true; candidate: RawCandidate } | { ok: false; reason: RejectReason } {
  // URL은 정규화 과정에서 '//'가 축약되어 형태가 깨지므로 먼저 걸러낸다.
  if (URL_LIKE_RE.test(token.rawText)) {
    return { ok: false, reason: 'is-url' };
  }

  // 거부 규칙 #15: 선행 슬래시 = API 경로 / URL 경로 표기 (`/api/verify`, `/user/repos`).
  // 저장소 루트 기준 산출물 경로는 관례상 슬래시 없이 적으므로, 선행 슬래시는 파일이 아니라는 신호로 본다.
  // 정규화가 선행 슬래시를 지워버리기 때문에 반드시 정규화 이전에 검사해야 한다.
  // R1(트리 블록)은 이름을 구조적으로 이어붙여 경로를 만들므로 이 함수를 거치지 않는다.
  if (token.rawText.startsWith('/')) {
    return { ok: false, reason: 'url-path' };
  }

  const normalized = normalizePath(token.rawText);
  if (normalized === null) {
    // '..' 포함 등 정규화 불가 경로
    return { ok: false, reason: 'code-syntax' };
  }

  const reason = rejectionReason(normalized.path);
  if (reason !== null) return { ok: false, reason };

  return {
    ok: true,
    candidate: {
      rawText: token.rawText,
      path: normalized.path,
      kind: normalized.kind,
      rule: token.rule,
      line: token.line,
      snippet: token.snippet,
    },
  };
}

/** 문서 1건에서 후보와 거부 목록을 모두 수집한다. */
function collectDocumentCandidates(document: UploadedDocument): DocumentCollectResult {
  const content = preprocessMarkdown(document.content);
  const lines = content.split('\n');
  const root = parseMarkdown(content);
  const { codeBlocks, inlineCodes, tables, paragraphs } = collectTargetNodes(root);

  const candidates: RawCandidate[] = [];
  const rejected: RejectedCandidate[] = [];

  const codeResult = collectFromCodeBlocks(codeBlocks, lines);
  const inlineResult = collectFromInlineCodes(inlineCodes);
  rejected.push(...inlineResult.rejected);

  // R1 결과는 parseTreeBlock이 이미 정규화·종류 판정을 마쳤으므로 거부 검사만 적용한다.
  for (const candidate of codeResult.treeCandidates) {
    const reason = rejectionReason(candidate.path);
    if (reason !== null) {
      rejected.push({ rawText: candidate.rawText, reason, line: candidate.line });
      continue;
    }
    candidates.push(candidate);
  }

  const tokens: CandidateToken[] = [
    ...codeResult.tokens,
    ...inlineResult.tokens,
    ...collectFromTables(tables),
    ...collectFromParagraphs(paragraphs),
  ];

  for (const token of tokens) {
    const result = toRawCandidate(token);
    if (result.ok) {
      candidates.push(result.candidate);
    } else {
      rejected.push({ rawText: token.rawText, reason: result.reason, line: token.line });
    }
  }

  return { candidates, rejected };
}

/** 문서 1건 → 원시 후보 목록 (규칙 R1~R5 적용) */
export function extractFromDocument(document: UploadedDocument): RawCandidate[] {
  return collectDocumentCandidates(document).candidates;
}

/** 현재 시각(ms). 브라우저·Node 양쪽에서 동작한다. */
function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** 업로드 문서 목록에서 기대 산출물을 추출한다. */
export function extractArtifacts(documents: UploadedDocument[]): ExtractResult {
  const startedAt = nowMs();

  const mergeCandidates: MergeCandidate[] = [];
  const rejected: RejectedCandidate[] = [];

  for (const document of documents) {
    const result = collectDocumentCandidates(document);
    rejected.push(...result.rejected);
    for (const candidate of result.candidates) {
      mergeCandidates.push({
        ...candidate,
        documentId: document.id,
        documentName: document.fileName,
      });
    }
  }

  const merged = mergeArtifacts(mergeCandidates);
  const artifacts = merged.slice(0, MAX_ARTIFACTS);

  return {
    artifacts,
    rejected,
    stats: {
      documentCount: documents.length,
      candidateCount: mergeCandidates.length,
      mergedCount: mergeCandidates.length - merged.length,
      elapsedMs: Math.round(nowMs() - startedAt),
    },
  };
}
