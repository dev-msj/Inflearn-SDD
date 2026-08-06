/**
 * 루트 레이아웃 (TECH_SPEC §2 app/layout.tsx)
 *
 * - lang="ko": 화면 문구가 전부 한국어이므로 스크린리더 발음을 한국어로 고정한다.
 * - 스킵 링크: 키보드 사용자가 헤더를 건너뛰고 본문(#main)으로 바로 이동할 수 있게 한다. (PRD 접근성 1항)
 * - AppStateProvider: 세션 스코프 상태를 메모리에만 보관한다. (PRD 보안 요구 2항)
 */
import type { Metadata } from 'next';

import { AppStateProvider } from '@/state/AppStateProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'git_review — SDD 스펙 문서 대비 저장소 산출물 검증',
  description:
    'GitHub 저장소가 SDD 스펙 문서에 명시된 산출물을 갖추고 있는지 항목별 체크리스트와 준수율로 확인합니다.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-canvas text-ink">
        <a href="#main" className="skip-link">
          본문 바로가기
        </a>
        <AppStateProvider>{children}</AppStateProvider>
      </body>
    </html>
  );
}
