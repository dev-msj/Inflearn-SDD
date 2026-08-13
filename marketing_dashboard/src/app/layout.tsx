import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Marketing Dashboard',
  description: 'GitHub 활동을 분석해 LinkedIn·X·블로그 콘텐츠 초안을 생성하는 대시보드',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-full bg-surface-muted text-ink antialiased">{children}</body>
    </html>
  );
}
