import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * 순수 함수(활동 집계·프롬프트 빌드·초안 검증) 단위 테스트 전용 설정.
 * jsdom·E2E 러너는 도입하지 않는다 (TECH_SPEC 1. 기술 스택).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/lib/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
