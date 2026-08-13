# F0 — 공통 기반 (설정·타입·세션·UI 프리미티브)

> 출처: docs/TECH_SPEC.md 「구현 슬라이스 계획」 / 대응 PRD 기능: (전 기능 공유)
> 선행 슬라이스: 없음
> 완료 게이트: `npm install && npx tsc --noEmit && npm run lint`
> 내부 순서: 설정 파일 → 의존성 설치 → 타입 → lib → UI 프리미티브 → 상태 컨텍스트
> 파일 완성 시 즉시 체크. 일괄 체크 금지. 이 문서에 없는 파일 생성 금지.

## 체크리스트 (26항목 = 파일 25 + 실행 작업 1)

- [x] `package.json` — 의존성(next/react/typescript/tailwindcss/@tailwindcss/postcss/iron-session/@google/genai/zod/server-only/vitest/eslint)·스크립트(`dev`,`build`,`start`,`lint`,`test`,`typecheck`) (의존: -) (인프라)
- [x] ⚙️ `npm install` — 의존성 설치, 이후 모든 게이트의 전제 (의존: package.json) (인프라)
- [x] `tsconfig.json` — strict, `paths: {"@/*": ["./src/*"]}`, Next 플러그인 (의존: package.json) (인프라)
- [x] `next.config.ts` — Next.js 최소 설정 (의존: package.json) (인프라)
- [x] `eslint.config.mjs` — ESLint 9 flat config (`next/core-web-vitals`, TS) (의존: package.json) (인프라)
- [x] `postcss.config.mjs` — `@tailwindcss/postcss` 플러그인 등록 (의존: package.json) (인프라)
- [x] `vitest.config.ts` — node 환경, `@` alias, `src/lib/__tests__` 포함 (의존: package.json) (인프라)
- [x] `.gitignore` — `node_modules`, `.next`, `.env*.local`, `coverage` 제외 — 키 커밋 방지 (의존: -) (AC-2.7)
- [x] `.env.example` — TECH_SPEC 1.1 표의 7개 변수 템플릿 (`NEXT_PUBLIC_` 사용 금지 주석 포함) (의존: -) (AC-2.7)
- [x] `README.md` — 실행 방법, GitHub OAuth App 등록, 환경 변수, 화이트리스트 설정 안내 (의존: .env.example) (인프라)
- [x] `src/app/globals.css` — Tailwind v4 진입(`@import "tailwindcss"`) + 색·간격 토큰 (의존: postcss.config.mjs) (인프라)
- [x] `src/app/layout.tsx` — 루트 레이아웃. `<html lang="ko">`, metadata, `globals.css` 임포트 (의존: globals.css) (전 기능 공통 · 한국어 UI)
- [x] `src/types/domain.ts` — 도메인 zod 스키마·타입 전부(Activity/Analysis/Content/Platform/PeriodDays) (의존: zod) (AC-1.5, AC-2.2, AC-3.3)
- [x] `src/types/api.ts` — Route Handler 요청·응답 스키마, `ApiError(Code)`, `AsyncStatus`, `SessionData`, `LocalSnapshot` (의존: types/domain.ts) (AC-1.8, AC-2.6, AC-3.10)
- [x] `src/lib/env.ts` — `server-only` 환경 변수 로드·필수값 검증·`allowedLogins` 파싱 (의존: -) (AC-2.7, Q7)
- [x] `src/lib/constants.ts` — `PERIOD_OPTIONS`, `DEFAULT_PERIOD_DAYS`, `AI_INPUT_LIMITS`(커밋 100건), `PLATFORM_SPECS`, `ANALYSIS_TIMEOUT_MS`/`CONTENT_TIMEOUT_MS`(60s), `LOCAL_STORE_KEY`, `MAX_SNAPSHOT_BYTES`, `LOW_ACTIVITY_THRESHOLD` (의존: types/domain.ts) (AC-1.4, AC-2.5, AC-3.3)
- [x] `src/lib/api-error.ts` — `ApiException`, `toErrorResponse()`, `userMessage()` — TECH_SPEC 4.1 표 전체 (의존: types/api.ts) (AC-1.8, AC-2.5, AC-2.6, AC-3.10)
- [x] `src/lib/session.ts` — iron-session 옵션, `getSession/getSessionUser/requireSession/destroySession` (`server-only`) (의존: lib/env.ts, types/api.ts) (AC-1.2, AC-1.9, AC-2.7)
- [x] `src/lib/utils.ts` — `cn()`, `formatDateRange()`, `truncate()`, 날짜 헬퍼 (의존: -) (공통)
- [x] `src/lib/gemini.ts` — Gemini 클라이언트 싱글턴 + `generateStructured()`(구조화 JSON·60초 타임아웃·1회 재시도) (`server-only`) (의존: lib/env.ts, lib/api-error.ts) (AC-2.5, AC-2.7)
- [x] `src/lib/local-store.ts` — `saveSnapshot/loadSnapshot/clearSnapshot` — 단일 키·버전·login 검증·용량 상한 (Q5) (의존: types/api.ts, lib/constants.ts) (AC-3.9)
- [x] `src/components/ui/Spinner.tsx` — 로딩 인디케이터 (size prop) (의존: lib/utils.ts) (AC-1.6, AC-2.1, AC-3.10)
- [x] `src/components/ui/Button.tsx` — variant/size/loading/disabled 버튼 (의존: lib/utils.ts, ui/Spinner.tsx) (AC-1.6, AC-2.1, AC-3.1)
- [x] `src/components/ui/ErrorNotice.tsx` — 오류 메시지 + 재시도/로그인 액션 (`ApiError` 또는 문자열 수용) (의존: types/api.ts, lib/api-error.ts, ui/Button.tsx) (AC-1.3, AC-1.8, AC-2.6, AC-3.10)
- [x] `src/components/ui/Card.tsx` — 섹션 카드 (title/description/actions/children) (의존: lib/utils.ts) (공통 레이아웃)
- [x] `src/components/DashboardProvider.tsx` — 전역 상태 컨텍스트 + 액션 + localStorage 동기화·복원. feature 훅 비의존 (의존: types/api.ts, lib/local-store.ts, lib/constants.ts) (AC-2.8, AC-3.5, AC-3.9)

## 참조할 TECH_SPEC 절

- 「0. 설계 전제」 전체 (Q1~Q7 확정 사항), 「0.1 로컬 저장 스키마」
- 「1. 기술 스택」, 「1.1 환경 변수」
- 「2. 프로젝트 구조」, 「2.1 아키텍처 개요」
- 「3. 구현 명세 > 기능 1 > 1-A. 인증」의 `SessionData`/`sessionOptions`/세션 유틸 시그니처
- 「3. 구현 명세 > 기능 1 > 1-B」의 도메인 zod 스키마 (`activitySummarySchema` 외)
- 「3. 구현 명세 > 기능 1 > 1-C」의 `DashboardState`/`DashboardActions`
- 「3. 구현 명세 > 기능 2 > 2-A, 2-B」의 `analysisResultSchema`, `generateStructured`
- 「3. 구현 명세 > 기능 3 > 3-A」의 `platformSchema`, `contentDraftSchema`, `DraftValidation`, `PLATFORM_SPECS`
- 「4. 데이터 모델」, 「4.1 오류 코드 → 사용자 메시지」

## 수용 기준 매핑

| PRD 수용 기준 | 담당 파일 |
|---|---|
| AC-1.2 인증 성공 (세션) | `src/lib/session.ts` |
| AC-1.3 인증 실패 표시 | `src/components/ui/ErrorNotice.tsx` |
| AC-1.4 기간 선택 기본값 | `src/lib/constants.ts` |
| AC-1.5 수집 항목 타입 | `src/types/domain.ts` |
| AC-1.6 로딩 상태 | `src/components/ui/Spinner.tsx`, `src/components/ui/Button.tsx` |
| AC-1.8 API 오류 | `src/types/api.ts`, `src/lib/api-error.ts`, `src/components/ui/ErrorNotice.tsx` |
| AC-1.9 로그아웃 | `src/lib/session.ts` |
| AC-2.1 분석 실행 조건 | `src/components/ui/Button.tsx`, `src/components/ui/Spinner.tsx` |
| AC-2.2 분석 결과 구성 | `src/types/domain.ts` |
| AC-2.5 타임아웃 | `src/lib/constants.ts`, `src/lib/gemini.ts`, `src/lib/api-error.ts` |
| AC-2.6 AI 오류 처리 | `src/types/api.ts`, `src/lib/api-error.ts`, `src/components/ui/ErrorNotice.tsx` |
| AC-2.7 키 비노출 | `.gitignore`, `.env.example`, `src/lib/env.ts`, `src/lib/session.ts`, `src/lib/gemini.ts` |
| AC-2.8 재분석 | `src/components/DashboardProvider.tsx` |
| AC-3.1 생성 실행 조건 | `src/components/ui/Button.tsx` |
| AC-3.3 플랫폼 규격 | `src/types/domain.ts`, `src/lib/constants.ts` |
| AC-3.5 수정 가능 | `src/components/DashboardProvider.tsx` |
| AC-3.9 로컬 보존 | `src/lib/local-store.ts`, `src/components/DashboardProvider.tsx` |
| AC-3.10 부분 실패 | `src/types/api.ts`, `src/lib/api-error.ts`, `src/components/ui/ErrorNotice.tsx`, `src/components/ui/Spinner.tsx` |
