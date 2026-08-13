import { BLOG_MIN_HEADINGS, PLATFORM_SPECS } from '@/lib/constants';
import { formatDateRange } from '@/lib/utils';
import type { ActivitySummary, AnalysisResult, Platform } from '@/types/domain';

/**
 * 플랫폼별 콘텐츠 프롬프트 빌더 (TECH_SPEC 3. 기능 3 > 3-C).
 *
 * **순수 함수**다. 네트워크·환경변수·현재 시각에 접근하지 않는다.
 * 분량·해시태그 규격은 `PLATFORM_SPECS` 상수만 참조한다 (하드코딩 금지).
 */

/**
 * 서버가 부여하는 `generatedAt`·`lowVolume` 은 프롬프트에 쓰지 않으므로 요구하지 않는다.
 * (`POST /api/content` 의 요청 스키마는 `analysisResultSchema` 라 두 필드가 없다)
 */
export type AnalysisContent = Omit<AnalysisResult, 'generatedAt' | 'lowVolume'>;

export interface ContentPromptInput {
  platform: Platform;
  analysis: AnalysisContent;
  activity: ActivitySummary; // 사실 근거 (저장소명·건수) 제공용
}

/** 모든 플랫폼에 공통으로 적용하는 지시 3개 (3-C, AC-3.8, C9) */
const COMMON_INSTRUCTIONS: readonly string[] = [
  '한국어로 작성한다. 다만 저장소명·기술명 등 고유명사는 원문 그대로 유지한다.',
  '위 "허용 저장소 목록"과 분석 결과에 등장하지 않는 저장소명·수치·기술명을 만들어내지 않는다.',
  '활동 건수는 위 "활동 실적"에 제공된 수치만 사용한다. 추정·반올림·과장하지 않는다.',
];

/** 플랫폼별 지시 (3-C 표와 1:1) */
const PLATFORM_INSTRUCTIONS: Record<Platform, readonly string[]> = {
  linkedin: [
    `분량은 공백 포함 ${PLATFORM_SPECS.linkedin.min}~${PLATFORM_SPECS.linkedin.max}자로 맞춘다.`,
    '1인칭 시점의 전문적인 톤으로 작성한다.',
    '도입 훅 → 작업 내용 → 배운 점/성과 의 3단 구성을 따른다.',
    `마지막 줄에 해시태그 ${PLATFORM_SPECS.linkedin.hashtags}를 붙인다.`,
    '마크다운 문법(#, **, - 등)을 쓰지 않고 플레인 텍스트로 작성한다.',
  ],
  x: [
    `공백 포함 ${PLATFORM_SPECS.x.max}자 이내로 작성한다. 초과하면 반드시 줄여서 다시 쓴다.`,
    '핵심 성과 1개에만 집중한다.',
    '첫 문장은 후킹형으로 작성한다.',
    `해시태그는 ${PLATFORM_SPECS.x.hashtags}만 사용하며 글자 수에 포함해 계산한다.`,
    '마크다운 문법을 쓰지 않고 플레인 텍스트로 작성한다.',
  ],
  blog: [
    `분량은 공백 포함 ${PLATFORM_SPECS.blog.min}자 이상으로 작성한다.`,
    `마크다운으로 작성한다. \`#\` 제목 1개와 \`##\` 소제목 ${BLOG_MIN_HEADINGS}개 이상을 포함한다.`,
    '도입 - 본문 - 마무리 구조를 갖춘다.',
    '개요·목차가 아니라 그대로 게시할 수 있는 완성된 초안으로 작성한다.',
  ],
};

/** 항목이 없으면 목록 대신 안내 한 줄 */
function section(title: string, lines: readonly string[]): string {
  const body = lines.length > 0 ? lines.join('\n') : '- (없음)';
  return `## ${title}\n${body}`;
}

/** 1. 2. 3. 번호를 붙인 지시 목록 */
function numbered(lines: readonly string[]): string {
  return lines.map((line, index) => `${index + 1}. ${line}`).join('\n');
}

/**
 * 분석 결과와 활동 사실을 근거로 플랫폼별 초안 프롬프트를 만든다.
 *
 * 활동 데이터는 **사실 대조용**으로만 넣는다. 저장소 목록과 건수만 제공하고
 * 서사는 분석 결과(`analysis`)에서 가져오게 한다 (AC-3.8).
 */
export function buildContentPrompt(input: ContentPromptInput): string {
  const { platform, analysis, activity } = input;
  const spec = PLATFORM_SPECS[platform];
  const { counts, period } = activity;

  const facts = [
    `- 기간: ${formatDateRange(period.from, period.to)} (최근 ${period.days}일)`,
    `- 총 활동: ${activity.totalCount}건`,
    `- 커밋 ${counts.commits}건`,
    `- Pull Request ${counts.pullRequests.total}건 (생성 ${counts.pullRequests.opened} · 머지 ${counts.pullRequests.merged} · 종료 ${counts.pullRequests.closed})`,
    `- 이슈 ${counts.issues.total}건 (생성 ${counts.issues.opened} · 종료 ${counts.issues.closed})`,
    `- 스타 ${counts.stars}건`,
  ];

  const repositories =
    activity.repositories.length > 0
      ? activity.repositories.map((repo) => `- ${repo}`)
      : ['- (없음)'];

  const highlights = analysis.highlights.map(
    (highlight) =>
      `- ${highlight.title}: ${highlight.description} (근거: ${highlight.evidence.join(', ')})`,
  );

  const insights = analysis.insights.map((insight) => `- ${insight}`);

  return [
    `당신은 개발자의 활동 분석 결과를 ${spec.label} 게시용 초안으로 옮기는 마케팅 콘텐츠 작가입니다.`,
    '아래 분석 결과와 활동 사실만을 근거로 초안 1개를 작성하세요.',
    '',
    section('기간 요약', [analysis.periodSummary]),
    '',
    section('하이라이트', highlights),
    '',
    section('인사이트', insights),
    '',
    section('활동 실적 (이 수치 외에는 사용 금지)', facts),
    '',
    section('허용 저장소 목록 (이 목록 밖의 저장소명 사용 금지)', repositories),
    '',
    section('공통 지시', [numbered(COMMON_INSTRUCTIONS)]),
    '',
    section(`${spec.label} 작성 지시`, [numbered(PLATFORM_INSTRUCTIONS[platform])]),
    '',
    section('출력 형식', [
      '- 지정된 JSON 스키마만 출력한다. 설명·코드펜스를 덧붙이지 않는다.',
      '- content: 그대로 게시할 수 있는 본문 전체. 제목·머리말 같은 메타 설명을 덧붙이지 않는다.',
    ]),
  ].join('\n');
}

/** Gemini responseSchema (`{ content: string }`) */
export const CONTENT_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    content: {
      type: 'STRING',
      description: '플랫폼 규격에 맞춘 한국어 초안 본문',
    },
  },
  required: ['content'],
  propertyOrdering: ['content'],
};
