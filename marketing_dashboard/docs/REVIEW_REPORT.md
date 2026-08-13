# REVIEW_REPORT: Marketing Dashboard

> PRD(`docs/PRD.md` v1.0) · TECH_SPEC(`docs/TECH_SPEC.md` v1.0) · 구현 코드(`src/` 42개 + 루트 설정 9개) 3자 정합성 검증

| 항목 | 내용 |
|---|---|
| 검증일 | 2026-08-12 |
| 검증 범위 | Stage 1 PRD↔코드(AC 27개) / Stage 2 TECH_SPEC↔코드 / Stage 3 코드 품질 |
| 검증 방식 | 정적 분석(전 파일 정독) + 기존 게이트 결과 활용 |
| 런타임 E2E | **미실행** (실제 GitHub·Gemini 키 부재) |

---

## 1. 종합 결과

### 1.1 단계별 요약

| 단계 | 대상 | 결과 | 비고 |
|---|---|---|---|
| **Stage 1** PRD ↔ 코드 | 수용 기준 27개 | **PASS 23 / PARTIAL 3 / FAIL 0 / UNVERIFIABLE 1** | PARTIAL: AC-2.5, AC-2.8, AC-3.3 |
| **Stage 2** TECH_SPEC ↔ 코드 | 파일 51개 | **51 / 51 존재, 계획 외 구현 파일 0** | 양방향 대조 완료 |
| | 시그니처·타입 | **일치 (편차 3건, 전부 경미)** | 2건은 TECH_SPEC 내부 불일치에서 기인 |
| | API 엔드포인트 6개 | **6 / 6 일치** | 메서드·요청/응답·상태코드 |
| | 오류 코드 9개 | **9 / 9 문구까지 일치** | 4.1 표와 글자 그대로 |
| | 설계 전제 Q1~Q7 | **7 / 7 반영** | |
| | 구조 규약 | **`runtime`/`dynamic` 6/6, `server-only` 4/4, `try/catch` 6/6** | |
| **Stage 3** 코드 품질 | 결함 | **High 1 / Medium 3 / Low 3** | `any` 0건, `@ts-ignore` 0건 |

### 1.2 종합 판정

> **조건부 합격 (Conditional Pass)**
>
> 스펙 대비 구조적 이행률은 매우 높다. 파일·시그니처·API·오류 코드·설계 전제가 전부 일치하며 정적 게이트(tsc / lint / vitest 41 / build)도 통과한다.
> 다만 **비동기 상태 무효화 누락(High-1)** 이 사용자에게 잘못된 데이터를 보여 줄 수 있으므로, MVP 완료(PRD 4.3) 판정 전에 High 1건 + Medium 2건(M-1, M-2) 수정과 5장의 수동 확인 절차 완주를 권고한다.

FAIL 판정 항목은 **0건**이다. PARTIAL 3건은 모두 "구현은 있으나 보증 범위가 스펙보다 좁은" 경우이며, 원인은 Stage 3 결함과 1:1로 연결된다.

---

## 2. Stage 1 상세 — PRD 수용 기준 27개 전수

판정 기준
- **PASS**: 코드에서 해당 동작이 확인됨
- **PARTIAL**: 주 경로는 충족하나 특정 경로에서 보증이 깨짐
- **UNVERIFIABLE**: 정적 분석으로 확인 불가(실제 모델 출력 등) — FAIL로 세지 않음

### F1 — GitHub OAuth 로그인 + 활동 수집

| AC | 판정 | 근거 (파일:라인) | 비고 |
|---|---|---|---|
| **AC-1.1** 로그인 진입 | PASS | `src/app/page.tsx:29-34` / `src/components/LoginScreen.tsx:36-68` | `getSessionUser()===null` 이면 `<LoginScreen/>` 만 반환. `Dashboard`·`DashboardProvider` 가 트리에 포함되지 않아 활동/분석/생성 DOM 자체가 없음 |
| **AC-1.2** OAuth 성공 | PASS | `src/app/api/auth/callback/route.ts:76-86` / `src/components/Header.tsx:36-48` | 세션 저장 후 `302 /`. 헤더가 `avatarUrl` `<img>` + `@{login}` 렌더 |
| **AC-1.3** OAuth 거부/실패 | PASS | `callback/route.ts:38-90` | **전 경로 점검 완료**: ① `?error` → `oauth_denied`(45-47) ② state 불일치/부재 → `oauth_failed`(50-53) ③ code 부재 → `oauth_failed`(55-58) ④ 토큰 교환·프로필 조회·화이트리스트·세션 저장 중 **모든 예외** → `catch`(87-90) → `oauth_failed`. `throw` 로 종료하는 경로 없음. `page.tsx:19-22` 가 `?error` 를 화이트리스트 파싱 후 `LoginScreen.errorCode` 로 전달, `LoginScreen.tsx:45-51` 이 메시지 + "다시 시도" 버튼 렌더 |
| **AC-1.4** 기간 선택 | PASS | `src/lib/constants.ts:4,7` / `src/components/PeriodSelector.tsx:22-41` / `DashboardProvider.tsx:104` | `PERIOD_OPTIONS=[7,30,90]`, 초기 상태 `DEFAULT_PERIOD_DAYS=7` |
| **AC-1.5** 수집 항목 4종 + 저장소명 | PASS | `src/lib/activity.ts:151-175` / `src/components/ActivityPanel.tsx:62-91` | 커밋/PR(생성·머지·종료)/이슈(생성·종료)/스타 4개 카운트 카드 + `CountCard.repos` 로 **항목별 저장소명 목록**(63-76) + 전체 `repositories` 칩(79-91). 테스트: `activity.test.ts:136-166,200-209` |
| **AC-1.6** 로딩 상태 | PASS | `ActivityPanel.tsx:115-133` / `AnalysisPanel.tsx:82-86` / `ContentPanel.tsx:25` | 로딩 시 `Spinner` + 스켈레톤. 분석 버튼은 `activityStatus==='loading'` 을 직접 포함. 콘텐츠 버튼은 `analysisStatus==='loading'` 만 보지만, 기간 변경 시 `setPeriod` 가 `analysis` 를 null 로 만들어(`DashboardProvider.tsx:149-161`) 활동 재조회 구간에서 항상 `disabled` 가 됨 |
| **AC-1.7** 활동 0건 | PASS | `ActivityPanel.tsx:140-141` / `AnalysisPanel.tsx:84` / `analyze/route.ts:29-32` | 지정 문구 그대로(`ActivityPanel.tsx:16`). 버튼 `disabled` + **라우트 가드**(`totalCount===0` → `INVALID_REQUEST`) 이중. 테스트: `activity.test.ts:222-248` |
| **AC-1.8** API 오류 구분 | PASS | `src/lib/github.ts:85-93` / `src/lib/api-error.ts:37-54` / `ui/ErrorNotice.tsx:27-58` | 401→`GITHUB_TOKEN_INVALID`(로그인 버튼), 403·429 & `x-ratelimit-remaining==='0'`→`GITHUB_RATE_LIMIT`(재시도), 그 외→`GITHUB_ERROR`(재시도). 메시지는 4.1 표와 일치 |
| **AC-1.9** 로그아웃 | PASS | `api/auth/logout/route.ts:13-22` / `Header.tsx:19-29` | `destroySession()` → 204 → `clearSnapshot()` → `window.location.assign('/')` 로 전체 페이지 이동. 클라이언트 메모리 상태·화면 데이터 전부 폐기. 스냅샷 삭제에는 경쟁 조건 있음 → **Medium-2** |

### F2 — Gemini 기반 활동 분석

| AC | 판정 | 근거 (파일:라인) | 비고 |
|---|---|---|---|
| **AC-2.1** 실행 조건 | PASS | `AnalysisPanel.tsx:82-86` / `analyze/route.ts:29-32` / `useAnalysis.ts:33` | 버튼 `disabled = !activity \|\| totalCount===0 \|\| activityStatus==='loading' \|\| status==='loading'`. 훅·라우트에도 0건 가드 |
| **AC-2.2** 결과 3요소 | PASS | `types/domain.ts:79-83` / `AnalysisPanel.tsx:33-72` / `prompts/analysis.ts:99-135` | `highlights` min3/max5, `insights` min2 를 zod + Gemini `responseSchema` 양쪽에서 강제. 화면에 기간 요약·하이라이트·인사이트 3영역 렌더. **문장 수(3~5문장)는 런타임 확인 필요** |
| **AC-2.3** 근거 추적성 | PASS | `types/domain.ts:75` / `prompts/analysis.ts:19` / `AnalysisPanel.tsx:50-59` | `evidence: z.array(string).min(1)` + 프롬프트 지시 2 + 하이라이트별 근거 칩 렌더. **근거의 사실성 자체는 런타임 대조 필요** |
| **AC-2.4** 한국어 출력 | **UNVERIFIABLE** | `prompts/analysis.ts:18` (지시문) / `prompts.test.ts:125-135` | 프롬프트에 한국어 지시 + 고유명사 보존 지시가 있고 테스트로 고정됨. **실제 출력 언어는 모델 응답을 봐야 확정** → 5장 수동 절차 |
| **AC-2.5** 60초 타임아웃 | **PARTIAL** | `src/lib/gemini.ts:46-83` (이중 적용 확인) / `gemini.ts:92-105` (재시도) | `AbortController` + `setTimeout` + `Promise.race` **이중 적용을 확인**(요구사항 충족). 다만 `generateStructured` 가 스키마 검증 실패 시 **동일 타임아웃으로 1회 더 호출**하므로 사용자 체감 대기가 최대 120초까지 늘어남 → **Medium-1** |
| **AC-2.6** AI 오류 시 활동 유지 | PASS | `useAnalysis.ts:52-73` | 오류 경로에서 `setAnalysisError`/`setAnalysisStatus` 만 호출. `setActivity` 호출이 **한 번도 없음**(파일 전체 확인). `AnalysisPanel.tsx:108-111` 이 오류를 자기 카드 안에서만 렌더 |
| **AC-2.7** 키 비노출 | PASS | `env.ts:1` / `session.ts:1` / `gemini.ts:1` / `github.ts:1` (`import 'server-only'`) / `next.config.ts:9-11` / `.env.example` | Gemini 호출은 `analyze`·`content` 라우트 내부에만 존재. `NEXT_PUBLIC_` 0건. 호출자 확인: `.next/static` 번들 키 문자열 0건 |
| **AC-2.8** 재분석 | **PARTIAL** | `DashboardProvider.tsx:149-161` / `useAnalysis.ts:38-39` | 기간 변경 시 `analysis`·`drafts` 초기화, `runAnalysis` 가 `setAnalysis(null)` 후 교체 — 누적되지 않음. 그러나 **진행 중 요청이 기간 변경으로 무효화되지 않아** 새 기간 화면에 옛 기간 분석이 되살아남 → **High-1** |

### F3 — 플랫폼별 콘텐츠 생성

| AC | 판정 | 근거 (파일:라인) | 비고 |
|---|---|---|---|
| **AC-3.1** 실행 조건 | PASS | `ContentPanel.tsx:25,34` / `useContent.ts:52` / `types/api.ts:82-92` | 버튼 `disabled = analysis===null \|\| isBusy \|\| analysisStatus==='loading'`, 훅 가드, 라우트 스키마에서 `analysis` 필수. 단 카드별 "다시 생성" 버튼에는 가드 없음 → **Medium-3** |
| **AC-3.2** 3개 동시 출력 | PASS | `useContent.ts:114-116` / `ContentPanel.tsx:49-61` | `generateAll()` → `PLATFORM_ORDER=['linkedin','x','blog']` 1회 호출. 3개 `DraftCard` 는 생성 여부와 무관하게 **항상 그리드에 렌더** |
| **AC-3.3** 플랫폼별 형식 | **PARTIAL** | `constants.ts:18-22` / `prompts/content.ts:32-53` / `drafts.ts:98-119` / `DraftCard.tsx:187-191` | 규격 상수가 AC-3.3 표와 1:1. 프롬프트가 분량·구조·해시태그를 지시. `validateDraft` 가 위반 시 경고 배지(280자 초과 경고 포함, `drafts.test.ts:80-86`). **실제 생성물이 기준을 충족하는지는 런타임 확인 필요** |
| **AC-3.4** 글자 수 실시간 | PASS | `DraftCard.tsx:86,89,127` | `value = draft?.content ?? ''` → `validateDraft(platform, value, …)` 를 **매 렌더 재계산**. `textarea` 는 `value`/`onChange` 제어 컴포넌트(180-186)라 입력 → 컨텍스트 갱신 → 재렌더 → 글자 수 갱신. **저장된 draft 기준이 아니라 화면 표시값 기준임을 확인** |
| **AC-3.5** 수정 가능 | PASS | `DashboardProvider.tsx:185-193` / `DraftCard.tsx:183` | `updateDraftContent` 가 `drafts.map` 에서 `draft.platform === action.platform` 인 항목만 교체. 다른 플랫폼 객체는 참조까지 그대로 유지 |
| **AC-3.6** 복사 | PASS | `DraftCard.tsx:94-112,143-146` | 복사 대상이 `value`(= textarea 현재 값)이므로 편집분이 복사됨. `navigator.clipboard` 실패 시 `document.execCommand` 폴백(47-65). 2초간 "복사되었습니다" |
| **AC-3.7** 개별 재생성 | PASS | `useContent.ts:49-72,118-123` / `content/route.ts:61-74` | `regenerate(p)` → `run([p])` → 요청 본문 `platforms:[p]`. 상태·오류·본문 갱신이 전부 플랫폼 키 단위라 **다른 플랫폼의 사용자 편집분은 손대지 않음**(`setDraft` 는 upsert, `DashboardProvider.tsx:119-127`) |
| **AC-3.8** 사실 기반 | PASS | `prompts/content.ts:25-29,108-110` / `drafts.ts:66-95` / `ContentPanel.tsx:17,40-42` | "허용 저장소 목록"·"활동 실적" 제공 + 창작 금지 지시. `findUnknownRepositories` 가 미확인 저장소명 경고(`drafts.test.ts:152-202`). **상시 안내 문구가 생성 여부와 무관하게 패널 상단에 항상 렌더**. 환각 0건(M3)은 런타임 대조 필요 |
| **AC-3.9** 로컬 임시 보존 | PASS | `local-store.ts:54-121` / `DashboardProvider.tsx:224-275,332-336` / `Header.tsx:26` | 마운트 시 `loadSnapshot(user.login)` 복원(버전·login 불일치 시 폐기), 300ms 디바운스 저장, `resetAll()`·로그아웃에서 `clearSnapshot()`. 복원 시 `useActivity.ts:90-93` 이 동일 기간이면 재조회를 생략해 초안이 유지됨. **로그아웃 직후 디바운스 타이머 경쟁 조건 존재** → **Medium-2** |
| **AC-3.10** 부분 실패 | PASS | `content/route.ts:61-84` / `useContent.ts:91-105` / `DraftCard.tsx:171-173` | `Promise.allSettled` → 항상 200 + `results[]`. 훅이 플랫폼별로 `setDraftStatus`/`setDraftError` 를 분리 적용. 실패 카드에만 `ErrorNotice` + "다시 생성", 성공 카드는 정상 표시 |

### 집계

| 판정 | 개수 | 항목 |
|---|---|---|
| PASS | **23** | AC-1.1~1.9(9), AC-2.1·2.2·2.3·2.6·2.7(5), AC-3.1·3.2·3.4·3.5·3.6·3.7·3.8·3.9·3.10(9) |
| PARTIAL | **3** | AC-2.5, AC-2.8, AC-3.3 |
| FAIL | **0** | — |
| UNVERIFIABLE | **1** | AC-2.4 |

---

## 3. Stage 2 상세 — TECH_SPEC ↔ 코드

### 3.1 파일 대조 (양방향)

| 구분 | 계획 | 실제 | 결과 |
|---|---|---|---|
| 루트 설정 | 9 | 9 | ✅ 일치 |
| `src/app` | 9 | 9 | ✅ 일치 |
| `src/types` | 2 | 2 | ✅ 일치 |
| `src/lib` | 12 | 12 | ✅ 일치 |
| `src/lib/__tests__` | 3 | 3 | ✅ 일치 |
| `src/components` | 13 | 13 | ✅ 일치 |
| `src/hooks` | 3 | 3 | ✅ 일치 |
| **합계** | **51** | **51** | ✅ **누락 0 / 계획 외 추가 0** |

- 역방향 확인: `src/` 실제 파일 42개가 전부 「2. 프로젝트 구조」 트리에 존재한다. 계획에 없는 구현 파일은 발견되지 않았다.
- 계획 외 존재 파일: `next-env.d.ts`·`package-lock.json`·`tsconfig.tsbuildinfo`(도구 자동 생성, TECH_SPEC 2장이 명시적으로 제외), `.claude/settings.local.json`(에이전트 도구 설정), `docs/TASK.md`·`docs/tasks/F0~F3*.md`(`/sdd-build` 산출물). **모두 구현 산출물이 아니므로 위반 아님.**
- `.gitignore` 가 `.env*.local`·`*.tsbuildinfo`·`/.next/` 를 포함해 시크릿·빌드 산출물 커밋을 차단한다(AC-2.7).

### 3.2 타입·시그니처 대조

| 대상 | 스펙 | 코드 | 결과 |
|---|---|---|---|
| `buildActivitySummary(events, period, truncated)` | 3-1B | `activity.ts:67-71` | ✅ 일치 (`period` 를 `ActivityPeriod{days,from,to}` 로 명명만 부여) |
| `classifyGitHubError(res): ApiErrorCode` | 3-1B | `github.ts:85-93` | ✅ 분류 규칙 3종까지 일치 |
| `fetchGitHubUser` / `fetchPublicEvents` | 3-1B | `github.ts:150,179` | ✅ 일치 (3페이지·조기 종료·`truncated`) |
| `generateStructured<T>(params)` | 2-B | `gemini.ts:87` | ✅ 파라미터 5개 전부 일치 |
| `buildAnalysisPrompt` / `ANALYSIS_RESPONSE_SCHEMA` | 2-C | `prompts/analysis.ts:43,99` | ✅ 일치 |
| `buildContentPrompt` / `CONTENT_RESPONSE_SCHEMA` | 3-C | `prompts/content.ts:72,124` | ⚠️ `ContentPromptInput.analysis` 가 `AnalysisResult` 대신 `Omit<AnalysisResult,'generatedAt'\|'lowVolume'>`(`content.ts:16`). 요청 스키마가 `analysisResultSchema` 라 두 필드가 오지 않는 것을 타입으로 반영한 것이며 **프롬프트 내용에는 영향 없음** |
| `countChars` / `validateDraft` / `findUnknownRepositories` / `hasEnoughHeadings` | 3-B | `drafts.ts:49,126,66,54` | ✅ 4개 전부 일치 |
| `getSession` / `getSessionUser` / `requireSession` / `destroySession` | 1-A | `session.ts:31,37,44,57` | ✅ 4개 일치. (2장 트리 주석의 `saveSession` 은 1-A 본문에 없는 **TECH_SPEC 내부 불일치**이며, 코드는 본문을 따름) |
| `saveSnapshot` / `loadSnapshot` / `clearSnapshot` | 0.1 / F0-21 | `local-store.ts:54,87,112` | ✅ 일치. 512KB 초과 시 커밋 100건 절삭 → 재초과 시 저장 생략까지 구현(70-77) |
| `LocalSnapshot` 7필드 | 0.1 | `types/api.ts:110-118` | ✅ 일치 + 복원 검증용 zod 스키마 추가(121-131) |
| `SessionData` / `SessionUser` | 1-A | `types/api.ts:47-57` | ✅ 일치 |
| `sessionOptions` (`md_session`, ttl 8h, httpOnly/lax/secure) | 1-A | `session.ts:14-28` | ✅ 일치 (`password`·`secure` 를 getter 로 지연 평가) |
| `DashboardState` / `DashboardActions` | 1-C | `DashboardProvider.tsx:33-61` | ✅ 상위 호환. 스펙의 `setActivity(...)`·`setAnalysis(...)` 를 `setXxxStatus`/`setXxxError` 로 세분화 |
| `useActivity` / `useAnalysis` / `useContent` 반환 형태 | 1-C / 2-E / 3-E | `hooks/*.ts` | ✅ 3개 전부 일치 |
| `DraftCardProps` 7필드 | 3-E | `DraftCard.tsx:21-29` | ✅ 일치 |
| `PLATFORM_SPECS` | 3-A | `constants.ts:18-22` | ✅ 값까지 1:1 |
| `countChars` 위치 | 2장 트리는 `utils.ts`, 3-B 본문은 `drafts.ts` | `drafts.ts:49` | ⚠️ **TECH_SPEC 내부 불일치**. 코드는 상세 명세(3-B)를 따랐고 테스트도 `drafts.ts` 기준 — 코드 결함 아님 |

시그니처 편차는 총 3건이며 **2건은 TECH_SPEC 자체의 내부 불일치**, 1건은 요청 스키마와 정합을 맞춘 타입 축소다. 기능 영향은 없다.

### 3.3 API 명세 대조 (5장)

| Method | Endpoint | 스펙 | 코드 | 결과 |
|---|---|---|---|---|
| GET | `/api/auth/login` | 302 → authorize, scope `read:user` | `login/route.ts:19-38`, `github.ts:98-105` | ✅ + `state` 쿠키(httpOnly, 600초) |
| GET | `/api/auth/callback` | `302 /` 또는 `302 /?error=oauth_denied\|oauth_failed\|forbidden` | `callback/route.ts:17-90` | ✅ 3개 오류 값 전부 구현 |
| POST | `/api/auth/logout` | 204 | `logout/route.ts:13-19` | ✅ |
| GET | `/api/activity` | `?period=7\|30\|90` → `{ activity }` | `activity/route.ts:17-50` | ✅ `activityQuerySchema`(`types/api.ts:62-64`)로 검증, 실패 시 `INVALID_REQUEST` |
| POST | `/api/analyze` | `{ activity }` → `{ analysis }` | `analyze/route.ts:18-58` | ✅ 0건 가드·`generatedAt`/`lowVolume` 서버 부여 |
| POST | `/api/content` | `{ platforms, analysis, activity }` → 항상 `200 { results }` | `content/route.ts:49-87`, `types/api.ts:82-92` | ✅ `platforms` 1~3개·중복 불가 `refine` 포함 |

공통 규약: 6개 라우트 전부 `runtime='nodejs'` + `dynamic='force-dynamic'` 선언(grep 확인), 전부 `try/catch` 로 감쌈. 성공/실패 응답 모두 `Cache-Control: no-store` + JSON `Content-Type`(204·302 제외).

- 5개 라우트는 `catch → toErrorResponse(e)`.
- `callback` 만 `catch → 302 /?error=oauth_failed` — 이는 TECH_SPEC 1-A "어떤 경로에서도 예외를 던진 채 종료하지 않는다"를 따른 **의도된 예외**이며 AC-1.3 요구와 일치한다.

### 3.4 오류 코드 대조 (4.1)

| 코드 | 스펙 HTTP | 코드 HTTP | 메시지 일치 | 근거 |
|---|---|---|---|---|
| `UNAUTHORIZED` | 401 | 401 | ✅ "로그인이 필요합니다." | `api-error.ts:19-24` |
| `FORBIDDEN_USER` | 403 | 403 | ✅ "이 계정은 접근이 허용되지 않았습니다." | `:25-30` |
| `INVALID_REQUEST` | 400 | 400 | ✅ "요청이 올바르지 않습니다." | `:31-36` |
| `GITHUB_TOKEN_INVALID` | 401 | 401 | ✅ "로그인이 만료되었습니다. 다시 로그인해 주세요." | `:37-42` |
| `GITHUB_RATE_LIMIT` | 429 | 429 | ✅ "GitHub API 호출 한도를 초과했습니다. 잠시 후 다시 시도해 주세요." | `:43-48` |
| `GITHUB_ERROR` | 502 | 502 | ✅ "활동 데이터를 불러오지 못했습니다." | `:49-54` |
| `AI_TIMEOUT` | 504 | 504 | ✅ "분석에 시간이 너무 오래 걸립니다. 기간을 줄이거나 다시 시도해 주세요." | `:55-60` |
| `AI_ERROR` | 502 | 502 | ✅ "AI 분석에 실패했습니다." | `:61-66` |
| `INTERNAL` | 500 | 500 | ✅ "알 수 없는 오류가 발생했습니다." | `:67-72` |

**9/9 문구까지 글자 그대로 일치.** 추가로 스펙에 없는 `action`(login/retry/none)·`retryable` 필드를 두어 `ErrorNotice` 가 코드별 액션을 자동 선택한다(AC-1.8의 "재로그인 유도" 요구 충족).

### 3.5 설계 전제 Q1~Q7 반영

| Q | 확정 사항 | 반영 근거 | 결과 |
|---|---|---|---|
| Q1 | scope `read:user`, 공개 이벤트만, 화면 문구 상시 | `github.ts:24`, `github.ts:188`, `ActivityPanel.tsx:17,108`, `LoginScreen.tsx:64-66` | ✅ |
| Q2 | 커밋 100건 / PR·이슈 전체 / 스타는 저장소명만 | `constants.ts:13-15`, `prompts/analysis.ts:46,60-66`, `prompts.test.ts:86-123` | ✅ 상수 참조·테스트 고정 |
| Q3 | 분석/생성 2단계 분리, 통합 버튼 없음 | `AnalysisPanel.tsx:92-96`, `ContentPanel.tsx:33-37` | ✅ 통합 버튼 없음 |
| Q4 | 블로그 800자 이상 + H2 2개 이상 완성형 | `constants.ts:21,28`, `prompts/content.ts:47-52`, `drafts.ts:101-102` | ✅ |
| Q5 | 단일 키 스냅샷, 덮어쓰기, 512KB 상한 | `constants.ts:35,38,41`, `local-store.ts:54-84` | ✅ |
| Q6 | 총 5건 미만 시 소량 안내 | `constants.ts:44`, `analyze/route.ts:45`, `AnalysisPanel.tsx:27-31` | ✅ |
| Q7 | `ALLOWED_GITHUB_LOGINS` 화이트리스트, 비우면 전체 허용 | `env.ts:70-77`, `callback/route.ts:66-73` | ✅ 대소문자 무시 비교까지 구현 |

### 3.6 구조 규약

| 규약 | 결과 | 근거 |
|---|---|---|
| 모든 Route Handler `runtime='nodejs'` | ✅ 6/6 | grep 확인 |
| 모든 Route Handler `dynamic='force-dynamic'` | ✅ 6/6 (+ `page.tsx:6`) | grep 확인 |
| 모든 Route Handler `try/catch` | ✅ 6/6 | `callback` 만 redirect 로 수렴(의도됨) |
| `env.ts`/`session.ts`/`gemini.ts`/`github.ts` 에 `import 'server-only'` | ✅ 4/4 | 각 파일 1행 |
| 클라이언트 컴포넌트의 서버 전용 모듈 참조 | ✅ 0건 | `api-error.ts`(공용)·`constants.ts`·`utils.ts`·`drafts.ts` 만 공유 |
| 검증 매트릭스(6장) 27행 구현 위치 | ✅ 27/27 존재 | 지정 파일이 모두 실재 |

---

## 4. Stage 3 상세 — 코드 품질

전제: `any` 0건, `@ts-ignore`/`@ts-expect-error` 0건, `eslint-disable` 1건(아바타 `<img>`, 사유 주석 있음). 아래는 **재현 시나리오가 성립하는 실제 결함만** 기재한다.

### High

#### H-1. 기간 변경·초기화가 진행 중인 요청을 무효화하지 않아 옛 결과가 되살아난다

- **위치**: `src/hooks/useAnalysis.ts:30,50,63-66` · `src/hooks/useContent.ts:47,62-64,91-104` · `src/components/DashboardProvider.tsx:149-161,207-208`
- **원인**: 경쟁 방지용 `requestIdRef`/`requestIdsRef` 는 **훅 내부에서 새 요청을 시작할 때만** 증가한다. `setPeriod`(분석·초안 초기화)와 `resetAll`(전체 초기화)은 리듀서 상태만 비우고 이 ref 를 건드리지 않으므로, 초기화 이전에 나간 요청의 응답이 "최신 요청"으로 판정되어 그대로 상태에 기록된다.
- **재현 시나리오 A (기간 변경)**
  1. 기간 `7일` 로 활동 로드 → "분석" 클릭 (Gemini 응답에 10~30초 소요)
  2. 응답 도착 전 `30일` 버튼 클릭 — `PeriodSelector` 는 `activityStatus==='loading'` 일 때만 비활성이므로 **분석 중에는 클릭 가능**(`PeriodSelector.tsx:14`)
  3. 리듀서가 `analysis=null, analysisStatus='idle'` 로 초기화, 30일 활동 재조회 시작
  4. 잠시 뒤 7일 분석 응답이 도착 → `requestId === requestIdRef.current` 이므로 `setAnalysis(7일 결과)`, `setAnalysisStatus('success')`
  - **잘못된 결과**: 화면에는 `30일` 활동 요약 + `7일` 기준 분석 결과가 나란히 "성공" 상태로 표시된다. 사용자는 구분할 방법이 없다. 이 상태에서 "콘텐츠 생성"을 누르면 30일 수치 + 7일 서사가 섞인 초안이 만들어져 **AC-3.8/M3(사실 정확도)까지 오염**된다.
- **재현 시나리오 B (초기화)**: 콘텐츠 생성 중 헤더의 "초기화" 클릭 → 화면이 비워진 뒤 응답이 도착해 초안 3개가 다시 나타난다(`useContent.ts:91-104`, `isCurrent` 가 true 유지).
- **수정 제안**: 세대(generation) 카운터를 컨텍스트로 올린다. `DashboardProvider` 에 `requestGeneration: number` 를 두고 `setPeriod`·`resetAll` 리듀서에서 `+1` 한다. 각 훅은 요청 시작 시점의 `generation` 을 캡처해 응답 반영 직전 현재 값과 비교하고, 다르면 폐기한다. 부수적으로 `AbortController` 를 함께 붙이면 불필요한 API 비용도 줄어든다.

### Medium

#### M-1. 스키마 재시도로 총 대기 시간이 타임아웃의 2배(최대 120초)까지 늘어난다

- **위치**: `src/lib/gemini.ts:92-105`
- **원인**: 재시도 루프가 `requestText` 를 최대 2회 호출하는데, 두 번째 호출도 **같은 `timeoutMs`(60초)** 를 새로 부여받는다. 전체 요청에 대한 상한이 없다.
- **재현 시나리오**: Gemini 가 `highlights` 를 2개만 반환(모델의 `minItems` 는 강제가 아니라 힌트) → `analysisResultSchema.parse` 실패 → `gemini.ts:100` 경고 후 재요청. 각 호출이 55초씩 걸리면 사용자는 **약 110초 뒤에야** `AI_ERROR` 를 본다. AC-2.5가 약속한 "60초 초과 시 중단하고 메시지 표시"가 사용자 관점에서 지켜지지 않는다.
- **수정 제안**: `generateStructured` 진입 시 `deadline = Date.now() + timeoutMs` 를 잡고, 매 시도에 `remaining = deadline - Date.now()` 를 전달한다. `remaining <= 0` 이면 재시도하지 않고 `AI_TIMEOUT` 을 던진다.

#### M-2. 로그아웃 직후 디바운스 저장 타이머가 스냅샷을 되살린다

- **위치**: `src/components/DashboardProvider.tsx:241-263` · `src/components/Header.tsx:19-29`
- **원인**: 상태 변경 300ms 뒤 저장하는 타이머는 `DashboardProvider` 가 소유하는데, `Header.handleLogout` 은 이 타이머를 취소하지 않고 `clearSnapshot()` → `window.location.assign('/')` 만 호출한다. `assign` 은 네비게이션을 예약할 뿐 문서를 즉시 파괴하지 않으므로 대기 중인 타이머가 그 사이 실행될 수 있다.
- **재현 시나리오**: 초안 textarea 에 한 글자 입력(t=0, 저장 타이머 300ms 예약) → 곧바로(t≈50ms) "로그아웃" 클릭 → 로그아웃 API 응답(t≈80ms) → `clearSnapshot()` 실행 → t=300ms 에 타이머 발화 → `saveSnapshot()` 이 localStorage 에 다시 기록. 이후 같은 계정으로 재로그인하면 삭제됐어야 할 활동·분석·초안이 복원된다 → **AC-3.9 And("로그아웃하면 로컬에 보존된 내용이 삭제된다") 위반**.
- **참고**: "초기화"(`resetAll`, `DashboardProvider.tsx:332-336`)는 타이머를 먼저 취소하므로 같은 문제가 없다. 로그아웃 경로만 비대칭이다.
- **수정 제안**: 컨텍스트에 `flushAndClearSnapshot()`(타이머 취소 + `clearSnapshot()`)을 노출하고 `Header` 가 그것을 호출한다. 또는 `DashboardActions.resetAll()` 을 로그아웃 경로에서도 먼저 호출한다.

#### M-3. 초안 카드의 "다시 생성" 버튼이 항상 활성이라 무반응 클릭이 발생한다

- **위치**: `src/components/DraftCard.tsx:155-157` · `src/hooks/useContent.ts:52`
- **원인**: `ContentPanel` 의 "콘텐츠 생성" 버튼에는 `disabled` 가드가 있지만(`ContentPanel.tsx:25,34`), 카드별 "다시 생성" 버튼에는 `loading` 만 있고 `analysis === null` 가드가 없다. 훅의 `run()` 은 `analysis === null` 이면 **조용히 return** 한다.
- **재현 시나리오**: 로그인 → 활동 로드 완료 → (분석은 아직 실행하지 않음) → 임의 카드의 "다시 생성" 클릭. **잘못된 결과**: 로딩도, 오류도, 안내도 뜨지 않고 아무 일도 일어나지 않는다. 사용자는 버튼 고장으로 인식한다. (PRD M8 "처리되지 않은 오류로 인한 화면 중단 0건"의 취지인 *실패의 가시화* 관점에서도 어긋난다.)
- **수정 제안**: `DraftCardProps` 에 `canRegenerate: boolean` 을 추가해 `ContentPanel` 이 `analysis !== null` 을 내려주고, 버튼에 `disabled={!canRegenerate || isLoading}` 을 적용한다.

### Low

#### L-1. GitHub 응답을 검증 없이 신뢰한다 (`as GitHubEvent[]`)

- **위치**: `src/lib/github.ts:206` (`const pageEvents = batch as GitHubEvent[]`)
- **원인**: 배열 여부만 확인하고 원소 구조는 검증하지 않는다. `buildActivitySummary` 는 `repo.name`·`payload.commits`·`created_at` 결손은 방어하지만(`activity.ts:82-92`), `commit.sha`·`pull_request.number/title/html_url`·`issue.*` 는 그대로 복사한다.
- **재현 시나리오**: 어떤 이벤트의 `payload.pull_request.html_url` 이 누락되면 → `GET /api/activity` 는 `url: undefined` 를 담은 200 을 반환(라우트가 응답을 스키마로 검증하지 않음) → 사용자가 "분석" 클릭 → `POST /api/analyze` 의 `analyzeRequestSchema.safeParse` 실패 → `400 INVALID_REQUEST` → 화면에는 "요청이 올바르지 않습니다."만 표시되고, 재시도해도 같은 결과가 반복된다(원인 추적 불가).
- **참고**: 실제 GitHub 응답에서 이 필드들이 빠지는 사례는 확인하지 못했다. 구조적 취약성으로 분류한다.
- **수정 제안**: `GET /api/activity` 응답 직전에 `activitySummarySchema.safeParse` 를 한 번 통과시키고, 실패하면 `GITHUB_ERROR` 로 변환한다. 오류가 수집 단계에서 드러나 메시지가 정확해진다.

#### L-2. 글자 수 표시의 `aria-live="polite"` 가 타이핑마다 낭독된다

- **위치**: `src/components/DraftCard.tsx:119-128`
- **원인**: 글자 수 `<span>` 이 `aria-live="polite"` 를 갖는데, 이 값은 `textarea` 입력마다 바뀐다.
- **재현 시나리오**: 스크린리더(NVDA/VoiceOver)를 켜고 초안 textarea 에 문장을 입력하면 **글자를 칠 때마다** "123자", "124자" … 가 낭독되어 편집 내용 자체를 듣기 어렵다.
- **수정 제안**: 상시 `aria-live` 를 제거하고, textarea 에 `aria-describedby` 로 글자 수·경고 요소를 연결한다. 경고 전환(규격 위반 발생/해소) 시에만 알림이 필요하면 경고 배지 쪽에 `aria-live="polite"` 를 둔다.

#### L-3. 스냅샷 복원 시 활동 데이터를 재조회하지 않아 오래된 수치가 최신처럼 보인다

- **위치**: `src/hooks/useActivity.ts:90-93`
- **원인**: 복원된 스냅샷의 기간이 현재 기간과 같으면 조회를 건너뛴다. 스냅샷에는 만료 개념이 없다(`local-store.ts`, TECH_SPEC 0.1 "만료 개념 없음").
- **재현 시나리오**: 월요일에 "최근 7일" 활동을 조회하고 창을 닫는다 → 금요일에 다시 접속하면 월요일 시점의 커밋 수·저장소 목록이 **그날 데이터인 것처럼** 표시되고(`period.from/to` 는 월요일 값), 사용자가 기간 버튼을 누르기 전까지 갱신되지 않는다.
- **참고**: 이 동작 자체는 TECH_SPEC 1-C("스냅샷에 동일 기간 활동이 있으면 재호출 생략")를 그대로 따른 것이라 **스펙 위반은 아니다.** 다만 PRD 5.1이 캐싱 레이어를 Out of Scope 로 둔 취지와는 어긋난다.
- **수정 제안**: 스냅샷의 `savedAt` 이 일정 시간(예: 30분) 이상 지났으면 활동만 재조회한다. 초안·분석은 그대로 복원해 AC-3.9는 유지된다.

### 코드 스타일 일관성 (문제 없음)

F1·F2·F3의 훅·컴포넌트 패턴이 동일하다.

- 훅 3개 모두 `'use client'` → `useDashboard()` 소비 → `requestId` ref 로 경쟁 방지 → `!response.ok` 시 `ApiErrorResponse` 파싱 → `catch` 에서 `INTERNAL` 로 수렴 → `{ 데이터, status, error, 액션 }` 반환.
- 패널 3개 모두 `Card(title/description/actions/footer)` + `status` 4분기(loading/error/success/idle) 렌더.
- 상수·문구는 전부 `constants.ts` 또는 파일 상단 상수로 추출되어 하드코딩이 없다(`drafts.ts:113-117` 은 `PLATFORM_SPECS` 값으로 메시지를 조립).
- 순수 함수(`activity.ts`·`drafts.ts`·`prompts/*`)에 시각·네트워크·환경변수 접근이 없어 테스트가 결정적이다.

---

## 5. UNVERIFIABLE 항목과 수동 확인 절차

### 5.1 정적 분석으로 확정할 수 없는 항목

| # | 항목 | 이유 |
|---|---|---|
| U-1 | **AC-2.4** 분석 결과가 실제로 한국어인가 | 모델 출력에 의존 (프롬프트 지시·테스트는 확인됨) |
| U-2 | **AC-2.2** 기간 요약이 3~5문장인가 | 문장 수는 스키마로 강제 불가 |
| U-3 | **AC-2.3** 표시된 `evidence` 가 실제 활동에 존재하는가 | 값 대조 필요 |
| U-4 | **AC-3.3** 생성물이 600~1,300 / 280 / 800자+H2 2개를 실제로 충족하는가 | 모델 출력 의존 (경고 로직만 검증됨) |
| U-5 | **AC-3.8 / M3** 환각 0건 / 10회 생성 | 수동 대조 필요 |
| U-6 | **AC-1.8** rate limit·토큰 만료의 실제 분기 | 실제 429/401 응답 필요 |
| U-7 | **AC-1.2/1.3** OAuth 왕복 전체 | 실제 GitHub OAuth App 필요 |
| U-8 | **M1** 5분 이내 완주 / **M5~M7** 응답 시간 | 실측 필요 |
| U-9 | **M8** 흰 화면 0건 | 오류 시나리오 실행 필요 |

### 5.2 수동 확인 절차

#### 준비

1. GitHub → Settings → Developer settings → **OAuth Apps → New OAuth App**
   - Homepage URL `http://localhost:3000`, Authorization callback URL `http://localhost:3000/api/auth/callback`
2. `cp .env.example .env.local` 후 값 입력
   - `SESSION_SECRET` 은 32자 이상: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `GEMINI_API_KEY` 는 Google AI Studio 발급
   - 최초 검증에서는 `ALLOWED_GITHUB_LOGINS` 를 **비워 둔다**(전체 허용 모드 확인용)
3. `npm install && npm run dev`

#### 절차 A — 정상 흐름 완주 (M1, AC-1.2/1.4/1.5/2.1/3.2, M5~M7)

| 순서 | 조작 | 확인 |
|---|---|---|
| A-1 | 스톱워치 시작, `http://localhost:3000` 접속 | 로그인 버튼만 보이고 활동/분석/생성 영역이 **DOM 에 없음**(개발자도구 Elements 검색) — AC-1.1 |
| A-2 | "GitHub으로 로그인" → 동의 | 헤더에 아바타 + `@login` — AC-1.2 |
| A-3 | 기간 컨트롤 확인 | 7/30/90 제공, **7일 선택 상태** — AC-1.4 |
| A-4 | 활동 로드 완료 대기 | 커밋/PR(생성·머지·종료)/이슈(생성·종료)/스타 4개 카드 + **각 카드 아래 저장소명 목록** — AC-1.5. Network 탭에서 `/api/activity` 소요 시간 기록 → **10초 이내(M5)** |
| A-5 | 기간을 30일로 변경 후 다시 7일 | 각 전환마다 재조회, 분석·초안이 초기화되는지 — AC-2.8 |
| A-6 | "분석" 클릭 | 로딩 표시 → 요약/하이라이트/인사이트 3영역. **요약이 3~5문장인지 육안 확인(U-2)**, **전부 한국어인지(U-1)**, 하이라이트마다 근거 칩 존재 — AC-2.2/2.3/2.4. 소요 시간 **30초 이내(M6)** |
| A-7 | 하이라이트 근거 칩 3~5개를 활동 카드의 저장소명·PR 제목과 대조 | 존재하지 않는 근거 0건 — U-3 |
| A-8 | "콘텐츠 생성" 클릭 | 3개 카드가 동시에 채워짐 — AC-3.2. 소요 시간 **45초 이내(M7)** |
| A-9 | 각 카드 우측 글자 수 확인 | LinkedIn 600~1,300 / X ≤280 / 블로그 ≥800 & `##` 2개 이상. 경고 배지 유무가 실제 값과 일치 — U-4, AC-3.3 |
| A-10 | 초안에 등장하는 저장소명·수치를 활동 카드와 대조 | 없는 저장소명·수치 0건 — U-5. **A-6~A-10을 10회 반복해 M3 측정** |
| A-11 | 스톱워치 정지 | **5분 이내(M1)**. 3회 반복 평균 |

#### 절차 B — 편집·복사·보존 (AC-3.4/3.5/3.6/3.7/3.9)

| 순서 | 조작 | 확인 |
|---|---|---|
| B-1 | LinkedIn textarea 에 한 글자씩 입력 | 글자 수가 **타이핑마다** 즉시 변함 — AC-3.4 |
| B-2 | B-1 상태에서 X·블로그 카드 확인 | 본문 불변, "수정됨" 표시는 LinkedIn 에만 — AC-3.5 |
| B-3 | LinkedIn "복사" 클릭 후 메모장에 붙여넣기 | **편집한 내용**이 그대로, "복사되었습니다" 2초 표시 — AC-3.6 |
| B-4 | X 카드 "다시 생성" 클릭 | X 카드만 로딩 → 교체. **LinkedIn 편집분·블로그 본문 유지** — AC-3.7 |
| B-5 | F5 새로고침 | 활동·분석·초안(편집분 포함)이 그대로 복원 — AC-3.9 |
| B-6 | "초기화" 클릭 후 F5 | 아무것도 복원되지 않음. DevTools → Application → Local Storage 에 `marketing-dashboard:snapshot:v1` **부재** — AC-3.9 And |
| B-7 | 다시 생성 후 "로그아웃" → 재로그인 | 이전 초안이 복원되지 **않아야** 함. **초안 편집 직후 300ms 안에 로그아웃하는 케이스도 시도** → 복원되면 **M-2 재현** |

#### 절차 C — 실패 시나리오 (AC-1.3/1.7/1.8/2.5/2.6/3.10, M8)

| 순서 | 조작 | 확인 |
|---|---|---|
| C-1 | 로그아웃 후 로그인 → GitHub 동의 화면에서 **취소** | `/?error=oauth_denied` 로 복귀, "GitHub 로그인에 실패했습니다. 다시 시도해 주세요." + 재시도 버튼. **흰 화면 없음** — AC-1.3, M8 |
| C-2 | 주소창에 `http://localhost:3000/api/auth/callback?code=bogus&state=bogus` 직접 입력 | `/?error=oauth_failed` 로 복귀(예외·500 아님) — AC-1.3 |
| C-3 | `.env.local` 에 `ALLOWED_GITHUB_LOGINS=someone-else` 설정 후 재시작 → 로그인 | `/?error=forbidden` + "이 계정은 접근이 허용되지 않았습니다."(재시도 버튼 없음) — Q7 |
| C-4 | 활동이 0건인 기간을 선택(또는 신규 계정) | "선택한 기간에 활동 기록이 없습니다…" + **"분석" 버튼 비활성** — AC-1.7 |
| C-5 | DevTools → Application → Cookies 에서 `md_session` 값을 임의로 변조 후 기간 변경 | "로그인이 필요합니다."/"로그인이 만료되었습니다…" + **로그인 버튼** 노출 — AC-1.8 |
| C-6 | `constants.ts` 의 `ANALYSIS_TIMEOUT_MS` 를 `1_000` 으로 낮추고 "분석" | "분석에 시간이 너무 오래 걸립니다…" + 재시도 버튼, **활동 카드는 그대로 유지** — AC-2.5, AC-2.6 |
| C-7 | `GEMINI_API_KEY` 를 잘못된 값으로 바꾸고 재시작 → "분석" | "AI 분석에 실패했습니다." + 재시도, **활동 데이터 유지** — AC-2.6. 응답까지 걸린 시간을 기록 → 60초를 넘으면 **M-1 재현** |
| C-8 | `prompts/content.ts` 의 `buildContentPrompt` 에서 `platform==='x'` 일 때만 `throw new Error('강제 실패')` 를 임시 삽입 → "콘텐츠 생성" | LinkedIn·블로그는 정상 표시, **X 카드에만** 오류 + "다시 생성" — AC-3.10 |
| C-9 | 서버를 끈 상태에서 "분석"·"콘텐츠 생성" | "알 수 없는 오류가 발생했습니다." + 재시도. 흰 화면 0건 — M8 |

#### 절차 D — 보안 (AC-2.7, M9)

| 순서 | 조작 | 확인 |
|---|---|---|
| D-1 | `npm run build` 후 `grep -r "GEMINI_API_KEY\|GITHUB_CLIENT_SECRET\|SESSION_SECRET" .next/static` | 0건 (호출자가 이미 확인) |
| D-2 | 브라우저 Network 탭 전체 관찰 | `generativelanguage.googleapis.com`·`api.github.com` 으로 나가는 **클라이언트 직접 요청 0건** |
| D-3 | Application → Cookies → `md_session` | `HttpOnly` 체크, 값이 암호문 |

#### 절차 E — H-1 재현 확인 (수정 후 회귀 테스트용)

| 순서 | 조작 | 기대(수정 후) |
|---|---|---|
| E-1 | 7일 기간에서 "분석" 클릭 → **응답 도착 전** 30일로 전환 | 7일 분석 결과가 표시되지 **않아야** 함 (현재는 표시됨 = 결함) |
| E-2 | "콘텐츠 생성" 클릭 → 진행 중 "초기화" 클릭 | 초안이 되살아나지 **않아야** 함 (현재는 되살아남 = 결함) |

---

## 6. 개선 권고 (우선순위 순)

| 순위 | 항목 | 근거 | 예상 규모 |
|---|---|---|---|
| **P0** | **H-1** 세대 카운터로 in-flight 요청 무효화 (`DashboardProvider` + 훅 3개) | 사용자에게 잘못된 데이터를 보여 주고 AC-2.8·AC-3.8/M3 을 오염시킴 | 훅 3개 + 컨텍스트 1개, 소규모 |
| **P0** | **M-2** 로그아웃 시 디바운스 타이머 취소 후 스냅샷 삭제 | AC-3.9 And 위반. 수정 비용이 매우 낮음(`resetAll` 재사용) | 파일 2개, 수 줄 |
| **P1** | **M-1** `generateStructured` 에 전체 요청 deadline 도입 | AC-2.5의 60초 보증을 사용자 관점에서 복원 | `gemini.ts` 1파일 |
| **P1** | **M-3** `DraftCard` "다시 생성" 버튼에 `analysis` 가드 추가 | 무반응 클릭 제거(실패의 가시화) | 파일 2개 |
| **P2** | **L-1** `GET /api/activity` 응답을 `activitySummarySchema` 로 자체 검증 | 오류를 수집 단계에서 정확한 코드로 노출 | `activity/route.ts` 1파일 |
| **P2** | **L-2** 글자 수의 상시 `aria-live` 제거 + `aria-describedby` 연결 | 스크린리더 사용성 | `DraftCard.tsx` 1파일 |
| **P2** | `PeriodSelector` 를 분석·생성 진행 중에도 비활성화 | H-1의 대증 요법이자 UX 일관성(AC-1.6의 취지) | `PeriodSelector.tsx` 1파일 |
| **P3** | **L-3** 스냅샷 `savedAt` 기준 활동 신선도 정책(예: 30분) | 오래된 활동 수치를 최신처럼 표시하는 문제 완화 | `useActivity.ts` 1파일 |
| **P3** | TECH_SPEC 내부 불일치 2건 정정 (`countChars` 위치, `saveSession` 표기) | 문서 신뢰도. 코드 변경 불필요 | 문서만 |
| **P3** | AI 오류 메시지를 F2/F3 문맥별로 분리 | 콘텐츠 카드에도 "AI **분석**에 실패했습니다."가 표시됨(4.1 표를 따른 결과) | `api-error.ts` + 호출부 |

---

## 7. 부록: 검증에 사용한 근거

| 근거 | 출처 |
|---|---|
| `npx tsc --noEmit` exit 0 / `npm run lint` exit 0 | 호출자 실행 결과 |
| `npx vitest run` → 3 파일 41 tests 통과 (activity 10 / prompts 7 / drafts 24) | 호출자 실행 결과 |
| `npm run build` 성공, 라우트 `/`, `/api/activity`, `/api/analyze`, `/api/auth/{login,callback,logout}`, `/api/content` | 호출자 실행 결과 |
| `.next/static` 번들에 시크릿 문자열 0건 | 호출자 실행 결과 |
| 소스 전수 정독 (`src/` 42 + 루트 설정 9) | 본 검증 |
| 런타임 E2E | **미실행** — 5.2 절차로 이관 |

---

## 8. 수정 이력 (2026-08-13)

6장 권고 중 **P0 2건 + P1 2건**을 반영했다. 나머지(L-1·L-2·L-3, P2 `PeriodSelector` 비활성화, P3 3건)는 **미반영**이다.

| 항목 | 상태 | 변경 내용 | 파일 |
|---|---|---|---|
| **H-1** in-flight 요청 무효화 | ✅ 수정 | `DashboardState.requestGeneration` + `DashboardActions.getRequestGeneration()` 도입. `setPeriod`(값이 실제로 바뀔 때만)·`resetAll` 이 세대를 +1 한다. 훅 3개가 요청 시작 시 세대를 캡처하고 응답 반영 직전 재대조해 불일치 시 폐기. `useActivity` 는 세대 변경 시 `loadedPeriodRef` 를 비워 초기화 직후 화면이 빈 채로 멈추지 않게 한다 | `DashboardProvider.tsx`, `useActivity.ts`, `useAnalysis.ts`, `useContent.ts` |
| **M-2** 로그아웃 후 스냅샷 부활 | ✅ 수정 | `Header.handleLogout` 이 `clearSnapshot()` 직접 호출 대신 `resetAll()` 을 호출한다(타이머 취소 → 스냅샷 삭제 → 상태 초기화 순). `clearSnapshot` import 제거 | `Header.tsx`, `DashboardProvider.tsx` |
| **M-1** 재시도로 대기 2배 | ✅ 수정 | `generateStructured` 진입 시 `deadline = now + timeoutMs` 를 잡고 매 시도에 잔여 시간만 전달. 잔여 ≤ 0 이면 재시도 없이 `AI_TIMEOUT`. `timeoutMs` 의 의미가 "호출 1회"에서 **"함수 전체 상한"**으로 바뀌었다 | `gemini.ts` |
| **M-3** 재생성 무반응 클릭 | ✅ 수정 | `DraftCardProps.canRegenerate` 추가. `ContentPanel` 이 `analysis !== null` 을 내려주고 버튼에 `disabled={!canRegenerate \|\| isLoading}` 적용 | `DraftCard.tsx`, `ContentPanel.tsx` |
| L-1 활동 응답 자체 검증 | ⬜ 미반영 | — | — |
| L-2 글자 수 `aria-live` | ⬜ 미반영 | — | — |
| L-3 스냅샷 신선도 | ⬜ 미반영 | — | — |
| P2 분석 중 `PeriodSelector` 비활성화 | ⬜ 미반영 | H-1이 근본 수정으로 해결되어 대증 요법은 보류. 분석 중 기간 변경은 여전히 **가능**하되, 이제 진행 중 결과가 폐기된다 | — |
| P3 TECH_SPEC 내부 불일치 2건 | ⬜ 미반영 | `countChars` 위치, `saveSession` 표기 — 코드 변경 불필요 | — |

### 재검증 결과 (수정 후)

| 게이트 | 결과 |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| `npx vitest run` | 3 파일 **41 tests 통과** (회귀 없음) |
| `npm run build` | 성공 (라우트 8개) |

### PARTIAL 판정 갱신

| AC | 이전 | 현재 | 근거 |
|---|---|---|---|
| **AC-2.5** 60초 타임아웃 | PARTIAL | **PASS(정적)** | M-1 수정으로 전체 상한이 60초로 고정. 실측은 5.2 절차 C-7 |
| **AC-2.8** 재분석 | PARTIAL | **PASS(정적)** | H-1 수정으로 기간 변경 시 진행 중 분석이 폐기됨. 실측은 5.2 절차 E-1 |
| **AC-3.3** 플랫폼별 형식 | PARTIAL | PARTIAL 유지 | 모델 출력 의존이 원인이므로 코드 수정으로 해소되지 않음 → 절차 A-9 |

> **수정 후에도 런타임 검증은 여전히 필요하다.** 위 PASS는 전부 정적 판정이며, 5.2절 절차 A~E(특히 **E-1 · E-2**, **B-7**, **C-7**)로 실제 재현 여부를 확인해야 확정된다.
