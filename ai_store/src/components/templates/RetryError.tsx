'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

/**
 * 로드 실패 안내 + 재시도 (F1-AC9).
 *
 * `error.tsx` 경계는 반드시 클라이언트 컴포넌트이고 `reset()`을 함수로 넘겨야 하므로
 * 이 컴포넌트도 클라이언트여야 한다.
 *
 * ★빈 화면 대신 항상 "무엇이 실패했는지 + 무엇을 할 수 있는지"를 함께 보여준다.
 *   `role="alert"`로 즉시 안내되며, 재시도 버튼이 자동 포커스 대상이 되도록 첫 상호작용 요소로 둔다.
 *
 * ★서버 오류 원문(error.message)은 표시하지 않는다. 내부 구조·쿼리가 노출될 수 있다.
 */
interface RetryErrorProps {
  /** 목록 실패인지 상세 실패인지에 따라 안내 제목이 달라진다. */
  scope: 'list' | 'detail';
  /** Next.js error boundary의 reset() */
  onRetry: () => void;
}

export function RetryError({ scope, onRetry }: RetryErrorProps) {
  const t = useTranslations('templates.error');

  return (
    <section
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-destructive/40 bg-background px-4 py-12 text-center"
    >
      <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-foreground">
        {scope === 'list' ? t('listTitle') : t('detailTitle')}
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">{t('description')}</p>
      <Button type="button" onClick={onRetry}>
        {t('action')}
      </Button>
    </section>
  );
}
