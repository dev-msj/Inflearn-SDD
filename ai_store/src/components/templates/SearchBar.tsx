'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AppLocale } from '@/i18n/routing';

/**
 * 검색 입력 (F1-AC3).
 *
 * ★검색어의 단일 진실도 URL(`?q=`)이다.
 *   입력값은 타이핑 중의 임시 상태일 뿐이고, 확정되면 URL로 옮겨 서버 컴포넌트가 다시 조회한다.
 *
 * 디바운스 300ms: 글자마다 서버 조회를 보내면 "입력 완료 후 1초 이내"라는 성능 기준을
 * 만족하더라도 불필요한 쿼리가 쌓인다.
 *
 * `<form>`으로 감싸 Enter 제출을 지원한다. JS가 아직 로드되지 않아도 GET 제출로 동작한다.
 */

const DEBOUNCE_MS = 300;
const INPUT_ID = 'template-search';

interface SearchBarProps {
  locale: AppLocale;
  /** URL에서 읽은 현재 검색어 */
  initialQuery?: string;
  /** 함께 유지할 카테고리 필터 */
  category?: string;
}

export function SearchBar({ locale, initialQuery = '', category }: SearchBarProps) {
  const t = useTranslations('templates');
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  // 마지막으로 URL에 반영된 검색어. 마운트 직후 불필요한 replace를 막는 기준값이다.
  const appliedRef = useRef(initialQuery);

  const buildHref = useCallback(
    (query: string) => {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (category) params.set('category', category);

      const search = params.toString();
      // 검색어가 바뀌면 항상 1페이지부터 본다(page 파라미터를 싣지 않는다).
      return search ? `/${locale}?${search}` : `/${locale}`;
    },
    [category, locale],
  );

  const apply = useCallback(
    (query: string) => {
      if (query.trim() === appliedRef.current.trim()) return;
      appliedRef.current = query;
      // replace: 글자마다 히스토리 항목이 쌓여 뒤로가기가 무력화되는 것을 막는다.
      router.replace(buildHref(query));
    },
    [buildHref, router],
  );

  useEffect(() => {
    const timer = setTimeout(() => apply(value), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [apply, value]);

  // URL이 외부 요인(카테고리 클릭, 뒤로가기)으로 바뀌면 입력값을 맞춘다.
  useEffect(() => {
    appliedRef.current = initialQuery;
    setValue(initialQuery);
  }, [initialQuery]);

  return (
    <form
      role="search"
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        apply(value);
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label htmlFor={INPUT_ID} className="text-sm font-medium text-foreground">
          {t('searchLabel')}
        </label>
        <Input
          id={INPUT_ID}
          type="search"
          name="q"
          value={value}
          placeholder={t('searchPlaceholder')}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" variant="secondary">
          {t('searchSubmit')}
        </Button>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setValue('');
              apply('');
            }}
          >
            {t('searchClear')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
