import { describe, expect, it } from 'vitest';
import { buildActivitySummary } from '@/lib/activity';
import type { GitHubEvent } from '@/lib/github';
import type { PeriodDays } from '@/types/domain';

/**
 * `buildActivitySummary` 단위 테스트 (AC-1.5, AC-1.7).
 * 순수 함수이므로 기간과 이벤트 픽스처를 고정해 결정적으로 검증한다.
 */

const TO = new Date('2026-08-11T00:00:00.000Z');
const FROM = new Date('2026-08-04T00:00:00.000Z');
const PERIOD = { days: 7 as PeriodDays, from: FROM, to: TO };

let eventId = 0;

function event(partial: {
  type: string;
  createdAt: string;
  repo: string;
  payload?: GitHubEvent['payload'];
}): GitHubEvent {
  eventId += 1;
  return {
    id: String(eventId),
    type: partial.type,
    created_at: partial.createdAt,
    repo: { name: partial.repo },
    payload: partial.payload ?? {},
  };
}

function pushEvent(repo: string, createdAt: string, commits: { sha: string; message: string }[]) {
  return event({ type: 'PushEvent', createdAt, repo, payload: { commits } });
}

function pullRequestEvent(
  repo: string,
  createdAt: string,
  action: string,
  pullRequest: { number: number; title: string; merged?: boolean },
) {
  return event({
    type: 'PullRequestEvent',
    createdAt,
    repo,
    payload: {
      action,
      pull_request: {
        number: pullRequest.number,
        title: pullRequest.title,
        html_url: `https://github.com/${repo}/pull/${pullRequest.number}`,
        merged: pullRequest.merged,
      },
    },
  });
}

function issuesEvent(
  repo: string,
  createdAt: string,
  action: string,
  issue: { number: number; title: string },
) {
  return event({
    type: 'IssuesEvent',
    createdAt,
    repo,
    payload: {
      action,
      issue: {
        number: issue.number,
        title: issue.title,
        html_url: `https://github.com/${repo}/issues/${issue.number}`,
      },
    },
  });
}

function watchEvent(repo: string, createdAt: string, action = 'started') {
  return event({ type: 'WatchEvent', createdAt, repo, payload: { action } });
}

/** Push / PR(opened·merged·closed) / Issues / Watch / 기간 밖 / 무시 대상 이벤트를 모두 포함 */
function fixtureEvents(): GitHubEvent[] {
  return [
    pushEvent('octo/app', '2026-08-10T09:00:00.000Z', [
      { sha: 'a1', message: 'feat: 로그인 추가\n\n본문은 버린다' },
      { sha: 'a2', message: 'fix: 오타 수정' },
    ]),
    pushEvent('octo/lib', '2026-08-06T09:00:00.000Z', [{ sha: 'b1', message: 'chore: 의존성 갱신' }]),

    pullRequestEvent('octo/app', '2026-08-09T10:00:00.000Z', 'opened', {
      number: 12,
      title: '로그인 화면',
    }),
    pullRequestEvent('octo/lib', '2026-08-08T10:00:00.000Z', 'closed', {
      number: 34,
      title: '캐시 제거',
      merged: true,
    }),
    pullRequestEvent('octo/lib', '2026-08-07T10:00:00.000Z', 'closed', {
      number: 35,
      title: '실험 브랜치',
      merged: false,
    }),
    // 리뷰 요청 등 매핑 대상이 아닌 action 은 무시
    pullRequestEvent('octo/app', '2026-08-09T11:00:00.000Z', 'review_requested', {
      number: 12,
      title: '로그인 화면',
    }),

    issuesEvent('octo/app', '2026-08-05T10:00:00.000Z', 'opened', { number: 7, title: '버그 신고' }),
    issuesEvent('octo/docs', '2026-08-05T12:00:00.000Z', 'closed', {
      number: 3,
      title: '문서 오탈자',
    }),

    watchEvent('vercel/next.js', '2026-08-10T12:00:00.000Z'),
    // WatchEvent 는 started 만 스타로 센다
    watchEvent('vercel/next.js', '2026-08-10T13:00:00.000Z', 'deleted'),

    // 매핑 규칙 표에 없는 이벤트
    event({ type: 'ForkEvent', createdAt: '2026-08-10T14:00:00.000Z', repo: 'octo/forked' }),

    // 기간 밖 (from 이전)
    pushEvent('octo/legacy', '2026-07-20T09:00:00.000Z', [{ sha: 'z9', message: '기간 밖 커밋' }]),
    pullRequestEvent('octo/legacy', '2026-07-21T09:00:00.000Z', 'opened', {
      number: 99,
      title: '기간 밖 PR',
    }),
  ];
}

describe('buildActivitySummary', () => {
  it('기간 내 이벤트만 커밋·PR·이슈·스타로 집계한다 (AC-1.5)', () => {
    const summary = buildActivitySummary(fixtureEvents(), PERIOD, false);

    expect(summary.counts.commits).toBe(3);
    expect(summary.counts.pullRequests).toEqual({ total: 3, opened: 1, merged: 1, closed: 1 });
    expect(summary.counts.issues).toEqual({ total: 2, opened: 1, closed: 1 });
    expect(summary.counts.stars).toBe(1);
    expect(summary.totalCount).toBe(9);
  });

  it('기간 밖 이벤트를 제외한다 (AC-1.5)', () => {
    const summary = buildActivitySummary(fixtureEvents(), PERIOD, false);

    expect(summary.commits.map((commit) => commit.sha)).not.toContain('z9');
    expect(summary.pullRequests.map((pr) => pr.number)).not.toContain(99);
    expect(summary.repositories).not.toContain('octo/legacy');
  });

  it('커밋 메시지는 첫 줄만 보관하고 최신순으로 정렬한다', () => {
    const summary = buildActivitySummary(fixtureEvents(), PERIOD, false);

    expect(summary.commits[0]?.message).toBe('feat: 로그인 추가');
    expect(summary.commits.map((commit) => commit.sha)).toEqual(['a1', 'a2', 'b1']);
  });

  it('PR 상태를 opened / merged / closed 로 구분한다 (AC-1.5)', () => {
    const summary = buildActivitySummary(fixtureEvents(), PERIOD, false);

    const states = Object.fromEntries(summary.pullRequests.map((pr) => [pr.number, pr.state]));
    expect(states).toEqual({ 12: 'opened', 34: 'merged', 35: 'closed' });
  });

  it('같은 PR 의 opened·closed 가 모두 있으면 최신 상태 1건만 남긴다', () => {
    const events = [
      pullRequestEvent('octo/app', '2026-08-05T10:00:00.000Z', 'opened', {
        number: 21,
        title: '중복 PR',
      }),
      pullRequestEvent('octo/app', '2026-08-09T10:00:00.000Z', 'closed', {
        number: 21,
        title: '중복 PR',
        merged: true,
      }),
    ];

    const summary = buildActivitySummary(events, PERIOD, false);

    expect(summary.counts.pullRequests).toEqual({ total: 1, opened: 0, merged: 1, closed: 0 });
    expect(summary.pullRequests[0]?.state).toBe('merged');
    expect(summary.totalCount).toBe(1);
  });

  it('같은 이슈의 opened·closed 도 최신 상태 1건만 남긴다', () => {
    const events = [
      issuesEvent('octo/app', '2026-08-05T10:00:00.000Z', 'opened', { number: 5, title: '중복 이슈' }),
      issuesEvent('octo/app', '2026-08-08T10:00:00.000Z', 'closed', { number: 5, title: '중복 이슈' }),
    ];

    const summary = buildActivitySummary(events, PERIOD, false);

    expect(summary.counts.issues).toEqual({ total: 1, opened: 0, closed: 1 });
    expect(summary.issues[0]?.state).toBe('closed');
  });

  it('repositories 는 4개 배열의 합집합을 사전순으로 담는다 (AC-1.5 And)', () => {
    const summary = buildActivitySummary(fixtureEvents(), PERIOD, false);

    expect(summary.repositories).toEqual([
      'octo/app',
      'octo/docs',
      'octo/lib',
      'vercel/next.js',
    ]);
  });

  it('기간·truncated 는 입력을 그대로 반영한다 (C2)', () => {
    const summary = buildActivitySummary(fixtureEvents(), PERIOD, true);

    expect(summary.period).toEqual({
      days: 7,
      from: FROM.toISOString(),
      to: TO.toISOString(),
    });
    expect(summary.truncated).toBe(true);
  });

  it('기간 내 활동이 없으면 totalCount 가 0 이고 배열이 모두 비어 있다 (AC-1.7)', () => {
    const events = [
      pushEvent('octo/legacy', '2026-07-01T09:00:00.000Z', [{ sha: 'old', message: '옛 커밋' }]),
    ];

    const summary = buildActivitySummary(events, PERIOD, false);

    expect(summary.totalCount).toBe(0);
    expect(summary.commits).toEqual([]);
    expect(summary.pullRequests).toEqual([]);
    expect(summary.issues).toEqual([]);
    expect(summary.stars).toEqual([]);
    expect(summary.repositories).toEqual([]);
    expect(summary.counts).toEqual({
      commits: 0,
      pullRequests: { total: 0, opened: 0, merged: 0, closed: 0 },
      issues: { total: 0, opened: 0, closed: 0 },
      stars: 0,
    });
  });

  it('이벤트가 하나도 없어도 빈 요약을 반환한다 (AC-1.7)', () => {
    const summary = buildActivitySummary([], PERIOD, false);

    expect(summary.totalCount).toBe(0);
    expect(summary.repositories).toEqual([]);
  });
});
