import type { ReactNode } from 'react';

/**
 * 루트 레이아웃 (통과용).
 *
 * ★`<html>`/`<body>`는 여기가 아니라 `app/[locale]/layout.tsx`가 렌더한다.
 *   `lang` 속성이 로케일에 따라 달라져야 하는데, 로케일은 `[locale]` 세그먼트에서만 알 수 있기 때문이다.
 *   next-intl 공식 App Router 구성도 동일한 구조를 쓴다.
 *
 * 이 파일이 필요한 이유는 Next.js가 `app/` 최상위 레이아웃을 요구하기 때문이며,
 * 여기에 UI·프로바이더를 추가하면 로케일 컨텍스트 밖에서 렌더되어 문구가 비어버린다.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
