import { useTranslations } from 'next-intl';
import Link from 'next/link';

import { cn } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import type { CategoryView } from '@/types/domain';

/**
 * 카테고리 필터 (F1-AC2).
 *
 * ★선택 상태의 단일 진실은 URL(`?category=`)이다.
 *   컴포넌트가 로컬 상태를 들고 있지 않으므로 새로고침·뒤로가기·링크 공유에서 결과가 항상 같다.
 *
 * ★검색어(`q`)를 항상 함께 실어 보낸다.
 *   카테고리를 바꿔도 검색어가 유지되어야 두 조건이 동시에 적용된다(F1-AC2 요구).
 *
 * 링크로 구현했기 때문에 JS 없이도 동작하고, 키보드 Tab만으로 전체 카테고리를 순회할 수 있다.
 */
interface CategoryFilterProps {
  categories: CategoryView[];
  /** 현재 선택된 카테고리 slug. 미선택(전체)이면 undefined */
  selectedSlug?: string;
  /** 유지해야 할 현재 검색어 */
  query?: string;
  locale: AppLocale;
}

function buildHref(locale: AppLocale, categorySlug: string | null, query: string | undefined): string {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (categorySlug) params.set('category', categorySlug);

  const search = params.toString();
  // 페이지는 항상 1부터 다시 본다. 다른 필터 결과의 3페이지로 남으면 빈 화면이 나온다.
  return search ? `/${locale}?${search}` : `/${locale}`;
}

export function CategoryFilter({ categories, selectedSlug, query, locale }: CategoryFilterProps) {
  const t = useTranslations('templates');
  const selected = categories.find((category) => category.slug === selectedSlug);

  const itemClass = (isActive: boolean) =>
    cn(
      'inline-flex items-center rounded-full border px-3 py-1.5 text-sm transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      isActive
        ? 'border-primary bg-primary font-semibold text-primary-foreground'
        : 'border-border bg-background text-foreground hover:bg-accent',
    );

  return (
    <section aria-labelledby="category-filter-heading" className="flex flex-col gap-2">
      <h2 id="category-filter-heading" className="text-sm font-medium text-foreground">
        {t('categoryLabel')}
      </h2>

      <ul className="flex flex-wrap gap-2">
        <li>
          <Link
            href={buildHref(locale, null, query)}
            aria-current={selected ? undefined : 'true'}
            className={itemClass(!selected)}
          >
            {t('categoryAll')}
          </Link>
        </li>
        {categories.map((category) => {
          const isActive = category.slug === selectedSlug;

          return (
            <li key={category.id}>
              <Link
                href={buildHref(locale, category.slug, query)}
                aria-current={isActive ? 'true' : undefined}
                className={itemClass(isActive)}
              >
                {category.name}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* 어떤 카테고리를 보고 있는지 텍스트로도 명시한다. 색상만으로 상태를 전달하지 않기 위함. */}
      {selected ? (
        <p className="text-sm text-muted-foreground">
          {t('categorySelected', { name: selected.name })}
        </p>
      ) : null}
    </section>
  );
}
