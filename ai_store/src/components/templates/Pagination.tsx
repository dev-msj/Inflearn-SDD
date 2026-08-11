import { useTranslations } from 'next-intl';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';

/**
 * 페이지 이동 (F1-AC1의 "한 페이지 20개 단위").
 *
 * - 이전/다음 링크와 "n / m 페이지" 표시만 둔다. 전체 페이지 번호를 나열하면
 *   360px 화면에서 가로로 넘친다.
 * - 이동 수단은 링크다. 서버 컴포넌트가 그대로 다시 조회하므로 클라이언트 상태가 필요 없다.
 * - 경계에서는 링크를 렌더하지 않고 비활성 표시만 남긴다. 눌러도 아무 일이 없는 링크는
 *   키보드 사용자에게 혼란을 준다.
 */
interface PaginationProps {
  page: number;
  totalPages: number;
  locale: AppLocale;
  /** 유지해야 할 현재 검색어 */
  query?: string;
  /** 유지해야 할 현재 카테고리 */
  category?: string;
}

function buildHref(
  locale: AppLocale,
  page: number,
  query: string | undefined,
  category: string | undefined,
): string {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (category) params.set('category', category);
  if (page > 1) params.set('page', String(page));

  const search = params.toString();
  return search ? `/${locale}?${search}` : `/${locale}`;
}

export function Pagination({ page, totalPages, locale, query, category }: PaginationProps) {
  const t = useTranslations('templates');
  const tCommon = useTranslations('common');

  if (totalPages <= 1) return null;

  const hasPrevious = page > 1;
  const hasNext = page < totalPages;
  const linkClass = cn(buttonVariants({ variant: 'outline', size: 'sm' }));
  const disabledClass = cn(linkClass, 'pointer-events-none opacity-60');

  return (
    <nav aria-label={t('pagination.label')} className="flex items-center justify-center gap-3 py-4">
      {hasPrevious ? (
        <Link
          href={buildHref(locale, page - 1, query, category)}
          rel="prev"
          aria-label={t('pagination.goToPage', { page: page - 1 })}
          className={linkClass}
        >
          {tCommon('previous')}
        </Link>
      ) : (
        <span aria-hidden="true" className={disabledClass}>
          {tCommon('previous')}
        </span>
      )}

      <p aria-live="polite" className="text-sm text-muted-foreground">
        {t('pagination.page', { page, totalPages })}
      </p>

      {hasNext ? (
        <Link
          href={buildHref(locale, page + 1, query, category)}
          rel="next"
          aria-label={t('pagination.goToPage', { page: page + 1 })}
          className={linkClass}
        >
          {tCommon('next')}
        </Link>
      ) : (
        <span aria-hidden="true" className={disabledClass}>
          {tCommon('next')}
        </span>
      )}
    </nav>
  );
}
