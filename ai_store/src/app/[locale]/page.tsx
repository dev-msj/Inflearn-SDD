import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { CategoryFilter } from '@/components/templates/CategoryFilter';
import { EmptyResult } from '@/components/templates/EmptyResult';
import { Pagination } from '@/components/templates/Pagination';
import { SearchBar } from '@/components/templates/SearchBar';
import { TemplateGrid } from '@/components/templates/TemplateGrid';
import { listCategories, listTemplates } from '@/server/templates/template.service';
import { isAppLocale } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';

/**
 * 템플릿 목록 (F1-AC1/2/3/7).
 *
 * ★검색어·카테고리·페이지의 단일 진실은 URL이다.
 *   이 페이지가 `searchParams`를 정규화해 서비스와 컴포넌트에 **같은 값**을 내려보내므로,
 *   화면 표시와 조회 조건이 어긋날 수 없다. 컴포넌트는 자체 상태를 들고 있지 않다.
 *
 * ★목록 응답(TemplateCardView)에는 프롬프트 전문은 물론 미리보기 텍스트도 없다(F1-AC6).
 */

// 세션 표시(Header)와 검색 조건이 요청마다 달라지므로 항상 요청 시점에 렌더한다.
// 빌드 타임에 DB로 접근하지 않게 하는 목적도 겸한다.
export const dynamic = 'force-dynamic';

type SearchParamValue = string | string[] | undefined;

interface TemplatesPageProps {
  // Next.js 15: params/searchParams는 Promise다.
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, SearchParamValue>>;
}

/** 같은 키가 두 번 오면(`?q=a&q=b`) 첫 값만 사용한다. 조회 조건이 배열이 되는 것을 막는다. */
function readSingle(value: SearchParamValue): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

/** 페이지 번호 정규화. 음수·문자열·과대값은 1페이지로 되돌린다. */
function readPage(value: SearchParamValue): number {
  const parsed = Number(readSingle(value));
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

export default async function TemplatesPage({ params, searchParams }: TemplatesPageProps) {
  const { locale: rawLocale } = await params;
  if (!isAppLocale(rawLocale)) notFound();
  const locale: AppLocale = rawLocale;

  const query = await searchParams;
  const q = readSingle(query.q);
  const category = readSingle(query.category);
  const page = readPage(query.page);

  const [t, result, categories] = await Promise.all([
    getTranslations('templates'),
    listTemplates({ q, categorySlug: category, page, locale }),
    listCategories(locale),
  ]);

  const isFiltered = Boolean(q || category);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">{t('listTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('listDescription')}</p>
      </header>

      <SearchBar locale={locale} initialQuery={q ?? ''} category={category} />

      <CategoryFilter categories={categories} selectedSlug={category} query={q} locale={locale} />

      {result.items.length === 0 ? (
        // 검색·필터 결과가 0건이면 안내와 전체 목록 복귀 경로를 준다(F1-AC7).
        <EmptyResult locale={locale} />
      ) : (
        <>
          <TemplateGrid items={result.items} locale={locale} total={isFiltered ? result.total : undefined} />
          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            locale={locale}
            query={q}
            category={category}
          />
        </>
      )}
    </div>
  );
}
