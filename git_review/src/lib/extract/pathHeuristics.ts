/**
 * 경로 후보 판별 규칙 (TECH_SPEC §4 기능2 "경로 판별·거부 규칙")
 *
 * 이 모듈은 브라우저에서 실행된다. Node 전용 API(fs 등)를 사용하지 않는다.
 * 순수 문자열 판정만 수행하므로 서버에서도 안전하게 재사용할 수 있다.
 */
import type { RejectReason } from '@/types/artifact';

/** 파일로 인정하는 확장자 사전 (소문자 기준) */
export const KNOWN_EXTENSIONS: ReadonlySet<string> = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'jsonc', 'md', 'mdx',
  'css', 'scss', 'sass', 'less', 'html', 'htm', 'svg', 'png', 'jpg', 'jpeg',
  'gif', 'ico', 'webp', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'env',
  'txt', 'csv', 'sql', 'sh', 'ps1', 'bat', 'py', 'go', 'rs', 'java', 'kt',
  'kts', 'rb', 'php', 'c', 'cpp', 'h', 'hpp', 'swift', 'dart', 'vue',
  'svelte', 'astro', 'prisma', 'graphql', 'gql', 'lock', 'tsbuildinfo',
  'map', 'xml', 'pdf',
]);

/** 확장자가 없어도 파일로 인정하는 파일명 사전 (소문자 기준으로 비교) */
export const KNOWN_EXTENSIONLESS_FILES: ReadonlySet<string> = new Set([
  'dockerfile', 'makefile', 'procfile', 'license', 'licence', 'readme',
  'changelog', 'codeowners',
  '.gitignore', '.gitattributes', '.env', '.env.local', '.env.example',
  '.npmrc', '.nvmrc', '.editorconfig', '.eslintrc', '.prettierrc',
  '.dockerignore', '.babelrc',
]);

/** 첫 토큰이 이 목록에 있으면 경로가 아니라 명령어로 본다. */
export const COMMAND_PREFIXES: readonly string[] = [
  'npm', 'npx', 'yarn', 'pnpm', 'bun', 'git', 'cd', 'ls', 'mkdir', 'touch',
  'rm', 'cp', 'mv', 'curl', 'wget', 'docker', 'node', 'python', 'pip',
  'java', 'gradle', 'mvn', 'make', 'sudo', 'echo', 'export', 'set', 'cat',
  'chmod',
];

const COMMAND_PREFIX_SET: ReadonlySet<string> = new Set(COMMAND_PREFIXES);

/** 경로 세그먼트 1개에 허용되는 문자 집합 */
export const SEGMENT_RE = /^[A-Za-z0-9._@+\-가-힣]+$/;

/** 거부 규칙 #1: 길이·세그먼트 수 상한 */
const MAX_TOKEN_LENGTH = 200;
const MAX_SEGMENT_COUNT = 15;

/** 거부 규칙 #4: 코드 조각·타입 시그니처에서 흔한 문자 */
const CODE_SYNTAX_CHARS = new Set([
  '(', ')', '{', '}', '[', ']', '=', ';', '"', "'", '<', '>', ',', '!', '?',
  '&', '|', '$',
]);

/** 거부 규칙 #6: 글롭 문자 */
const GLOB_CHARS = ['*', '?'];

/** 거부 규칙 #7: "14+", "3.4.1", "v2" 등 버전 표기 */
const VERSION_RE = /^v?\d+(\.\d+)*\+?$/;

/** 거부 규칙 #8: 트리 생략·자리표시자 (세그먼트 전체가 일치할 때만 적용) */
const PLACEHOLDER_SEGMENTS: ReadonlySet<string> = new Set([
  '...', '…', 'todo', '기타', '생략',
]);

/** 거부 규칙 #8: 어디에 있든 자리표시자로 보는 생략 기호 */
const ELLIPSIS_MARKERS = ['...', '…'];

/** 슬래시로 분해한 뒤 빈 세그먼트를 제거한다. */
function toSegments(token: string): string[] {
  return token.split('/').filter((segment) => segment.length > 0);
}

/**
 * 마지막 '.' 뒤의 확장자를 소문자로 반환한다.
 * 선행 점만 있는 dotfile(`.env`)은 확장자가 없는 것으로 본다.
 */
export function getExtension(fileName: string): string | null {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) return null;
  return fileName.slice(dotIndex + 1).toLowerCase();
}

/** 확장자 없이도 파일로 인정하는 특수 파일명인지 */
export function isKnownExtensionlessFile(fileName: string): boolean {
  return KNOWN_EXTENSIONLESS_FILES.has(fileName.toLowerCase());
}

/**
 * 이름이 파일처럼 보이는지 (확장자 보유 또는 특수 파일명).
 * 확장자 사전(KNOWN_EXTENSIONS) 소속 여부는 따지지 않는다.
 * 사전 소속 여부는 거부 규칙 #11에서만 사용한다.
 */
export function looksLikeFileName(fileName: string): boolean {
  if (isKnownExtensionlessFile(fileName)) return true;
  return getExtension(fileName) !== null;
}

/** 거부 규칙 #8 판정 */
function isPlaceholder(token: string, segments: string[]): boolean {
  if (ELLIPSIS_MARKERS.some((marker) => token.includes(marker))) return true;
  return segments.some((segment) => PLACEHOLDER_SEGMENTS.has(segment.toLowerCase()));
}

/**
 * 거부 사유 판정. null이면 통과.
 * TECH_SPEC의 거부 규칙 표 #1~#11을 표에 적힌 순서 그대로 적용한다.
 */
export function rejectionReason(token: string): RejectReason | null {
  // #1 길이 0 또는 200자 초과, 세그먼트 15개 초과
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return 'too-long';
  const segments = toSegments(token);
  if (segments.length === 0) return 'too-long';
  if (segments.length > MAX_SEGMENT_COUNT) return 'too-long';

  // #2 내부에 공백/탭 포함
  if (/\s/.test(token)) return 'contains-whitespace';

  // #3 URL
  if (token.includes('://') || token.startsWith('//') || token.startsWith('www.')) {
    return 'is-url';
  }

  // #4 코드 문법 문자
  for (const char of token) {
    if (CODE_SYNTAX_CHARS.has(char)) return 'code-syntax';
  }

  // #5 명령어 프리픽스 (공백이 이미 걸러졌으므로 첫 토큰 = 첫 세그먼트)
  if (COMMAND_PREFIX_SET.has(segments[0].toLowerCase())) return 'shell-command';

  // #6 글롭 패턴
  if (GLOB_CHARS.some((char) => token.includes(char))) return 'glob-pattern';

  // #7 버전 문자열
  if (VERSION_RE.test(token)) return 'version-string';

  // #8 자리표시자
  if (isPlaceholder(token, segments)) return 'placeholder';

  // #9 세그먼트 문자 검사
  if (segments.some((segment) => !SEGMENT_RE.test(segment))) return 'code-syntax';

  // #10, #11 은 세그먼트가 1개일 때만 적용한다.
  // 근거: `src/components`처럼 확장자 없는 폴더 경로를 살려야 한다.
  if (segments.length === 1) {
    const name = segments[0];
    // 특수 파일명(.env, Dockerfile 등)은 두 규칙 모두 면제한다.
    if (!isKnownExtensionlessFile(name)) {
      const extension = getExtension(name);
      // #10 세그먼트 1개 & 확장자 없음 & 특수 파일명 아님
      if (extension === null) return 'single-segment-no-extension';
      // #11 세그먼트 1개 & 확장자가 사전에 없음
      if (!KNOWN_EXTENSIONS.has(extension)) return 'unknown-extension';
    }
  }

  return null;
}

/** 후보 토큰이 경로로 보이는지 (거부 사유가 없으면 true) */
export function looksLikePath(token: string): boolean {
  return rejectionReason(token) === null;
}
