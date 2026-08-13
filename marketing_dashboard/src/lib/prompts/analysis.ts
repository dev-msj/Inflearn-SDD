import { AI_INPUT_LIMITS } from '@/lib/constants';
import { formatDateRange } from '@/lib/utils';
import type { ActivitySummary, CommitActivity } from '@/types/domain';

/**
 * 활동 분석 프롬프트 빌더 (TECH_SPEC 3. 기능 2 > 2-C).
 *
 * **순수 함수**다. 네트워크·환경변수·현재 시각에 접근하지 않으므로 단위 테스트로 검증한다.
 * Q2 투입 상한(커밋 최신 100건 / PR·이슈 전체 / 스타는 저장소명만)은
 * `AI_INPUT_LIMITS` 상수만 참조해 강제한다 (하드코딩 금지).
 */

const PR_STATE_LABELS = { opened: '생성', merged: '머지', closed: '종료' } as const;
const ISSUE_STATE_LABELS = { opened: '생성', closed: '종료' } as const;

/** 프롬프트가 반드시 포함해야 할 지시 5개 (2-C, AC-2.2 ~ AC-2.4, Q6) */
const INSTRUCTIONS: readonly string[] = [
  '출력은 반드시 한국어로 작성한다. 다만 저장소명·커밋 메시지 원문·기술명 등 고유명사는 원문 그대로 유지한다.',
  '각 하이라이트의 evidence 에는 위에 제공된 데이터에 실제로 등장한 저장소명 또는 PR·이슈 제목만 사용한다. 근거를 새로 만들어내지 않는다.',
  '제공되지 않은 수치·기술명·성과를 추측하지 않는다.',
  'highlights 는 3~5개, insights 는 2개 이상 작성한다.',
  '활동이 적으면 억지로 부풀리지 말고 사실만 서술한다.',
];

/** `occurredAt` 내림차순 (최신 우선). 입력 배열을 변형하지 않는다 */
function latestFirst(commits: readonly CommitActivity[]): CommitActivity[] {
  return [...commits].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
}

/** 항목이 없으면 목록 대신 안내 한 줄 */
function section(title: string, lines: readonly string[]): string {
  const body = lines.length > 0 ? lines.join('\n') : '- (없음)';
  return `## ${title}\n${body}`;
}

/**
 * 활동 요약을 Q2 상한에 맞춰 압축한 프롬프트 텍스트를 만든다.
 *
 * - 커밋: 최신 `AI_INPUT_LIMITS.maxCommits` 건. 메시지 첫 줄 + 저장소명
 * - PR·이슈: 전체. 제목 + 상태 + 저장소명
 * - 스타: 저장소명만
 */
export function buildAnalysisPrompt(activity: ActivitySummary): string {
  const { period, counts } = activity;

  const commits = latestFirst(activity.commits).slice(0, AI_INPUT_LIMITS.maxCommits);
  const starRepos = [...new Set(activity.stars.map((star) => star.repo))];

  const overview = [
    `- 기간: ${formatDateRange(period.from, period.to)} (최근 ${period.days}일)`,
    `- 총 활동: ${activity.totalCount}건`,
    `- 커밋 ${counts.commits}건`,
    `- Pull Request ${counts.pullRequests.total}건 (생성 ${counts.pullRequests.opened} · 머지 ${counts.pullRequests.merged} · 종료 ${counts.pullRequests.closed})`,
    `- 이슈 ${counts.issues.total}건 (생성 ${counts.issues.opened} · 종료 ${counts.issues.closed})`,
    `- 스타 ${counts.stars}건`,
    `- 활동 저장소: ${activity.repositories.length > 0 ? activity.repositories.join(', ') : '(없음)'}`,
  ].join('\n');

  const commitLines = commits.map((commit) => `- [${commit.repo}] ${commit.message}`);
  const pullRequestLines = activity.pullRequests.map(
    (pr) => `- [${pr.repo}] #${pr.number} (${PR_STATE_LABELS[pr.state]}) ${pr.title}`,
  );
  const issueLines = activity.issues.map(
    (issue) => `- [${issue.repo}] #${issue.number} (${ISSUE_STATE_LABELS[issue.state]}) ${issue.title}`,
  );
  const starLines = starRepos.map((repo) => `- ${repo}`);

  const instructions = INSTRUCTIONS.map((line, index) => `${index + 1}. ${line}`).join('\n');

  return [
    '당신은 개발자의 GitHub 공개 활동을 읽고, 마케팅 콘텐츠의 재료가 될 서사를 정리하는 분석가입니다.',
    '아래 활동 데이터만을 근거로 기간 요약·하이라이트·인사이트를 작성하세요.',
    '',
    section('활동 개요', overview.split('\n')),
    '',
    section(
      `커밋 (전체 ${counts.commits}건 중 최신 ${commits.length}건, 상한 ${AI_INPUT_LIMITS.maxCommits}건)`,
      commitLines,
    ),
    '',
    section(`Pull Request (전체 ${activity.pullRequests.length}건)`, pullRequestLines),
    '',
    section(`이슈 (전체 ${activity.issues.length}건)`, issueLines),
    '',
    section(`스타 (저장소명만, ${starRepos.length}개)`, starLines),
    '',
    section('작성 지시', [instructions]),
    '',
    section('출력 형식', [
      '- 지정된 JSON 스키마만 출력한다. 설명·코드펜스를 덧붙이지 않는다.',
      '- periodSummary: 기간 전체를 3~5문장으로 서술한 하나의 문단',
      '- highlights[].title: 핵심 작업 제목 / description: 1~2문장 설명 / evidence: 근거로 삼은 저장소명 또는 PR·이슈 제목 1개 이상',
      '- insights: 활동 패턴에 대한 관찰 2개 이상',
    ]),
  ].join('\n');
}

/** Gemini responseSchema (`analysisResultSchema` 와 1:1 대응) */
export const ANALYSIS_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    periodSummary: {
      type: 'STRING',
      description: '기간 전체를 3~5문장으로 서술한 한국어 문단',
    },
    highlights: {
      type: 'ARRAY',
      minItems: '3',
      maxItems: '5',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: '하이라이트 제목' },
          description: { type: 'STRING', description: '1~2문장 설명' },
          evidence: {
            type: 'ARRAY',
            minItems: '1',
            items: { type: 'STRING' },
            description: '제공된 데이터에 실제로 등장한 저장소명 또는 PR·이슈 제목',
          },
        },
        required: ['title', 'description', 'evidence'],
        propertyOrdering: ['title', 'description', 'evidence'],
      },
    },
    insights: {
      type: 'ARRAY',
      minItems: '2',
      items: { type: 'STRING' },
      description: '활동 패턴에 대한 관찰',
    },
  },
  required: ['periodSummary', 'highlights', 'insights'],
  propertyOrdering: ['periodSummary', 'highlights', 'insights'],
};
