import { firstLine } from '@/lib/utils';
import type { GitHubEvent } from '@/lib/github';
import type {
  ActivityCounts,
  ActivitySummary,
  CommitActivity,
  IssueActivity,
  PeriodDays,
  PullRequestActivity,
  StarActivity,
} from '@/types/domain';

/**
 * GitHub 이벤트 → `ActivitySummary` 집계 (TECH_SPEC 3. 기능 1 > 1-B).
 *
 * **순수 함수만 둔다.** 네트워크 호출·환경 변수·현재 시각 접근이 없어야 테스트가 결정적이다.
 * 기간·`truncated` 는 호출자(`GET /api/activity`)가 주입한다.
 */

export interface ActivityPeriod {
  days: PeriodDays;
  from: Date;
  to: Date;
}

/** 이벤트 매핑 규칙 표의 이벤트 타입 */
const EVENT_TYPE = {
  push: 'PushEvent',
  pullRequest: 'PullRequestEvent',
  issues: 'IssuesEvent',
  watch: 'WatchEvent',
} as const;

/** `occurredAt` 내림차순 (최신 우선) */
function byOccurredAtDesc<T extends { occurredAt: string }>(a: T, b: T): number {
  return Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
}

/**
 * 같은 PR/이슈의 opened·closed 가 모두 있으면 최신 상태 1건만 남긴다(중복 계수 방지).
 * 키는 `저장소#번호`.
 */
function dedupeByLatest<T extends { repo: string; number: number; occurredAt: string }>(
  items: T[],
): T[] {
  const latest = new Map<string, T>();

  for (const item of items) {
    const key = `${item.repo}#${item.number}`;
    const previous = latest.get(key);
    if (previous === undefined || Date.parse(item.occurredAt) > Date.parse(previous.occurredAt)) {
      latest.set(key, item);
    }
  }

  return [...latest.values()];
}

/** `PullRequestEvent` 의 action·merged 조합 → 도메인 상태. 그 외 action 은 무시 */
function toPullRequestState(payloadAction: string | undefined, merged: boolean): PullRequestActivity['state'] | null {
  if (payloadAction === 'opened') return 'opened';
  if (payloadAction === 'closed') return merged ? 'merged' : 'closed';
  return null;
}

/** GitHub 이벤트 배열을 기간 필터링·분류·집계해 `ActivitySummary` 로 변환한다 */
export function buildActivitySummary(
  events: GitHubEvent[],
  period: ActivityPeriod,
  truncated: boolean,
): ActivitySummary {
  const fromMs = period.from.getTime();

  const commits: CommitActivity[] = [];
  const rawPullRequests: PullRequestActivity[] = [];
  const rawIssues: IssueActivity[] = [];
  const stars: StarActivity[] = [];

  for (const event of events) {
    const occurredAt = event.created_at;
    // 기간 필터: created_at >= from
    if (!Number.isFinite(Date.parse(occurredAt)) || Date.parse(occurredAt) < fromMs) continue;

    const repo = event.repo?.name ?? '';
    if (repo === '') continue;

    switch (event.type) {
      case EVENT_TYPE.push: {
        for (const commit of event.payload.commits ?? []) {
          commits.push({
            sha: commit.sha,
            message: firstLine(commit.message ?? ''),
            repo,
            occurredAt,
          });
        }
        break;
      }

      case EVENT_TYPE.pullRequest: {
        const pullRequest = event.payload.pull_request;
        if (pullRequest === undefined) break;

        const state = toPullRequestState(event.payload.action, pullRequest.merged === true);
        if (state === null) break;

        rawPullRequests.push({
          number: pullRequest.number,
          title: pullRequest.title,
          repo,
          state,
          url: pullRequest.html_url,
          occurredAt,
        });
        break;
      }

      case EVENT_TYPE.issues: {
        const issue = event.payload.issue;
        if (issue === undefined) break;
        if (event.payload.action !== 'opened' && event.payload.action !== 'closed') break;

        rawIssues.push({
          number: issue.number,
          title: issue.title,
          repo,
          state: event.payload.action,
          url: issue.html_url,
          occurredAt,
        });
        break;
      }

      case EVENT_TYPE.watch: {
        if (event.payload.action !== 'started') break;
        stars.push({ repo, occurredAt });
        break;
      }

      default:
        // 그 외 이벤트는 무시 (매핑 규칙 표)
        break;
    }
  }

  const pullRequests = dedupeByLatest(rawPullRequests).sort(byOccurredAtDesc);
  const issues = dedupeByLatest(rawIssues).sort(byOccurredAtDesc);
  commits.sort(byOccurredAtDesc);
  stars.sort(byOccurredAtDesc);

  const counts: ActivityCounts = {
    commits: commits.length,
    pullRequests: {
      total: pullRequests.length,
      opened: pullRequests.filter((item) => item.state === 'opened').length,
      merged: pullRequests.filter((item) => item.state === 'merged').length,
      closed: pullRequests.filter((item) => item.state === 'closed').length,
    },
    issues: {
      total: issues.length,
      opened: issues.filter((item) => item.state === 'opened').length,
      closed: issues.filter((item) => item.state === 'closed').length,
    },
    stars: stars.length,
  };

  // 4개 배열의 repo 합집합·사전순 (AC-1.5 And, AC-3.8 대조 기준)
  const repositories = [
    ...new Set([
      ...commits.map((item) => item.repo),
      ...pullRequests.map((item) => item.repo),
      ...issues.map((item) => item.repo),
      ...stars.map((item) => item.repo),
    ]),
  ].sort((a, b) => a.localeCompare(b));

  return {
    period: {
      days: period.days,
      from: period.from.toISOString(),
      to: period.to.toISOString(),
    },
    counts,
    commits,
    pullRequests,
    issues,
    stars,
    repositories,
    totalCount: commits.length + pullRequests.length + issues.length + stars.length,
    truncated,
  };
}
