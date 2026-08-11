import { useTranslations } from 'next-intl';

import { TemplateCard } from './TemplateCard';
import type { AppLocale } from '@/i18n/routing';
import type { TemplateCardView } from '@/types/domain';

/**
 * 목록 그리드 (F1-AC1).
 *
 * - 360px에서는 1열, 그 이상에서 2·3열로 확장한다. 카드 최소 폭을 강제하지 않아
 *   좁은 화면에서도 가로 스크롤이 생기지 않는다(비기능 요구).
 * - `<ul>/<li>`로 감싸 스크린리더가 "목록, 항목 N개"를 먼저 안내하게 한다.
 * - 0건 처리는 이 컴포넌트가 하지 않는다. 검색 0건 안내(F1-AC7)는 `EmptyResult`의 책임이며,
 *   호출부가 둘 중 하나를 선택해 렌더한다.
 */
interface TemplateGridProps {
  items: TemplateCardView[];
  locale: AppLocale;
  /** 결과 개수 안내를 표시할지. 검색·필터 화면에서만 켠다. */
  total?: number;
}

export function TemplateGrid({ items, locale, total }: TemplateGridProps) {
  const t = useTranslations('templates');

  return (
    <div className="flex flex-col gap-4">
      {typeof total === 'number' ? (
        <p className="text-sm text-muted-foreground">{t('resultCount', { count: total })}</p>
      ) : null}

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.id} className="h-full">
            <TemplateCard template={item} locale={locale} />
          </li>
        ))}
      </ul>
    </div>
  );
}
