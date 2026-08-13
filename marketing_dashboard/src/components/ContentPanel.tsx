'use client';

import { useDashboard } from '@/components/DashboardProvider';
import { DraftCard } from '@/components/DraftCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useContent } from '@/hooks/useContent';
import { PLATFORM_ORDER } from '@/lib/constants';

/**
 * 콘텐츠 생성 실행 + 플랫폼별 초안 카드 그리드 (AC-3.1 ~ AC-3.10).
 *
 * 분석과 콘텐츠 생성은 별도 2단계 액션이므로 분석 결과가 있어야 실행할 수 있다 (Q3, AC-3.1).
 */

/** 생성 여부와 무관하게 항상 표시하는 안내 (AC-3.8 And) */
const AI_NOTICE = 'AI가 생성한 초안입니다. 게시 전 내용을 확인해 주세요.';
const ANALYSIS_REQUIRED_MESSAGE = '먼저 AI 분석을 실행하면 초안을 만들 수 있습니다.';

export function ContentPanel() {
  const { activity, analysis, analysisStatus, drafts } = useDashboard();
  const { statusOf, errorOf, generateAll, regenerate, editDraft, isBusy } = useContent();

  // AC-3.1: 분석 결과가 없거나 분석·생성이 진행 중이면 실행할 수 없다
  const disabled = analysis === null || isBusy || analysisStatus === 'loading';
  const hasAnyDraft = drafts.length > 0;
  const knownRepositories = activity?.repositories ?? [];

  return (
    <Card
      title="콘텐츠 초안"
      description="분석 결과를 LinkedIn·X·블로그 초안으로 옮깁니다."
      actions={
        <Button onClick={() => void generateAll()} disabled={disabled} loading={isBusy}>
          {hasAnyDraft ? '전체 다시 생성' : '콘텐츠 생성'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="rounded-card border border-border-subtle bg-surface-muted p-3 text-sm text-ink-muted">
          {AI_NOTICE}
        </p>

        {analysis === null ? (
          <p className="text-sm text-ink-muted">{ANALYSIS_REQUIRED_MESSAGE}</p>
        ) : null}

        {/* 3개 카드를 동시에 노출한다 (AC-3.2). 각 카드는 자기 플랫폼의 상태만 본다 (AC-3.10) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {PLATFORM_ORDER.map((platform) => (
            <DraftCard
              key={platform}
              platform={platform}
              draft={drafts.find((draft) => draft.platform === platform) ?? null}
              status={statusOf(platform)}
              error={errorOf(platform)}
              knownRepositories={knownRepositories}
              canRegenerate={analysis !== null}
              onEdit={(content) => editDraft(platform, content)}
              onRegenerate={() => void regenerate(platform)}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}

export default ContentPanel;
