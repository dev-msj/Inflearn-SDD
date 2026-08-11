import { getRequestConfig } from 'next-intl/server';

import { DEFAULT_LOCALE, isAppLocale } from './routing';

/**
 * 요청별 next-intl 설정. next.config.ts의 createNextIntlPlugin이 이 파일을 참조한다.
 *
 * requestLocale은 `[locale]` 세그먼트에서 매칭된 값이지만
 *  - 세그먼트 밖(루트 레이아웃 등)에서 렌더될 때 undefined이고
 *  - 알 수 없는 경로(`/unknown.txt`)에서는 지원하지 않는 값이 들어올 수 있다.
 * 두 경우 모두 기본 로케일로 대체해야 메시지 로딩이 실패하지 않는다.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isAppLocale(requested) ? requested : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // 주문 시각·구매일 표기를 서버/클라이언트에서 동일하게 렌더하기 위해 타임존을 고정한다.
    // 고정하지 않으면 서버(UTC)와 브라우저(로컬)의 포맷이 달라 hydration 불일치가 발생한다.
    timeZone: 'Asia/Seoul',
  };
});
