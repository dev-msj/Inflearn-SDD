import { describe, expect, it } from 'vitest';
import { AI_INPUT_LIMITS } from '@/lib/constants';
import { ANALYSIS_RESPONSE_SCHEMA, buildAnalysisPrompt } from '@/lib/prompts/analysis';
import type { ActivitySummary } from '@/types/domain';

/**
 * `buildAnalysisPrompt` 단위 테스트 (AC-2.2 ~ AC-2.4).
 * 순수 함수이므로 활동 픽스처를 고정해 Q2 투입 상한과 필수 지시문을 결정적으로 검증한다.
 */

const TOTAL_COMMITS = AI_INPUT_LIMITS.maxCommits + 1; // 101건
const BASE_MS = Date.parse('2026-08-11T00:00:00.000Z');

/** 최신순으로 잘리는지 확인하기 위해 index 가 커질수록 오래된 커밋 */
function commits(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    sha: `sha-${String(index).padStart(3, '0')}`,
    message: `commit-msg-${String(index).padStart(3, '0')}`,
    repo: 'octo/app',
    occurredAt: new Date(BASE_MS - index * 60_000).toISOString(),
  }));
}

function buildActivity(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    period: {
      days: 7,
      from: '2026-08-04T00:00:00.000Z',
      to: '2026-08-11T00:00:00.000Z',
    },
    counts: {
      commits: TOTAL_COMMITS,
      pullRequests: { total: 2, opened: 1, merged: 1, closed: 0 },
      issues: { total: 2, opened: 1, closed: 1 },
      stars: 2,
    },
    commits: commits(TOTAL_COMMITS),
    pullRequests: [
      {
        number: 11,
        title: 'PR-제목-머지',
        repo: 'octo/app',
        state: 'merged',
        url: 'https://github.com/octo/app/pull/11',
        occurredAt: '2026-08-10T00:00:00.000Z',
      },
      {
        number: 12,
        title: 'PR-제목-생성',
        repo: 'octo/api',
        state: 'opened',
        url: 'https://github.com/octo/api/pull/12',
        occurredAt: '2026-08-09T00:00:00.000Z',
      },
    ],
    issues: [
      {
        number: 21,
        title: '이슈-제목-생성',
        repo: 'octo/app',
        state: 'opened',
        url: 'https://github.com/octo/app/issues/21',
        occurredAt: '2026-08-08T00:00:00.000Z',
      },
      {
        number: 22,
        title: '이슈-제목-종료',
        repo: 'octo/api',
        state: 'closed',
        url: 'https://github.com/octo/api/issues/22',
        occurredAt: '2026-08-07T00:00:00.000Z',
      },
    ],
    stars: [
      { repo: 'vendor/starred-one', occurredAt: '2026-08-06T11:22:33.444Z' },
      { repo: 'vendor/starred-two', occurredAt: '2026-08-05T11:22:33.444Z' },
    ],
    repositories: ['octo/api', 'octo/app'],
    totalCount: TOTAL_COMMITS + 6,
    truncated: false,
    ...overrides,
  };
}

describe('buildAnalysisPrompt', () => {
  it('커밋이 상한을 넘으면 최신 100건만 투입한다 (Q2)', () => {
    const prompt = buildAnalysisPrompt(buildActivity());

    const included = prompt.match(/commit-msg-\d{3}/g) ?? [];
    expect(included).toHaveLength(AI_INPUT_LIMITS.maxCommits);

    // 최신 커밋은 포함, 가장 오래된 101번째 커밋은 제외
    expect(prompt).toContain('commit-msg-000');
    expect(prompt).toContain('commit-msg-099');
    expect(prompt).not.toContain('commit-msg-100');
  });

  it('커밋은 메시지 첫 줄과 저장소명으로 투입한다', () => {
    const prompt = buildAnalysisPrompt(buildActivity());

    expect(prompt).toContain('[octo/app] commit-msg-000');
    // 커밋 SHA 는 서사에 쓰이지 않으므로 투입하지 않는다
    expect(prompt).not.toContain('sha-000');
  });

  it('PR·이슈는 전체를 제목·상태·저장소명과 함께 투입한다 (Q2)', () => {
    const prompt = buildAnalysisPrompt(buildActivity());

    expect(prompt).toContain('[octo/app] #11 (머지) PR-제목-머지');
    expect(prompt).toContain('[octo/api] #12 (생성) PR-제목-생성');
    expect(prompt).toContain('[octo/app] #21 (생성) 이슈-제목-생성');
    expect(prompt).toContain('[octo/api] #22 (종료) 이슈-제목-종료');
  });

  it('스타는 저장소명만 투입한다 (Q2)', () => {
    const prompt = buildAnalysisPrompt(buildActivity());

    expect(prompt).toContain('vendor/starred-one');
    expect(prompt).toContain('vendor/starred-two');
    // 스타 항목의 시각 등 저장소명 외 정보는 투입하지 않는다
    expect(prompt).not.toContain('2026-08-06T11:22:33.444Z');
    expect(prompt).not.toContain('2026-08-05T11:22:33.444Z');
  });

  it('한국어 출력 지시와 근거 강제 지시를 포함한다 (AC-2.3, AC-2.4)', () => {
    const prompt = buildAnalysisPrompt(buildActivity());

    expect(prompt).toContain('출력은 반드시 한국어로 작성한다');
    expect(prompt).toContain('고유명사는 원문 그대로 유지한다');
    expect(prompt).toContain('실제로 등장한 저장소명 또는 PR·이슈 제목만 사용한다');
    expect(prompt).toContain('근거를 새로 만들어내지 않는다');
    expect(prompt).toContain('제공되지 않은 수치·기술명·성과를 추측하지 않는다');
    expect(prompt).toContain('highlights 는 3~5개, insights 는 2개 이상 작성한다');
    expect(prompt).toContain('활동이 적으면 억지로 부풀리지 말고 사실만 서술한다');
  });

  it('항목이 없는 활동도 안전하게 직렬화한다 (Q6)', () => {
    const prompt = buildAnalysisPrompt(
      buildActivity({
        counts: {
          commits: 1,
          pullRequests: { total: 0, opened: 0, merged: 0, closed: 0 },
          issues: { total: 0, opened: 0, closed: 0 },
          stars: 0,
        },
        commits: commits(1),
        pullRequests: [],
        issues: [],
        stars: [],
        totalCount: 1,
      }),
    );

    expect(prompt).toContain('Pull Request (전체 0건)');
    expect(prompt).toContain('- (없음)');
    expect(prompt).toContain('활동이 적으면 억지로 부풀리지 말고 사실만 서술한다');
  });
});

describe('ANALYSIS_RESPONSE_SCHEMA', () => {
  it('analysisResultSchema 의 제약(하이라이트 3~5개·인사이트 2개 이상)을 그대로 담는다', () => {
    expect(ANALYSIS_RESPONSE_SCHEMA.required).toEqual([
      'periodSummary',
      'highlights',
      'insights',
    ]);

    const properties = ANALYSIS_RESPONSE_SCHEMA.properties as Record<
      string,
      Record<string, unknown>
    >;
    expect(properties.highlights.minItems).toBe('3');
    expect(properties.highlights.maxItems).toBe('5');
    expect(properties.insights.minItems).toBe('2');

    const highlightItems = properties.highlights.items as Record<string, unknown>;
    expect(highlightItems.required).toEqual(['title', 'description', 'evidence']);
  });
});
