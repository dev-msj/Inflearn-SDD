'use client';

import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

/**
 * 전문 전체 복사 (F3-AC2).
 *
 * ★복사 대상은 화면에 표시된 것과 완전히 동일한 문자열이다(트림·정규화 없음).
 *   PromptViewer가 렌더한 body를 그대로 받아 클립보드에 넣는다.
 *
 * ★복사 완료는 토스트(aria-live 내장)로 알린다.
 *   시각적 확인만으로는 스크린리더 사용자가 성공 여부를 알 수 없기 때문이다.
 *
 * ★clipboard API는 보안 컨텍스트(HTTPS/localhost)에서만 동작한다.
 *   실패 시 조용히 넘어가지 않고 "직접 선택해 복사" 안내를 띄운다.
 */
interface CopyButtonProps {
  /** 복사할 프롬프트 전문 */
  text: string;
}

export function CopyButton({ text }: CopyButtonProps) {
  const t = useTranslations('library.viewer');
  const [isCopying, setIsCopying] = useState(false);

  async function handleCopy() {
    setIsCopying(true);
    try {
      await navigator.clipboard.writeText(text);
      toast({ description: t('copied'), variant: 'success' });
    } catch {
      toast({ description: t('copyFailed'), variant: 'destructive' });
    } finally {
      setIsCopying(false);
    }
  }

  return (
    <Button type="button" onClick={handleCopy} disabled={isCopying}>
      <Copy className="h-4 w-4" aria-hidden="true" />
      {t('copy')}
    </Button>
  );
}
