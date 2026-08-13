# F3 — 플랫폼별 콘텐츠 생성 + 합성 루트

> 출처: docs/TECH_SPEC.md 「구현 슬라이스 계획」 / 대응 PRD 기능: 기능 3 (AC-3.1 ~ AC-3.10, + 합성 루트로 AC-1.1·AC-1.3 화면 진입 확정)
> 선행 슬라이스: F0, F1, F2 (완료 필요)
> 완료 게이트: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
> 최종 수동 E2E(PRD 4.3): `npm run dev` → 로그인 → 기간 7일 → 활동 표시 → 분석 → 콘텐츠 생성 → 편집·복사 → 새로고침 복원 → 로그아웃까지 중단 없이 1회 완주 + TECH_SPEC 6장 검증 매트릭스 27행 확인
> 내부 순서: 검증 lib → 프롬프트 → 라우트 → 훅 → 카드/패널 → 합성 루트 → 테스트
> 파일 완성 시 즉시 체크. 일괄 체크 금지. 이 문서에 없는 파일 생성 금지.

## 체크리스트 (9항목)

- [x] `src/lib/drafts.ts` — `countChars()`, `validateDraft()`, `findUnknownRepositories()`, `hasEnoughHeadings()` (의존: types/domain.ts@F0, lib/constants.ts@F0) (AC-3.3, AC-3.4, AC-3.8)
- [x] `src/lib/prompts/content.ts` — 플랫폼별 프롬프트 빌더(LinkedIn 600~1300자·X 280자·블로그 800자+H2 2개) + 사실 기반 지시 + `CONTENT_RESPONSE_SCHEMA` (의존: types/domain.ts@F0, lib/constants.ts@F0) (AC-3.3, AC-3.8)
- [x] `src/app/api/content/route.ts` — 세션·본문 검증 → `platforms` 병렬 생성(`Promise.allSettled`) → `{ results }` 항상 200 (의존: lib/session.ts·lib/gemini.ts·lib/api-error.ts@F0, lib/prompts/content.ts) (AC-3.1, AC-3.2, AC-3.7, AC-3.10)
- [x] `src/hooks/useContent.ts` — `generateAll()`/`regenerate(platform)`/`editDraft()` — 플랫폼 키 단위 상태 관리 (의존: DashboardProvider.tsx@F0, types/api.ts@F0) (AC-3.2, AC-3.5, AC-3.7, AC-3.10)
- [x] `src/components/DraftCard.tsx` — textarea 편집·실시간 글자 수·규격 경고·복사·다시 생성·카드별 로딩/오류 (의존: lib/drafts.ts, ui/Card.tsx·ui/Button.tsx·ui/Spinner.tsx·ui/ErrorNotice.tsx@F0) (AC-3.3, AC-3.4, AC-3.5, AC-3.6, AC-3.7, AC-3.10)
- [x] `src/components/ContentPanel.tsx` — 생성 버튼(비활성 조건) + 3개 카드 그리드 + "AI가 생성한 초안입니다…" 상시 안내 (의존: useContent.ts, DraftCard.tsx, ui/Card.tsx·ui/Button.tsx@F0) (AC-3.1, AC-3.2, AC-3.8)
- [x] `src/components/Dashboard.tsx` — 로그인 후 합성: Header → PeriodSelector → ActivityPanel → AnalysisPanel → ContentPanel (의존: Header.tsx·PeriodSelector.tsx·ActivityPanel.tsx@F1, AnalysisPanel.tsx@F2, ContentPanel.tsx) (AC-1.2, AC-1.6, AC-2.1, AC-3.1)
- [x] `src/app/page.tsx` — 서버 컴포넌트 합성 루트: 세션 분기 → `LoginScreen`(+`?error` 파싱) 또는 `DashboardProvider>Dashboard` (의존: lib/session.ts@F0, DashboardProvider.tsx@F0, LoginScreen.tsx@F1, Dashboard.tsx) (AC-1.1, AC-1.3, AC-1.9)
- [x] `src/lib/__tests__/drafts.test.ts` — 281자 X 경고, 799자·소제목 1개 블로그 경고, LinkedIn 범위 검증, 미확인 저장소명 탐지, 이모지 포함 글자 수 (의존: lib/drafts.ts) (AC-3.3, AC-3.4, AC-3.8)

## 참조할 TECH_SPEC 절

- 「0. 설계 전제」 Q3(2단계 유지), Q4(블로그 800자+ 완성형 초안)
- 「3. 구현 명세 > 기능 3: 플랫폼별 콘텐츠 자동 생성」 전체
  - 3-A. 도메인 타입 (`platformSchema`, `contentDraftSchema`, `DraftValidation`, `PLATFORM_SPECS`)
  - 3-B. 초안 검증 — 함수 시그니처 + 경고 문구 규칙
  - 3-C. 프롬프트 — 공통 지시 3개 + 플랫폼별 지시 표
  - 3-D. `POST /api/content` 명세 + `ContentGenerationResult`
  - 3-E. UI — `useContent`, `ContentPanel`, `DraftCard`, `Dashboard`, `page.tsx`
  - 「수용 기준 매핑 (F3)」 표
- 「4.1 오류 코드 → 사용자 메시지」
- 「5. API 명세」의 `/api/content` 행 + 공통 규약

## 수용 기준 매핑

| PRD 수용 기준 | 담당 파일 |
|---|---|
| AC-1.1 로그인 진입 | `src/app/page.tsx` |
| AC-1.3 OAuth 거부/실패 | `src/app/page.tsx` (`?error` 파싱 → LoginScreen) |
| AC-3.1 생성 실행 조건 | `src/components/ContentPanel.tsx`, `src/app/api/content/route.ts` |
| AC-3.2 3개 동시 출력 | `src/hooks/useContent.ts`, `src/components/ContentPanel.tsx` |
| AC-3.3 플랫폼별 형식 | `src/lib/prompts/content.ts`, `src/lib/drafts.ts`, `src/components/DraftCard.tsx`, `src/lib/__tests__/drafts.test.ts` |
| AC-3.4 글자 수 표시 | `src/lib/drafts.ts`, `src/components/DraftCard.tsx` |
| AC-3.5 수정 가능 | `src/components/DraftCard.tsx`, `src/hooks/useContent.ts` |
| AC-3.6 복사 | `src/components/DraftCard.tsx` |
| AC-3.7 개별 재생성 | `src/hooks/useContent.ts`, `src/app/api/content/route.ts`, `src/components/DraftCard.tsx` |
| AC-3.8 사실 기반 생성 | `src/lib/prompts/content.ts`, `src/lib/drafts.ts`, `src/components/ContentPanel.tsx`, `src/lib/__tests__/drafts.test.ts` |
| AC-3.9 로컬 임시 보존 | (F0 `local-store.ts` + `DashboardProvider.tsx`가 소유, 본 슬라이스에서 동작 확인) |
| AC-3.10 생성 부분 실패 | `src/app/api/content/route.ts`, `src/hooks/useContent.ts`, `src/components/DraftCard.tsx` |
