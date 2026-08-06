import type { NextConfig } from 'next';

/**
 * Next.js 설정
 *
 * TECH_SPEC §5 보안 규칙 3항:
 *   `@octokit/rest`를 serverExternalPackages에 등록해 클라이언트 번들 유입을 차단한다.
 *   (GitHub 토큰을 다루는 코드가 브라우저로 내려가는 것을 빌드 단계에서 방지)
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 서버 런타임에서만 로드되어야 하는 패키지 (번들링 대상에서 제외)
  serverExternalPackages: ['@octokit/rest', '@octokit/plugin-retry', 'iron-session'],
  images: {
    // GitHub 프로필 이미지(avatarUrl)만 허용
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
