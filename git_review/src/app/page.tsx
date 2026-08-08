'use client';

/**
 * 단일 화면 대시보드 (TECH_SPEC §2 app/page.tsx)
 *
 * 구성: 로그인 게이트 → 3단 워크플로(① 저장소 선택 ② 문서 업로드·산출물 추출 ③ 검증 실행·결과)
 *
 * 담당 PRD 수용 기준
 *  - 1-1: authenticated가 false면 LoginGate만, true면 AppHeader에 계정명·프로필 이미지
 *  - 1-3: 선택한 저장소를 SelectedRepoBanner로 상단 고정 표시
 *  - 1-6 (에러): 콜백이 넘긴 ?error=코드를 읽어 로그인 화면에 안내 문구를 띄운다.
 *  - 2-5 (엣지): 추출 0건이어도 ArtifactAddForm을 상시 노출해 검증을 계속 진행할 수 있게 한다.
 *  - 3-3: ResultFilterTabs(panelId)와 ResultChecklist(id)에 같은 문자열을 넘겨 tab↔tabpanel을 연결한다.
 */
import { useEffect, useMemo, useState } from 'react';

import { AppHeader } from '@/components/AppHeader';
import { ArtifactAddForm } from '@/components/ArtifactAddForm';
import { ArtifactList } from '@/components/ArtifactList';
import { ComplianceSummary } from '@/components/ComplianceSummary';
import { DocumentList } from '@/components/DocumentList';
import { DocumentUploader } from '@/components/DocumentUploader';
import { ErrorNotice } from '@/components/ErrorNotice';
import { LoginGate } from '@/components/LoginGate';
import { RepoPicker } from '@/components/RepoPicker';
import { ResultChecklist } from '@/components/ResultChecklist';
import { ResultFilterTabs } from '@/components/ResultFilterTabs';
import { SelectedRepoBanner } from '@/components/SelectedRepoBanner';
import { VerifyRunner } from '@/components/VerifyRunner';
import { useDocumentUpload } from '@/hooks/useDocumentUpload';
import { useExpectedArtifacts } from '@/hooks/useExpectedArtifacts';
import { useRepoList } from '@/hooks/useRepoList';
import { useSession } from '@/hooks/useSession';
import { useVerification } from '@/hooks/useVerification';
import { ERROR_CATALOG, type AppErrorCode } from '@/lib/errors';
import { resolveErrorMessage } from '@/state/AppStateProvider';

/** ResultFilterTabs(panelId) ↔ ResultChecklist(id) 연결용 단일 식별자 */
const RESULT_PANEL_ID = 'verification-result-panel';

const STEP_LABELS = {
  repo: '1단계',
  documents: '2단계',
  verify: '3단계',
} as const;

const DISABLED_REASONS = {
  noRepo: '검증 대상 저장소를 먼저 선택해 주세요.',
  noArtifacts: '기대 산출물이 1개 이상 있어야 검증할 수 있습니다. 문서를 업로드하거나 경로를 직접 추가해 주세요.',
} as const;

/** 쿼리로 전달된 값이 실제 에러 코드인지 확인한다. */
function toErrorCode(value: string | null): AppErrorCode | null {
  if (value === null) return null;
  return value in ERROR_CATALOG ? (value as AppErrorCode) : null;
}

export default function DashboardPage() {
  const session = useSession();
  const repoList = useRepoList();
  const upload = useDocumentUpload();
  const expected = useExpectedArtifacts();
  const verification = useVerification();

  const [authErrorCode, setAuthErrorCode] = useState<AppErrorCode | null>(null);

  /**
   * 인증 콜백이 붙여준 ?error= 코드를 읽는다.
   * useSearchParams는 Suspense 경계를 요구하므로 마운트 이후 location에서 직접 읽고,
   * 새로고침 시 문구가 반복되지 않도록 쿼리를 지운다.
   */
  useEffect(() => {
    const code = toErrorCode(new URLSearchParams(window.location.search).get('error'));
    if (code === null) return;
    setAuthErrorCode(code);
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const { runExtraction } = expected;
  const { documents } = upload;

  // 문서가 추가·제거되면 즉시 재추출한다. (수동 추가 항목은 리듀서가 보존한다)
  useEffect(() => {
    runExtraction(documents);
  }, [documents, runExtraction]);

  const uploadRejections = upload.rejections;
  const uploadErrorMessage =
    uploadRejections.length === 1
      ? uploadRejections[0].error.userMessage
      : `${uploadRejections.length}개 파일을 업로드하지 못했습니다`;
  const uploadErrorDetails =
    uploadRejections.length > 1 ? uploadRejections.map((rejection) => rejection.error.userMessage) : undefined;

  const report = verification.report;
  const filterCounts = useMemo(() => {
    const items = report?.items ?? [];
    return {
      all: items.length,
      missing: items.filter((item) => item.status === 'missing').length,
    };
  }, [report]);

  const canRun = repoList.selectedRepo !== null && expected.totalCount > 0;
  const disabledReason =
    repoList.selectedRepo === null
      ? DISABLED_REASONS.noRepo
      : expected.totalCount === 0
        ? DISABLED_REASONS.noArtifacts
        : undefined;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        user={session.user}
        onLogout={session.authenticated ? session.logout : undefined}
        isLoggingOut={session.isLoggingOut}
      />

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6">
        <h1 className="sr-only">git_review 산출물 검증 대시보드</h1>

        {session.isLoading ? (
          <p role="status" aria-live="polite" className="text-sm text-ink-muted">
            로그인 상태를 확인하는 중입니다
          </p>
        ) : null}

        {!session.isLoading && !session.authenticated ? (
          <LoginGate error={authErrorCode !== null ? { code: authErrorCode } : null} />
        ) : null}

        {session.authenticated ? (
          <div className="flex w-full flex-col gap-8">
            <SelectedRepoBanner repo={repoList.selectedRepo} />

            {/* ① 검증 대상 저장소 선택 */}
            <section aria-label="1단계: 검증 대상 저장소 선택" className="flex flex-col gap-3">
              <p className="text-xs font-bold tracking-wide text-brand-strong">{STEP_LABELS.repo}</p>
              <RepoPicker
                repos={repoList.visibleRepos}
                totalCount={repoList.repos.length}
                query={repoList.query}
                onQueryChange={repoList.setQuery}
                selectedRepo={repoList.selectedRepo}
                onSelectRepo={repoList.selectRepo}
                hasNext={repoList.hasNext}
                isLoading={repoList.isLoading}
                onLoadMore={() => void repoList.loadMore()}
                error={
                  repoList.error !== null
                    ? {
                        code: repoList.error.code,
                        message: resolveErrorMessage(repoList.error),
                        retryable: repoList.error.retryable,
                      }
                    : null
                }
                onRetry={() => void repoList.retry()}
              />
            </section>

            {/* ② 스펙 문서 업로드 및 기대 산출물 추출 */}
            <section aria-label="2단계: 스펙 문서 업로드 및 기대 산출물 추출" className="flex flex-col gap-4">
              <p className="text-xs font-bold tracking-wide text-brand-strong">{STEP_LABELS.documents}</p>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-3">
                  <DocumentUploader
                    onFilesSelected={(files) => void upload.addFiles(files)}
                    uploadedCount={upload.documents.length}
                    isProcessing={upload.isProcessing}
                  />

                  {uploadRejections.length > 0 ? (
                    <ErrorNotice
                      code={uploadRejections[0].error.code}
                      message={uploadErrorMessage}
                      details={uploadErrorDetails}
                      retryable={false}
                      onDismiss={upload.clearRejections}
                    />
                  ) : null}

                  <DocumentList documents={upload.documents} onRemove={upload.removeDocument} />
                </div>

                <div className="flex min-w-0 flex-col gap-3">
                  <ArtifactList
                    artifacts={expected.artifacts}
                    totalCount={expected.totalCount}
                    onRemoveArtifact={expected.removeArtifact}
                    isExtracting={expected.isExtracting}
                    hasDocuments={upload.documents.length > 0}
                  />
                  <ArtifactAddForm onAdd={expected.addManualArtifact} />
                </div>
              </div>
            </section>

            {/* ③ 검증 실행 및 결과 */}
            <section aria-label="3단계: 검증 실행 및 결과 확인" className="flex flex-col gap-4">
              <p className="text-xs font-bold tracking-wide text-brand-strong">{STEP_LABELS.verify}</p>

              <VerifyRunner
                status={verification.status}
                progress={verification.progress}
                phaseMessage={verification.phaseMessage}
                totalArtifacts={expected.totalCount}
                canRun={canRun}
                onRun={() => void verification.run()}
                disabledReason={disabledReason}
              />

              {verification.error !== null ? (
                <ErrorNotice
                  code={verification.error.code}
                  message={resolveErrorMessage(verification.error)}
                  onRetry={() => void verification.retry()}
                  retryLabel="검증 다시 실행"
                />
              ) : null}

              {report !== null ? (
                <>
                  <ComplianceSummary
                    score={report.score}
                    repoFullName={report.repo.fullName}
                    refName={report.ref}
                    repoEmpty={report.repoEmpty}
                    treeTruncated={report.treeTruncated}
                  />

                  <ResultFilterTabs
                    value={verification.filter}
                    onChange={verification.setFilter}
                    counts={filterCounts}
                    panelId={RESULT_PANEL_ID}
                  />

                  <ResultChecklist
                    id={RESULT_PANEL_ID}
                    items={verification.visibleItems}
                    filter={verification.filter}
                    isRunning={verification.status === 'running'}
                  />
                </>
              ) : null}
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}
