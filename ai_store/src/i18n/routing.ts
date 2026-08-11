import { defineRouting } from 'next-intl/routing';

/**
 * 지원 로케일. PRD 비기능 요구사항("화면 문구는 한국어/영어 2개 언어")에 따라 2개로 고정한다.
 * messages/{ko,en}.json 파일명과 1:1로 대응하므로 값을 바꾸면 메시지 파일도 함께 변경해야 한다.
 */
export const LOCALES = ['ko', 'en'] as const;

export type AppLocale = (typeof LOCALES)[number];

/**
 * 기본 로케일. 환경 변수 DEFAULT_LOCALE은 서버 전용 값이라 미들웨어/클라이언트에서 읽을 수 없으므로,
 * 라우팅 기본값은 코드 상수로 고정한다(환경별로 URL 구조가 달라지는 것을 막기 위함).
 */
export const DEFAULT_LOCALE: AppLocale = 'ko';

/** 사용자 입력·URL 세그먼트가 지원 로케일인지 좁히는 타입 가드. */
export function isAppLocale(value: string | undefined | null): value is AppLocale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // 'always': 모든 경로에 /ko, /en 접두사를 붙인다.
  // 보호 경로 판별(middleware)과 로그인 후 callbackUrl 복귀(F3-AC8)가
  // 접두사 유무에 따라 갈리지 않도록 접두사를 항상 강제한다.
  localePrefix: 'always',
});
