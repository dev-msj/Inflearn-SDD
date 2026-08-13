'use client';

import { ActivityPanel } from '@/components/ActivityPanel';
import { AnalysisPanel } from '@/components/AnalysisPanel';
import { ContentPanel } from '@/components/ContentPanel';
import { Header } from '@/components/Header';
import { PeriodSelector } from '@/components/PeriodSelector';

/**
 * 로그인 후 화면 합성 (AC-1.2, AC-1.6, AC-2.1, AC-3.1).
 *
 * `DashboardProvider` 하위에서 Header → PeriodSelector → ActivityPanel → AnalysisPanel →
 * ContentPanel 순으로 세로 배치한다. 상태는 전부 컨텍스트에서 오므로 이 컴포넌트는 props 를 받지 않는다.
 */
export function Dashboard() {
  return (
    <div className="min-h-full">
      <Header />

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-section px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-ink">활동 대시보드</h1>
          <PeriodSelector />
        </div>

        <ActivityPanel />
        <AnalysisPanel />
        <ContentPanel />
      </main>
    </div>
  );
}

export default Dashboard;
