import { BLOG_MIN_HEADINGS, PLATFORM_SPECS } from '@/lib/constants';
import type { DraftValidation, Platform } from '@/types/domain';

/**
 * 초안 검증 (TECH_SPEC 3. 기능 3 > 3-B).
 *
 * **순수 함수**다. DOM·네트워크·현재 시각에 접근하지 않으므로 단위 테스트로 검증한다.
 * 분량 기준은 `PLATFORM_SPECS`·`BLOG_MIN_HEADINGS` 상수만 참조한다 (하드코딩 금지).
 */

/** 마크다운 H2 이상 소제목 (`## 제목`) */
const HEADING_PATTERN = /^#{2,}\s+/gm;

/** `owner/name` 후보. 세그먼트는 영숫자로 시작하고 `-`, `_`, `.` 만 허용 */
const REPOSITORY_PATTERN = /(?<![\w./-])([A-Za-z0-9][\w.-]*)\/([A-Za-z0-9][\w.-]*)(?![\w./-])/g;

/** `8/11` 같은 숫자 표기를 저장소명으로 오인하지 않도록 두 세그먼트 모두 영문자를 요구한다 */
const HAS_LETTER = /[A-Za-z]/;

/** 본문에서 URL 을 걷어내기 위한 패턴 */
const URL_PATTERN = /https?:\/\/\S+/g;

/** `https://github.com/owner/name` 형태에서 저장소명을 뽑는 패턴 */
const GITHUB_URL_PATTERN = /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9][\w.-]*)\/([A-Za-z0-9][\w.-]*)/g;

/**
 * 저장소명이 아닌 관용 표기. `owner/name` 패턴에 걸리지만 오탐이므로 제외한다.
 * (TECH_SPEC 에 명시된 규칙은 아니며, 경고의 신뢰도를 위한 최소 방어다)
 */
const NON_REPOSITORY_TOKENS: ReadonlySet<string> = new Set([
  'ci/cd',
  'and/or',
  'i/o',
  'tcp/ip',
  'ui/ux',
  'n/a',
  'a/b',
  'client/server',
  'read/write',
  'front/back',
]);

/** 1,300 처럼 세 자리마다 쉼표 (Intl 로케일에 의존하지 않는 결정적 표기) */
function withThousands(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 공백 포함 문자 수. 이모지·서로게이트 페어를 1자로 계산 */
export function countChars(content: string): number {
  return Array.from(content).length;
}

/** 블로그 초안이 H2 이상 소제목을 `BLOG_MIN_HEADINGS` 개 이상 포함하는지 (AC-3.3) */
export function hasEnoughHeadings(markdown: string): boolean {
  const matches = markdown.match(HEADING_PATTERN);
  return (matches?.length ?? 0) >= BLOG_MIN_HEADINGS;
}

/**
 * 본문에서 `owner/name` 패턴을 추출해 `knownRepositories` 에 없는 것만 반환한다 (AC-3.8).
 *
 * - GitHub URL 은 `owner/name` 으로 환산하고, 그 외 URL 은 경로 오탐을 막기 위해 제거한다.
 * - 비교는 대소문자를 구분하지 않는다 (GitHub 저장소명 규칙).
 * - 반환 순서는 본문 등장 순서이며 중복은 제거한다.
 */
export function findUnknownRepositories(content: string, knownRepositories: string[]): string[] {
  const known = new Set(knownRepositories.map((repo) => repo.toLowerCase()));
  const candidates: string[] = [];

  for (const match of content.matchAll(GITHUB_URL_PATTERN)) {
    candidates.push(`${match[1]}/${match[2]}`);
  }

  const withoutUrls = content.replace(URL_PATTERN, ' ');
  for (const match of withoutUrls.matchAll(REPOSITORY_PATTERN)) {
    if (!HAS_LETTER.test(match[1]) || !HAS_LETTER.test(match[2])) continue;
    candidates.push(`${match[1]}/${match[2]}`);
  }

  const unknown: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    if (NON_REPOSITORY_TOKENS.has(key)) continue;
    if (known.has(key)) continue;

    unknown.push(candidate);
  }

  return unknown;
}

/** 플랫폼 규격(분량, 블로그는 소제목 포함) 충족 여부 */
function meetsSpec(platform: Platform, content: string, charCount: number): boolean {
  const spec = PLATFORM_SPECS[platform];

  if (platform === 'blog') {
    return charCount >= spec.min && hasEnoughHeadings(content);
  }

  const underMax = spec.max === null || charCount <= spec.max;
  return charCount >= spec.min && underMax;
}

/** 규격 위반 시 사용자 경고 문구 (TECH_SPEC 3-B 경고 문구 규칙) */
function specMessage(platform: Platform): string {
  switch (platform) {
    case 'x':
      return `${withThousands(PLATFORM_SPECS.x.max)}자를 초과했습니다. 게시 전 줄여 주세요.`;
    case 'linkedin':
      return `권장 분량(${withThousands(PLATFORM_SPECS.linkedin.min)}~${withThousands(PLATFORM_SPECS.linkedin.max)}자)을 벗어났습니다.`;
    case 'blog':
      return `권장 분량 ${withThousands(PLATFORM_SPECS.blog.min)}자 이상 / 소제목 ${BLOG_MIN_HEADINGS}개 이상을 충족하지 않습니다.`;
  }
}

/**
 * 플랫폼 규격 대비 검증 + 미확인 저장소명 탐지 (AC-3.3, AC-3.4, AC-3.8).
 *
 * `message` 는 규격 경고와 미확인 저장소 경고를 함께 담을 수 있고, 위반이 없으면 `null` 이다.
 */
export function validateDraft(
  platform: Platform,
  content: string,
  knownRepositories: string[],
): DraftValidation {
  const charCount = countChars(content);
  const withinLimit = meetsSpec(platform, content, charCount);
  const unknownRepos = findUnknownRepositories(content, knownRepositories);

  const messages: string[] = [];
  if (!withinLimit) messages.push(specMessage(platform));
  if (unknownRepos.length > 0) {
    messages.push(`활동 데이터에 없는 저장소명이 포함되어 있습니다: ${unknownRepos.join(', ')}`);
  }

  return {
    charCount,
    withinLimit,
    message: messages.length > 0 ? messages.join(' ') : null,
    unknownRepos,
  };
}
