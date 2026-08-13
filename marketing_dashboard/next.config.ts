import type { NextConfig } from 'next';

/**
 * Next.js 최소 설정.
 * 서버 시크릿(GITHUB_CLIENT_SECRET / GEMINI_API_KEY / SESSION_SECRET)은
 * `env` 옵션으로 노출하지 않는다 — 클라이언트 번들 유입 방지 (AC-2.7).
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
