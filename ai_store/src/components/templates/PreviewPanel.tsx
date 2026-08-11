import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { PREVIEW_RATIO } from '@/server/templates/preview';

/**
 * 마스킹 미리보기 (F1-AC5, F1-AC6).
 *
 * ★이 컴포넌트는 프롬프트 전문을 절대 받지 않는다.
 *   props 타입에 `body`가 존재하지 않으므로, 실수로 전문을 넘기면 컴파일이 실패한다.
 *   화면에 그리는 것은 서버가 저장 시점에 만들어 둔 `preview_text`(앞 30% 이하)뿐이다.
 *
 * ★가려진 구간은 "감춘 텍스트"가 아니라 **텍스트가 아예 없는 장식 블록**이다.
 *   CSS blur나 잘라내기로 감추면 DOM·페이지 소스·복사에 원문이 남는다.
 *   장식 블록에는 `aria-hidden`을 걸어 스크린리더가 의미 없는 막대를 읽지 않게 한다.
 *
 * ★`@/server/templates/preview`(server-only)를 import 하는 것은 의도된 안전장치다.
 *   누군가 이 컴포넌트를 클라이언트 컴포넌트로 바꾸면 빌드가 즉시 실패한다.
 */
interface PreviewPanelProps {
  /** 서버가 생성해 저장한 미리보기 텍스트. 전문이 아니다. */
  previewText: string;
  /** 가려진 글자 수 (templates.masked_char_count) */
  maskedCharCount: number;
}

/** 장식용 마스킹 막대의 개수. 내용과 무관한 고정 값이다. */
const MASK_BAR_COUNT = 4;
const MASK_BAR_WIDTHS = ['w-full', 'w-11/12', 'w-10/12', 'w-8/12'] as const;

export function PreviewPanel({ previewText, maskedCharCount }: PreviewPanelProps) {
  const t = useTranslations('preview');
  const percent = Math.round(PREVIEW_RATIO * 100);

  return (
    <section aria-labelledby="preview-heading" className="flex flex-col gap-3">
      <h2 id="preview-heading" className="text-lg font-semibold text-foreground">
        {t('heading')}
      </h2>

      <p className="text-sm text-muted-foreground">{t('ratioNotice', { percent })}</p>

      <div className="overflow-hidden rounded-lg border border-border bg-muted/40">
        <pre className="whitespace-pre-wrap break-words p-4 font-mono text-sm leading-relaxed text-foreground">
          {previewText}
        </pre>

        <div className="flex flex-col gap-2 border-t border-border p-4" aria-hidden="true">
          {Array.from({ length: MASK_BAR_COUNT }, (_, index) => (
            <span
              key={index}
              className={`block h-4 rounded bg-muted-foreground/25 ${MASK_BAR_WIDTHS[index] ?? 'w-full'}`}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-background p-4">
          <Lock className="h-4 w-4 text-muted-foreground" aria-label={t('lockedIconLabel')} />
          <p className="text-sm font-medium text-foreground">{t('lockedNotice')}</p>
          <p className="text-sm text-muted-foreground">
            {t('maskedNotice', { count: maskedCharCount })}
          </p>
        </div>
      </div>
    </section>
  );
}
