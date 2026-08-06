/**
 * 경로 정규화 및 파일/폴더 종류 판정 (TECH_SPEC §4 기능2 "정규화")
 *
 * 대소문자는 변경하지 않는다. (GitHub 경로는 대소문자를 구분한다)
 */
import type { ArtifactKind } from '@/types/artifact';
import { looksLikeFileName } from '@/lib/extract/pathHeuristics';

export interface NormalizedPath {
  path: string;
  kind: ArtifactKind;
}

/** 양끝을 감싼 백틱/따옴표 */
const WRAPPING_CHARS = new Set(['`', '"', "'", '‘', '’', '“', '”']);

/** 양끝의 백틱·따옴표를 반복 제거한다. */
function stripWrappingQuotes(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && WRAPPING_CHARS.has(value[start])) start += 1;
  while (end > start && WRAPPING_CHARS.has(value[end - 1])) end -= 1;
  return value.slice(start, end);
}

/**
 * 경로를 저장소 루트 기준 표기로 정규화한다. 정규화 불가 시 null.
 *
 * 순서:
 *  1) trim, 양끝 백틱/따옴표 제거
 *  2) 역슬래시 → 슬래시 치환 (윈도우 표기 흡수)
 *  3) 선행 './' 제거, 선행 '/' 제거
 *  4) 중복 슬래시 '//' → '/' 축약
 *  5) 후행 '/' 있으면 제거하고 kind='directory' 로 확정
 *  6) 세그먼트 중 '.' 제거, '..' 존재 시 null 반환(거부)
 *  7) kind 미확정이면 마지막 세그먼트가 파일명처럼 보이면 'file', 아니면 'unknown'
 */
export function normalizePath(raw: string): NormalizedPath | null {
  // 1) trim + 양끝 백틱/따옴표 제거
  let value = stripWrappingQuotes(raw.trim()).trim();
  if (value.length === 0) return null;

  // 2) 역슬래시 → 슬래시
  value = value.replace(/\\/g, '/');

  // 3) 선행 './' 와 선행 '/' 제거
  while (value.startsWith('./')) {
    value = value.slice(2);
  }
  value = value.replace(/^\/+/, '');

  // 4) 중복 슬래시 축약
  value = value.replace(/\/{2,}/g, '/');

  // 5) 후행 슬래시 → 폴더 확정
  let kind: ArtifactKind = 'unknown';
  if (value.endsWith('/')) {
    kind = 'directory';
    value = value.replace(/\/+$/, '');
  }

  // 6) '.' 세그먼트 제거, '..' 은 거부
  const segments: string[] = [];
  for (const segment of value.split('/')) {
    if (segment.length === 0 || segment === '.') continue;
    if (segment === '..') return null;
    segments.push(segment);
  }
  if (segments.length === 0) return null;

  const path = segments.join('/');

  // 7) 종류 판정
  if (kind === 'unknown' && looksLikeFileName(segments[segments.length - 1])) {
    kind = 'file';
  }

  return { path, kind };
}
