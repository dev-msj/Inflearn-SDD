'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import { CopyButton } from './CopyButton';
import { DownloadButton } from './DownloadButton';
import { markFirstViewAction } from '@/app/actions/library.actions';

/**
 * 프롬프트 전문 열람 (F3-AC2, F3-AC6, F3-AC9).
 *
 * ★여기 도달했다는 것은 페이지가 이미 `assertTemplateAccess()`를 통과했다는 뜻이다.
 *   환불(REVOKED)·미구매 건은 페이지 단계에서 걸러지므로 이 컴포넌트가 그려지지 않는다(F3-AC9).
 *   즉 이 컴포넌트는 접근 통제를 하지 않으며, 하려고 해서도 안 된다.
 *
 * ★전문은 마스킹 없이 전부 표시한다. 이 화면과 CopyButton, 다운로드 라우트가
 *   같은 문자열을 다루므로 세 결과가 항상 일치한다(F3-AC3).
 *
 * ★"마지막 수정일"은 `body_updated_at`이다. 가격만 수정된 경우에는 값이 바뀌지 않는다(F3-AC6).
 *
 * ★최초 열람 기록은 마운트 후 1회만 보낸다.
 *   서버 렌더 중에 기록하면 프리페치·재검증에도 시각이 남아 환불 자격 판정이 왜곡된다(F2-AC12).
 */
interface PromptViewerProps {
  templateId: string;
  /** 프롬프트 전문 */
  body: string;
  /** ISO 문자열 (templates.body_updated_at) */
  bodyUpdatedAt: string;
}

export function PromptViewer({ templateId, body, bodyUpdatedAt }: PromptViewerProps) {
  const t = useTranslations('library.viewer');
  const format = useFormatter();

  // StrictMode의 이중 마운트에서도 액션 호출은 1회로 제한한다.
  const markedRef = useRef(false);

  useEffect(() => {
    if (markedRef.current) return;
    markedRef.current = true;

    // 기록 실패는 열람을 막지 않는다. 액션이 스스로 실패를 흡수하고 ok:false만 돌려준다.
    void markFirstViewAction(templateId);
  }, [templateId]);

  return (
    <section aria-labelledby="prompt-viewer-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="prompt-viewer-heading" className="text-lg font-semibold text-foreground">
            {t('heading')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('bodyUpdatedAt', {
              date: format.dateTime(new Date(bodyUpdatedAt), { dateStyle: 'medium' }),
            })}
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-2">
          <CopyButton text={body} />
          <DownloadButton templateId={templateId} />
        </div>
      </div>

      <pre className="whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-4 font-mono text-sm leading-relaxed text-foreground">
        {body}
      </pre>
    </section>
  );
}
