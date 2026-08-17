import { firstLine } from '@/lib/utils';
import type { GitHubEvent, GitHubRepoCommit } from '@/lib/github';
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

/** 기간 필터를 통과하는 이벤트인지 (`created_at >= from`) */
function withinPeriod(occurredAt: string, fromMs: number): boolean {
  const parsed = Date.parse(occurredAt);
  return Number.isFinite(parsed) && parsed >= fromMs;
}

/**
 * 기간 내 `PushEvent` 가 발생한 저장소 목록(중복 제거·사전순).
 *
 * 커밋 본문은 Events API 에 없으므로, 호출자가 이 목록으로
 * `GET /repos/{owner}/{repo}/commits` 를 돌아 커밋을 채운다.
 */
export function collectPushedRepositories(events: GitHubEvent[], period: ActivityPeriod): string[] {
  const fromMs = period.from.getTime();
  const repositories = new Set<string>();

  for (const event of events) {
    if (event.type !== EVENT_TYPE.push) continue;
    if (!withinPeriod(event.created_at, fromMs)) continue;

    const repo = event.repo?.name ?? '';
    if (repo !== '') repositories.add(repo);
  }

  return [...repositories].sort((a, b) => a.localeCompare(b));
}

/** `GET /repos/{owner}/{repo}/commits` 응답 → 도메인 커밋 활동 */
export function toCommitActivities(repo: string, commits: GitHubRepoCommit[]): CommitActivity[] {
  return commits.flatMap((commit) => {
    const occurredAt = commit.commit?.author?.date ?? '';
    if (typeof commit.sha !== 'string' || commit.sha === '' || occurredAt === '') return [];

    return [
      {
        sha: commit.sha,
        message: firstLine(commit.commit?.message ?? ''),
        repo,
        occurredAt,
      },
    ];
  });
}

/** `PullRequestEvent` 의 action·merged 조합 → 도메인 상태. 그 외 action 은 무시 */
function toPullRequestState(payloadAction: string | undefined, merged: boolean): PullRequestActivity['state'] | null {
  if (payloadAction === 'opened') return 'opened';
  if (payloadAction === 'closed') return merged ? 'merged' : 'closed';
  return null;
}

/**
 * GitHub 이벤트 + 별도 조회한 커밋을 기간 필터링·분류·집계해 `ActivitySummary` 로 변환한다.
 *
 * 커밋을 **인자로 받는** 이유: Events API 의 `PushEvent` payload 에 커밋이 없어
 * `GET /repos/{owner}/{repo}/commits` 를 따로 호출해야 하는데,
 * 이 함수는 네트워크를 모르는 순수 함수로 유지해야 하기 때문이다.
 */
export function buildActivitySummary(
  events: GitHubEvent[],
  repoCommits: CommitActivity[],
  period: ActivityPeriod,
  truncated: boolean,
): ActivitySummary {
  const fromMs = period.from.getTime();

  // 커밋도 같은 기간 규칙을 적용한다 (조회 시 since/until 을 걸지만 방어적으로 한 번 더)
  const commits = repoCommits.filter((commit) => withinPeriod(commit.occurredAt, fromMs));
  const rawPullRequests: PullRequestActivity[] = [];
  const rawIssues: IssueActivity[] = [];
  const stars: StarActivity[] = [];

  for (const event of events) {
    const occurredAt = event.created_at;
    // 기간 필터: created_at >= from
    if (!withinPeriod(occurredAt, fromMs)) continue;

    const repo = event.repo?.name ?? '';
    if (repo === '') continue;

    switch (event.type) {
      // PushEvent 는 여기서 처리하지 않는다 — payload 에 커밋이 없어
      // `collectPushedRepositories` → `fetchRepoCommits` 경로로 대체됐다

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
