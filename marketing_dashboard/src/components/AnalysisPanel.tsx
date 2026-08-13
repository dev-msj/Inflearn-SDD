'use client';

import { useDashboard } from '@/components/DashboardProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { Spinner } from '@/components/ui/Spinner';
import { useAnalysis } from '@/hooks/useAnalysis';
import { formatDateTime } from '@/lib/utils';
import type { AnalysisResult } from '@/types/domain';

/**
 * AI 분석 실행 버튼 + 기간 요약·하이라이트·인사이트 (AC-2.1 ~ AC-2.8).
 *
 * 분석과 콘텐츠 생성은 별도 2단계 액션이므로 이 패널은 분석만 담당한다 (Q3).
 */

const LOADING_MESSAGE = 'AI가 활동을 분석하고 있습니다…';
const LOW_VOLUME_MESSAGE = '활동량이 적어 초안 품질이 낮을 수 있습니다.';
const IDLE_MESSAGE = '분석을 실행하면 기간 요약·하이라이트·인사이트를 만들어 드립니다.';
const NO_ACTIVITY_MESSAGE = '분석할 활동이 없습니다. 다른 기간을 선택해 보세요.';
const ACTIVITY_PENDING_MESSAGE = '활동을 불러온 뒤 분석을 실행할 수 있습니다.';

function AnalysisResultView({ analysis }: { analysis: AnalysisResult }) {
  return (
    <div className="flex flex-col gap-6">
      {analysis.lowVolume ? (
        <p className="rounded-card border border-warn-border bg-warn-surface p-3 text-sm text-warn">
          {LOW_VOLUME_MESSAGE}
        </p>
      ) : null}

      <section>
        <h3 className="text-sm font-medium text-ink">기간 요약</h3>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink">
          {analysis.periodSummary}
        </p>
      </section>

      <section>
        <h3 className="text-sm font-medium text-ink">하이라이트</h3>
        <ul className="mt-2 flex flex-col gap-3">
          {analysis.highlights.map((highlight, index) => (
            <li
              key={`${index}-${highlight.title}`}
              className="rounded-card border border-border-subtle bg-surface-muted p-4"
            >
              <p className="text-sm font-semibold text-ink">{highlight.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">{highlight.description}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {highlight.evidence.map((evidence, evidenceIndex) => (
                  <li
                    key={`${evidenceIndex}-${evidence}`}
                    className="rounded-control border border-border-subtle bg-surface px-2 py-1 text-xs text-ink-muted"
                  >
                    {evidence}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-sm font-medium text-ink">인사이트</h3>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-ink-muted">
          {analysis.insights.map((insight, index) => (
            <li key={`${index}-${insight}`}>{insight}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function AnalysisPanel() {
  const { activity, activityStatus } = useDashboard();
  const { analysis, status, error, runAnalysis } = useAnalysis();

  // AC-2.1: 활동이 없거나 조회·분석이 진행 중이면 실행할 수 없다 (AC-1.6, AC-1.7)
  const disabled =
    !activity ||
    activity.totalCount === 0 ||
    activityStatus === 'loading' ||
    status === 'loading';

  return (
    <Card
      title="AI 분석"
      description="수집한 활동을 바탕으로 기간 서사를 정리합니다."
      actions={
        <Button onClick={() => void runAnalysis()} disabled={disabled} loading={status === 'loading'}>
          {analysis !== null ? '다시 분석' : '분석'}
        </Button>
      }
      footer={
        analysis !== null ? <span>생성 시각 {formatDateTime(analysis.generatedAt)}</span> : undefined
      }
    >
      {status === 'loading' ? (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner size="sm" label="분석 중" />
          <span>{LOADING_MESSAGE}</span>
        </div>
      ) : null}

      {status === 'error' && error !== null ? (
        // 분석 실패는 활동 요약에 영향을 주지 않는다 (AC-2.6)
        <ErrorNotice error={error} onRetry={() => void runAnalysis()} retryLabel="다시 분석" />
      ) : null}

      {status === 'success' && analysis !== null ? (
        <AnalysisResultView analysis={analysis} />
      ) : null}

      {status === 'idle' ? (
        <p className="text-sm text-ink-muted">
          {activity === null
            ? ACTIVITY_PENDING_MESSAGE
            : activity.totalCount === 0
              ? NO_ACTIVITY_MESSAGE
              : IDLE_MESSAGE}
        </p>
      ) : null}
    </Card>
  );
}

export default AnalysisPanel;
