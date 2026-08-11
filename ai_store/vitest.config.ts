import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  // `src/server/**`는 전부 `import 'server-only'`로 시작한다. 이 마커 패키지는
  // `react-server` 조건이 없으면 "클라이언트에서 import 되었다"고 판단해 즉시 예외를 던진다.
  // 단위 테스트는 서버 모듈을 직접 검증하므로 Next.js 서버 런타임과 같은 조건을 준다
  // (package.json의 prisma seed가 `tsx --conditions=react-server`를 쓰는 것과 동일한 이유).
  resolve: {
    conditions: ['react-server', 'node', 'import', 'module', 'default'],
  },
  ssr: {
    resolve: {
      conditions: ['react-server', 'node', 'import', 'module', 'default'],
    },
  },
  test: {
    environment: 'node',
    // 단위 테스트만 대상. E2E(tests/e2e)는 Playwright가 담당한다.
    include: ['tests/unit/**/*.test.ts'],
    globals: true,
    restoreMocks: true,
  },
});
