# F1 — GitHub 로그인 + 활동 데이터 수집

> 출처: docs/TECH_SPEC.md 「구현 슬라이스 계획」 / 대응 PRD 기능: 기능 1 (AC-1.1 ~ AC-1.9)
> 선행 슬라이스: F0 (완료 필요)
> 완료 게이트: `npx tsc --noEmit && npm run lint && npx vitest run src/lib/__tests__/activity.test.ts`
> 추가 수동 확인(선택): `npm run dev` 후 `/api/auth/login`이 GitHub authorize로 302, 로그인 후 `curl -b`로 `/api/activity?period=7`이 `ActivitySummary` JSON 반환
> 내부 순서: 서버 lib → 인증 라우트 → 활동 라우트 → 훅 → 컴포넌트 → 테스트
> 파일 완성 시 즉시 체크. 일괄 체크 금지. 이 문서에 없는 파일 생성 금지.

## 체크리스트 (12항목)

- [x] `src/lib/github.ts` — GitHub REST 호출(`/user`, `/users/{login}/events/public` 최대 3페이지) + `classifyGitHubError()` (의존: lib/env.ts@F0, lib/api-error.ts@F0) (AC-1.2, AC-1.5, AC-1.8)
- [x] `src/lib/activity.ts` — 이벤트 → `ActivitySummary` 집계(기간 필터·PR/이슈 상태 판정·중복 제거·저장소 목록·truncated) (의존: types/domain.ts@F0, lib/github.ts) (AC-1.5, AC-1.7)
- [x] `src/app/api/auth/login/route.ts` — `state` 쿠키 발급 + GitHub authorize 302 (scope `read:user`) (의존: lib/env.ts@F0) (AC-1.1, AC-1.2)
- [x] `src/app/api/auth/callback/route.ts` — code 교환 → 프로필 조회 → 화이트리스트 → 세션 저장 / 모든 실패는 `/?error=` 리다이렉트 (의존: lib/env.ts@F0, lib/session.ts@F0, lib/github.ts) (AC-1.2, AC-1.3)
- [x] `src/app/api/auth/logout/route.ts` — 세션 파기 후 `204` (의존: lib/session.ts@F0) (AC-1.9)
- [x] `src/app/api/activity/route.ts` — `?period` 검증 → 이벤트 수집 → 집계 → `{ activity }` / 오류 코드 분류 (의존: lib/session.ts@F0, lib/api-error.ts@F0, lib/github.ts, lib/activity.ts) (AC-1.5, AC-1.7, AC-1.8)
- [x] `src/hooks/useActivity.ts` — `GET /api/activity` 호출·상태 전이·기간 변경 시 재조회 (의존: DashboardProvider.tsx@F0, types/api.ts@F0) (AC-1.4, AC-1.6, AC-1.8)
- [x] `src/components/LoginScreen.tsx` — 로그인 전 화면 + OAuth 실패/차단 메시지 + 재시도 (의존: ui/Button.tsx@F0, ui/ErrorNotice.tsx@F0) (AC-1.1, AC-1.3)
- [x] `src/components/Header.tsx` — 아바타·`@login` 표시, "초기화", "로그아웃"(스냅샷 삭제 포함) (의존: DashboardProvider.tsx@F0, lib/local-store.ts@F0, ui/Button.tsx@F0) (AC-1.2, AC-1.9, AC-3.9)
- [x] `src/components/PeriodSelector.tsx` — 7/30/90일 세그먼트 컨트롤, 기본 7일, 로딩 중 비활성 (의존: lib/constants.ts@F0, DashboardProvider.tsx@F0) (AC-1.4, AC-1.6)
- [x] `src/components/ActivityPanel.tsx` — 4개 건수 카드 + 저장소명 목록 + 로딩/0건/오류 분기 + "공개 저장소 활동 기준" 문구 (의존: useActivity.ts, ui/Card.tsx·ui/Spinner.tsx·ui/ErrorNotice.tsx@F0) (AC-1.5, AC-1.6, AC-1.7, AC-1.8)
- [x] `src/lib/__tests__/activity.test.ts` — 이벤트 픽스처(Push/PR opened·merged/Issues/Watch/기간 밖) → 집계·카운트·`repositories`·`totalCount===0` 검증 (의존: lib/activity.ts) (AC-1.5, AC-1.7)

## 참조할 TECH_SPEC 절

- 「0. 설계 전제」 Q1(공개 저장소만·scope `read:user`), Q7(화이트리스트)
- 「3. 구현 명세 > 기능 1: GitHub OAuth 로그인 + 활동 데이터 수집」 전체
  - 1-A. 인증 — `/api/auth/login`, `/api/auth/callback`, `/api/auth/logout` 처리 순서 표
  - 1-B. 활동 수집 — 도메인 타입, GitHub 클라이언트 시그니처, 이벤트 매핑 규칙 표, `GET /api/activity` 명세
  - 1-C. UI — `LoginScreen`/`Header`/`PeriodSelector`/`ActivityPanel`/`useActivity` 명세
  - 「수용 기준 매핑 (F1)」 표
- 「4.1 오류 코드 → 사용자 메시지」
- 「5. API 명세」의 auth/activity 행 + 공통 규약

## 수용 기준 매핑

| PRD 수용 기준 | 담당 파일 |
|---|---|
| AC-1.1 로그인 진입 | `src/components/LoginScreen.tsx`, `src/app/api/auth/login/route.ts` |
| AC-1.2 OAuth 인증 성공 | `src/app/api/auth/callback/route.ts`, `src/components/Header.tsx`, `src/lib/github.ts` |
| AC-1.3 OAuth 거부/실패 | `src/app/api/auth/callback/route.ts`, `src/components/LoginScreen.tsx` |
| AC-1.4 기간 선택 | `src/components/PeriodSelector.tsx`, `src/hooks/useActivity.ts` |
| AC-1.5 수집 항목 | `src/lib/github.ts`, `src/lib/activity.ts`, `src/app/api/activity/route.ts`, `src/components/ActivityPanel.tsx`, `src/lib/__tests__/activity.test.ts` |
| AC-1.6 로딩 상태 | `src/hooks/useActivity.ts`, `src/components/ActivityPanel.tsx`, `src/components/PeriodSelector.tsx` |
| AC-1.7 활동 없음 | `src/lib/activity.ts`, `src/app/api/activity/route.ts`, `src/components/ActivityPanel.tsx`, `src/lib/__tests__/activity.test.ts` |
| AC-1.8 GitHub API 오류 | `src/lib/github.ts`, `src/app/api/activity/route.ts`, `src/hooks/useActivity.ts`, `src/components/ActivityPanel.tsx` |
| AC-1.9 로그아웃 | `src/app/api/auth/logout/route.ts`, `src/components/Header.tsx` |
