import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * 전문 다운로드 (F3-AC3).
 *
 * ★파일 내용을 클라이언트가 만들지 않는다.
 *   Blob을 조립하면 화면 텍스트와 파일 내용이 미세하게 달라질 수 있고(개행 처리 등),
 *   무엇보다 소유권 검증과 "최초 다운로드 시각" 기록이 서버에서 일어나야 한다.
 *   따라서 서버 라우트(`/api/library/{templateId}/download`)를 호출만 하고,
 *   파일명·Content-Disposition·no-store 헤더는 전부 라우트가 책임진다.
 *
 * ★버튼이 아니라 링크(`<a>`)다. 실제 동작이 "리소스 가져오기"이므로 링크가 올바른 시맨틱이고,
 *   JS 없이도 동작한다.
 */
interface DownloadButtonProps {
  templateId: string;
}

export function DownloadButton({ templateId }: DownloadButtonProps) {
  const t = useTranslations('library.viewer');

  return (
    <span className="flex flex-col gap-1">
      <a
        href={`/api/library/${encodeURIComponent(templateId)}/download`}
        // 파일명은 서버의 Content-Disposition이 정한다. 값 없는 download 속성은 "저장" 의도만 전달한다.
        download
        className={cn(buttonVariants({ variant: 'outline' }))}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        {t('download')}
      </a>
      <span className="text-xs text-muted-foreground">{t('downloadHint')}</span>
    </span>
  );
}
