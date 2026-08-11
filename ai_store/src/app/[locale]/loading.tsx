import { getTranslations } from 'next-intl/server';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * 스트리밍 로딩 화면.
 *
 * ★빈 화면을 보여주지 않는 것이 목적이다(비기능: 목록·상세 2.5초 이내 콘텐츠 인지).
 *   실제 데이터가 도착하기 전까지 레이아웃 형태만 미리 그려 화면이 튀지 않게 한다.
 *
 * ★스켈레톤 블록 자체는 `aria-hidden`(Skeleton 기본값)이고,
 *   로딩 상태 안내는 컨테이너의 `aria-busy` + 시각적으로 숨긴 텍스트 한 번으로만 전달한다.
 *   블록마다 안내하면 스크린리더가 의미 없는 반복을 읽는다.
 */

/** 목록 카드 자리 표시 개수. 첫 화면에서 보통 보이는 카드 수와 맞춘다. */
const PLACEHOLDER_COUNT = 6;

export default async function Loading() {
  const t = await getTranslations('common');

  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only" role="status">
        {t('loading')}
      </span>

      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-10 w-full max-w-md" />

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-24 rounded-full" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: PLACEHOLDER_COUNT }, (_, index) => (
          <div key={index} className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <Skeleton className="aspect-[16/9] w-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
