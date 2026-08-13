'use client';

import { Card } from '@/components/ui/Card';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { Spinner } from '@/components/ui/Spinner';
import { useActivity } from '@/hooks/useActivity';
import { formatDateRange } from '@/lib/utils';
import type { ActivitySummary } from '@/types/domain';

/**
 * 커밋·PR·이슈·스타 건수와 저장소 목록 (AC-1.5 ~ AC-1.8).
 *
 * 하단에 "공개 저장소 활동 기준입니다." 를 상시 표시한다 (Q1).
 */

const EMPTY_MESSAGE = '선택한 기간에 활동 기록이 없습니다. 다른 기간을 선택해 보세요.';
const PUBLIC_ONLY_NOTICE = '공개 저장소 활동 기준입니다.';
const TRUNCATED_NOTICE = 'GitHub API 제한으로 최근 300건까지만 조회되었습니다.';

/** 항목별 저장소명 (중복 제거·사전순) */
function distinctRepos(items: readonly { repo: string }[]): string[] {
  return [...new Set(items.map((item) => item.repo))].sort((a, b) => a.localeCompare(b));
}

function CountCard({
  label,
  count,
  breakdown,
  repos,
}: {
  label: string;
  count: number;
  breakdown?: string;
  repos: string[];
}) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface-muted p-4">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">
        {count}
        <span className="ml-1 text-sm font-normal text-ink-muted">건</span>
      </p>
      {breakdown !== undefined ? <p className="mt-1 text-xs text-ink-muted">{breakdown}</p> : null}
      {repos.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-0.5 text-xs text-ink-muted">
          {repos.map((repo) => (
            <li key={repo} className="truncate">
              {repo}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ActivityCounts({ activity }: { activity: ActivitySummary }) {
  const { counts } = activity;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CountCard label="커밋" count={counts.commits} repos={distinctRepos(activity.commits)} />
        <CountCard
          label="Pull Request"
          count={counts.pullRequests.total}
          breakdown={`생성 ${counts.pullRequests.opened} · 머지 ${counts.pullRequests.merged} · 종료 ${counts.pullRequests.closed}`}
          repos={distinctRepos(activity.pullRequests)}
        />
        <CountCard
          label="이슈"
          count={counts.issues.total}
          breakdown={`생성 ${counts.issues.opened} · 종료 ${counts.issues.closed}`}
          repos={distinctRepos(activity.issues)}
        />
        <CountCard label="스타" count={counts.stars} repos={distinctRepos(activity.stars)} />
      </div>

      <div>
        <h3 className="text-sm font-medium text-ink">활동 저장소 ({activity.repositories.length})</h3>
        <ul className="mt-2 flex flex-wrap gap-2">
          {activity.repositories.map((repo) => (
            <li
              key={repo}
              className="rounded-control border border-border-subtle bg-surface px-2 py-1 text-xs text-ink-muted"
            >
              {repo}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ActivityPanel() {
  const { activity, status, error, refresh } = useActivity();

  const description =
    activity !== null ? formatDateRange(activity.period.from, activity.period.to) : undefined;

  return (
    <Card
      title="활동 요약"
      description={description}
      footer={
        <>
          <span>{PUBLIC_ONLY_NOTICE}</span>
          {activity?.truncated === true ? (
            <span className="mt-1 block text-warn">{TRUNCATED_NOTICE}</span>
          ) : null}
        </>
      }
    >
      {status === 'loading' ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <Spinner size="sm" label="활동을 불러오는 중" />
            <span>활동을 불러오는 중입니다…</span>
          </div>
          <div
            aria-hidden="true"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className="h-24 animate-pulse rounded-card border border-border-subtle bg-surface-muted"
              />
            ))}
          </div>
        </div>
      ) : null}

      {status === 'error' && error !== null ? (
        <ErrorNotice error={error} onRetry={() => void refresh()} />
      ) : null}

      {status === 'success' && activity !== null ? (
        activity.totalCount === 0 ? (
          <p className="text-sm text-ink-muted">{EMPTY_MESSAGE}</p>
        ) : (
          <ActivityCounts activity={activity} />
        )
      ) : null}

      {status === 'idle' ? (
        <p className="text-sm text-ink-muted">기간을 선택하면 활동을 불러옵니다.</p>
      ) : null}
    </Card>
  );
}

export default ActivityPanel;
