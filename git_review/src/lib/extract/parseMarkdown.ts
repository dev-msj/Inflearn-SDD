/**
 * remark(mdast) 기반 문서 파싱 및 대상 노드 수집 (TECH_SPEC §4 기능2 파이프라인 [0][1])
 *
 * 이 모듈은 브라우저에서 실행된다. 문서 원문은 네트워크로 나가지 않는다.
 * mdast 노드의 `position.start.line`으로 출처 줄 번호(1-base)를 확보한다.
 */
import { toString } from 'mdast-util-to-string';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import type { Code, InlineCode, Node, Paragraph, Root, Table } from 'mdast';

/** BOM(U+FEFF) */
const BOM = '﻿';

/** 파싱 대상 노드 모음 */
export interface TargetNodes {
  /** 코드블록 (R1 트리 블록 / R2 단독 경로 라인) */
  codeBlocks: Code[];
  /** 인라인 코드 (R3). link 하위 노드는 제외된다. */
  inlineCodes: InlineCode[];
  /** GFM 표 (R4) */
  tables: Table[];
  /** 문단 (R5 목록 라벨) */
  paragraphs: Paragraph[];
}

/** 전처리: CRLF→LF 치환, BOM 제거 */
export function preprocessMarkdown(content: string): string {
  const withoutBom = content.startsWith(BOM) ? content.slice(BOM.length) : content;
  return withoutBom.replace(/\r\n?/g, '\n');
}

/** remark-parse + remark-gfm 으로 mdast를 생성한다. (position 포함) */
export function parseMarkdown(content: string): Root {
  const processor = unified().use(remarkParse).use(remarkGfm);
  return processor.parse(preprocessMarkdown(content));
}

/** 노드의 1-base 시작 줄 번호. position이 없으면 0. */
export function nodeStartLine(node: Node): number {
  return node.position?.start.line ?? 0;
}

/** 노드의 평문 텍스트 (mdast 표준 유틸) */
export function toPlainText(node: Node): string {
  return toString(node);
}

/** link 하위에 있는 inlineCode 노드를 모은다. (외부 링크 텍스트 오탐 방지) */
function collectLinkedInlineCodes(root: Root): Set<InlineCode> {
  const linked = new Set<InlineCode>();
  visit(root, 'link', (linkNode) => {
    visit(linkNode, 'inlineCode', (inlineCode) => {
      linked.add(inlineCode);
    });
  });
  return linked;
}

/** 규칙 R1~R5가 사용하는 노드를 한 번의 순회로 수집한다. */
export function collectTargetNodes(root: Root): TargetNodes {
  const linkedInlineCodes = collectLinkedInlineCodes(root);

  const codeBlocks: Code[] = [];
  const inlineCodes: InlineCode[] = [];
  const tables: Table[] = [];
  const paragraphs: Paragraph[] = [];

  visit(root, (node) => {
    switch (node.type) {
      case 'code':
        codeBlocks.push(node);
        break;
      case 'inlineCode':
        if (!linkedInlineCodes.has(node)) inlineCodes.push(node);
        break;
      case 'table':
        tables.push(node);
        break;
      case 'paragraph':
        paragraphs.push(node);
        break;
      default:
        break;
    }
  });

  return { codeBlocks, inlineCodes, tables, paragraphs };
}
