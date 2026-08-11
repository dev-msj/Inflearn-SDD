import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// next-intl: 요청별 메시지 로딩 설정 파일 경로
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // 프롬프트 전문(body)이 클라이언트 번들로 새는 것을 빌드 단계에서 차단하기 위해
  // server-only 위반 시 빌드가 실패하도록 타입/린트 우회를 허용하지 않는다.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
  serverExternalPackages: ['@node-rs/argon2'],
};

export default withNextIntl(nextConfig);
