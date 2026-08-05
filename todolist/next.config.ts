import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /** 서버 없이 정적 호스팅에 그대로 배포하기 위한 정적 빌드 설정 */
  output: 'export',
  reactStrictMode: true,
};

export default nextConfig;
