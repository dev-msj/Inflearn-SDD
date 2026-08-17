# TECH_SPEC: Marketing Dashboard

> PRD 참조: `docs/PRD.md` (v1.0)
> 대상 범위: MVP 기능 3개(F1 GitHub 로그인·활동 수집 / F2 AI 활동 분석 / F3 플랫폼별 콘텐츠 생성), 수용 기준 27개(AC-1.1~1.9, AC-2.1~2.8, AC-3.1~3.10)

| 항목 | 내용 |
|---|---|
| 문서 버전 | v1.0 |
| 작성일 | 2026-08-11 |
| 선행 문서 | `docs/PRD.md` |
| 후행 단계 | `/sdd-build` → `docs/tasks/*.md`, `src/` |
| 구현 대상 파일 수 | **51개** (「2. 프로젝트 구조」 전수 목록) |

---

## 0. 설계 전제 (PRD 미해결 질문에 대한 확정)

PRD 8장의 미해결 질문 중 TECH_SPEC 단계에서 결정해야 할 항목을 아래와 같이 **확정**한다. 이후 구현 단계에서 재논의하지 않는다.

| PRD Q | 확정 사항 | 반영 위치 |
|---|---|---|
| Q1 | **공개 저장소만 조회.** GitHub OAuth scope는 `read:user` 만 요청하고, 활동은 `GET /users/{login}/events/public` 로만 수집한다. 화면에 "공개 저장소 활동 기준" 문구를 상시 표시 | `src/app/api/auth/login/route.ts`, `src/lib/github.ts`, `src/components/ActivityPanel.tsx` |
| Q2 | **AI 투입 데이터 상한**: 커밋은 **최근 100건**(최신순), PR·이슈는 **전체**, 스타는 **저장소명만**. 상수로 고정하고 프롬프트 빌더가 이 상수만 참조 | `src/lib/constants.ts` (`AI_INPUT_LIMITS`), `src/lib/prompts/analysis.ts` |
| Q3 | **분석(F2)과 콘텐츠 생성(F3)은 별도 2단계 액션 유지.** "한 번에 생성" 통합 버튼을 두지 않는다 | `src/components/AnalysisPanel.tsx`, `src/components/ContentPanel.tsx` |
| Q4 | 블로그 초안은 **800자 이상의 완성형 초안**(개요 수준 금지). H2 소제목 2개 이상 포함 | `src/lib/prompts/content.ts`, `src/lib/drafts.ts` |
| Q5 | **로컬 저장은 최근 1세션 분량만.** 단일 키에 스냅샷 1개를 저장하고 새 생성 시 덮어쓴다. 히스토리·목록 없음 | `src/lib/local-store.ts` |
| Q6 | 활동 총건수가 **5건 미만**이면 분석·생성은 수행하되 "활동량이 적어 초안 품질이 낮을 수 있습니다" 안내를 표시 | `src/lib/constants.ts` (`LOW_ACTIVITY_THRESHOLD`), `src/components/AnalysisPanel.tsx` |
| Q7 | **로컬 실행 기준으로 개발.** 접근 제한은 OAuth 콜백에서 `ALLOWED_GITHUB_LOGINS` 환경변수 화이트리스트로 강제 (비우면 전체 허용 = 로컬 전용 모드) | `src/lib/env.ts`, `src/app/api/auth/callback/route.ts` |

### 0.1 로컬 저장 스키마 (Q5 확정)

```typescript
// localStorage 키: 고정 단일 키. 새 스냅샷 저장 시 항상 덮어쓴다.
export const LOCAL_STORE_KEY = 'marketing-dashboard:snapshot:v1';

export interface LocalSnapshot {
  version: 1;                 // 스키마 버전. 불일치 시 스냅샷 폐기
  savedAt: string;            // ISO 8601
  login: string;              // 저장 시점의 GitHub 로그인 ID. 불일치 시 폐기
  periodDays: PeriodDays;     // 7 | 30 | 90
  activity: ActivitySummary | null;
  analysis: AnalysisResult | null;
  drafts: ContentDraft[];     // 사용자가 편집한 최신 본문 포함
}
```

- **보존 기간**: 만료 개념 없음. 다음 저장 시 덮어쓰기, 로그아웃/초기화 시 삭제.
- **용량 상한**: 직렬화 결과가 `MAX_SNAPSHOT_BYTES`(512KB)를 초과하면 `activity.commits`를 최근 100건으로 잘라 재시도하고, 그래도 초과하면 저장을 건너뛴다(콘솔 경고만, 화면 흐름은 유지).
- **폐기 조건**: `version` 불일치, `login` 불일치, JSON 파싱 실패 → 조용히 삭제 후 빈 상태로 시작.

---

## 1. 기술 스택

| 구분 | 기술 | 버전 | 선정 근거 |
|------|------|------|----------|
| Framework | Next.js (App Router + Route Handlers) | 15.5+ | PRD 6.4 확정 제약. 서버 전용 Route Handler로 Gemini/GitHub 시크릿을 클라이언트와 분리(AC-2.7) |
| Runtime | React | 19.1+ | Next.js 15 기본 |
| Language | TypeScript | 5.9+ | PRD 6.4 확정 제약. 타입으로 F1→F2→F3 데이터 계약 고정 |
| Styling | Tailwind CSS v4 (+ `@tailwindcss/postcss`) | 4.1+ | 단일 페이지·컴포넌트 10여 개 규모. 컴포넌트 라이브러리(shadcn/ui 등)를 도입하면 `components.json`·registry 의존이 늘어나는 데 비해 얻는 것이 적어 **미도입**. 필요한 UI 프리미티브 4개만 자체 구현 |
| Session | `iron-session` | 8.0+ | DB 없음(PRD 6.4). AES-GCM 암호화된 stateless 쿠키 하나로 GitHub 액세스 토큰을 서버에서만 다룰 수 있음. next-auth 대비 설정 표면이 작고 화이트리스트 로직을 콜백에 직접 넣기 쉬움 |
| GitHub API | `fetch` (내장) + 자체 얇은 클라이언트 | - | 사용 엔드포인트가 2개(`/user`, `/users/{login}/events/public`)뿐. Octokit 도입 이득 없음. rate limit 헤더 해석을 직접 제어해야 AC-1.8 오류 구분이 정확해짐 |
| AI | `@google/genai` (Google Gen AI SDK) | 1.x | PRD 명시 Gemini API. `responseMimeType: application/json` + `responseSchema` 구조화 출력으로 AC-2.2/AC-3.2 파싱 실패 위험 제거 |
| AI Model | `gemini-flash-latest` (별칭) | - | 분석·생성 모두 30~45초 목표(M6/M7) 충족에 유리한 지연·비용 균형(실측 4.1초). **고정 버전을 쓰지 않는다** — `gemini-2.5-flash` 를 박아뒀더니 해당 모델이 신규 사용자에게 차단되면서 `404 no longer available to new users` 로 F2·F3 전체가 멈췄다(2026-08). 별칭은 현행 flash 모델을 따라가므로 같은 방식으로 깨지지 않는다. 특정 버전 고정이 필요하면 `GEMINI_MODEL` 로 덮어쓴다 |
| Validation | `zod` | 4.x | Route Handler 요청 본문과 Gemini JSON 응답을 같은 스키마 소스로 검증. 도메인 타입의 단일 출처 |
| State | React Context + `useState`/`useReducer` | - | 1인 사용자·단일 페이지. 외부 상태 라이브러리 불필요 |
| Storage | `localStorage` (스냅샷 1개) + 암호화 쿠키 세션 | - | PRD 6.4: DB 미사용 |
| Test | Vitest | 3.x | 순수 함수(활동 집계·프롬프트 빌드·초안 검증) 단위 테스트 전용. jsdom·E2E 러너는 도입하지 않음(UI는 수동 E2E 체크리스트로 검증) |
| Lint | ESLint 9 (`eslint-config-next`) | 9.x / 15.5+ | Next.js 기본 |

### 1.1 환경 변수

모두 **서버 전용**이며 `NEXT_PUBLIC_` 접두사를 쓰지 않는다(AC-2.7, C10). `.env.local`은 `.gitignore`에 포함한다.

| 변수 | 필수 | 설명 |
|---|---|---|
| `GITHUB_CLIENT_ID` | ✅ | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | ✅ | GitHub OAuth App Client Secret |
| `GITHUB_OAUTH_REDIRECT_URI` | ✅ | 예: `http://localhost:3000/api/auth/callback` |
| `SESSION_SECRET` | ✅ | iron-session 암호화 키. 32자 이상 |
| `ALLOWED_GITHUB_LOGINS` | ⭕ | 쉼표 구분 로그인 ID 화이트리스트. **비우면 전체 허용**(로컬 전용 모드) — Q7 |
| `GEMINI_API_KEY` | ✅ | Gemini API 키 |
| `GEMINI_MODEL` | ⭕ | 기본값 `gemini-flash-latest` (별칭). 고정 버전은 은퇴 시 404 로 기능이 멈추므로 필요할 때만 지정 |

---

## 2. 프로젝트 구조

> 아래 트리는 **구현 대상 전수 목록(51개 파일)** 이다. 여기 없는 파일은 구현되지 않는다.
> `node_modules/`, `.next/`, `next-env.d.ts`, `package-lock.json`, `.env.local` 은 도구가 자동 생성하므로 제외한다.

```
marketing_dashboard/
├── package.json                              # 의존성·스크립트 (dev/build/start/lint/test/typecheck)
├── tsconfig.json                             # strict, paths: @/* → ./src/*
├── next.config.ts                            # Next.js 설정 (최소 구성)
├── eslint.config.mjs                         # ESLint 9 flat config (next/core-web-vitals + TS)
├── postcss.config.mjs                        # @tailwindcss/postcss 플러그인
├── vitest.config.ts                          # Vitest 설정 (node 환경, @ alias)
├── .env.example                              # 환경 변수 템플릿 (1.1 표와 동일)
├── .gitignore                                # node_modules/.next/.env*.local 제외
├── README.md                                 # 실행 방법·OAuth App 설정·환경 변수 안내
├── docs/
│   ├── PRD.md                                # (기존)
│   └── TECH_SPEC.md                          # (본 문서)
└── src/
    ├── app/
    │   ├── layout.tsx                        # 루트 레이아웃 (lang="ko", 폰트, globals.css)
    │   ├── globals.css                       # Tailwind v4 진입 + 디자인 토큰
    │   ├── page.tsx                          # 합성 루트: 세션 분기 → LoginScreen | Dashboard
    │   └── api/
    │       ├── auth/
    │       │   ├── login/route.ts            # GET  GitHub OAuth authorize 리다이렉트
    │       │   ├── callback/route.ts         # GET  code 교환 + 화이트리스트 + 세션 생성
    │       │   └── logout/route.ts           # POST 세션 파기
    │       ├── activity/route.ts             # GET  기간별 활동 수집 → ActivitySummary
    │       ├── analyze/route.ts              # POST 활동 → Gemini 분석 결과
    │       └── content/route.ts              # POST 분석 → 플랫폼별 초안 (부분 실패 허용)
    ├── types/
    │   ├── domain.ts                         # 도메인 zod 스키마 + 추론 타입 (Activity/Analysis/Content)
    │   └── api.ts                            # Route Handler 요청·응답 스키마, ApiError, SessionData
    ├── lib/
    │   ├── env.ts                            # 서버 환경 변수 로드·검증 (server-only)
    │   ├── constants.ts                      # 기간 옵션, AI 투입 상한, 타임아웃, 저장 키, 임계값
    │   ├── session.ts                        # iron-session 설정, getSession/saveSession/destroySession
    │   ├── api-error.ts                      # ApiErrorCode → HTTP 응답·사용자 메시지 매핑
    │   ├── utils.ts                          # cn(), countChars(), formatDateRange(), truncate()
    │   ├── gemini.ts                         # Gemini 클라이언트 + generateStructured(타임아웃/재시도)
    │   ├── local-store.ts                    # LocalSnapshot 저장·복원·삭제 (클라이언트 전용)
    │   ├── github.ts                         # GitHub REST 호출 + rate limit/토큰 오류 판별
    │   ├── activity.ts                       # 이벤트 → ActivitySummary 집계·기간 필터·정렬
    │   ├── drafts.ts                         # 초안 글자 수·형식 검증·미확인 저장소명 탐지
    │   ├── prompts/
    │   │   ├── analysis.ts                   # F2 프롬프트 + Gemini responseSchema
    │   │   └── content.ts                    # F3 플랫폼별 프롬프트 + Gemini responseSchema
    │   └── __tests__/
    │       ├── activity.test.ts              # 이벤트 픽스처 → 집계 결과 검증 (F1)
    │       ├── prompts.test.ts               # 분석 프롬프트 상한·한국어 지시 검증 (F2)
    │       └── drafts.test.ts                # 글자 수·280자 초과·미확인 저장소명 검증 (F3)
    ├── components/
    │   ├── ui/
    │   │   ├── Button.tsx                    # variant/size/loading/disabled 버튼
    │   │   ├── Card.tsx                      # 섹션 카드 (title/description/actions/children)
    │   │   ├── Spinner.tsx                   # 로딩 인디케이터
    │   │   └── ErrorNotice.tsx               # 오류 메시지 + 재시도/로그인 액션
    │   ├── DashboardProvider.tsx             # 전역 상태 컨텍스트 + localStorage 동기화
    │   ├── LoginScreen.tsx                   # 로그인 전 화면 + OAuth 실패 메시지
    │   ├── Header.tsx                        # 아바타·로그인 ID·초기화·로그아웃
    │   ├── PeriodSelector.tsx                # 7/30/90일 선택 (기본 7일)
    │   ├── ActivityPanel.tsx                 # 커밋·PR·이슈·스타 건수 + 저장소 목록
    │   ├── AnalysisPanel.tsx                 # 분석 실행 버튼 + 요약·하이라이트·인사이트
    │   ├── ContentPanel.tsx                  # 콘텐츠 생성 버튼 + 3개 초안 영역 + 상시 안내
    │   ├── DraftCard.tsx                     # 초안 1개 편집·글자 수·복사·다시 생성
    │   └── Dashboard.tsx                     # 로그인 후 전체 합성 (Header~ContentPanel)
    └── hooks/
        ├── useActivity.ts                    # GET /api/activity 호출·상태 관리
        ├── useAnalysis.ts                    # POST /api/analyze 호출·상태 관리
        └── useContent.ts                     # POST /api/content 호출·부분 재생성·편집
```

**파일 수 집계**: 루트 9 + `src/app` 9 + `src/types` 2 + `src/lib` 12 + `src/lib/__tests__` 3 + `src/components` 13 + `src/hooks` 3 = **51개**
(`docs/PRD.md`, `docs/TECH_SPEC.md`는 이미 존재하는 문서이므로 구현 대상에서 제외)

### 2.1 아키텍처 개요

```
[브라우저]                          [Next.js 서버 (Route Handlers)]        [외부]
 LoginScreen ──── GET /api/auth/login ──────► 302 authorize ──────────────► GitHub OAuth
 (콜백 복귀) ◄─── GET /api/auth/callback ◄─── code 교환 + /user + 화이트리스트
                                     └─ iron-session 쿠키(md_session) 발급
 useActivity ──── GET /api/activity?period=7 ─► github.ts ────────────────► GET /users/{login}/events/public
                                     └─ activity.ts 집계 → ActivitySummary
 useAnalysis ──── POST /api/analyze ─────────► prompts/analysis.ts + gemini.ts ─► Gemini
 useContent  ──── POST /api/content ─────────► prompts/content.ts + gemini.ts ─► Gemini (플랫폼별 병렬)
 DashboardProvider ── localStorage 스냅샷 저장/복원 (클라이언트 단독)
```

- **시크릿 경계**: `GEMINI_API_KEY`, `GITHUB_CLIENT_SECRET`, GitHub 액세스 토큰은 `src/lib/env.ts`·`src/lib/session.ts`를 통해서만 접근되며 두 파일 모두 최상단에 `import 'server-only';`를 둔다. 클라이언트 컴포넌트가 실수로 import하면 **빌드가 실패**한다 → AC-2.7 / M9의 구조적 보장.
- **모든 Route Handler**는 `export const dynamic = 'force-dynamic'` 및 `export const runtime = 'nodejs'` 를 선언한다(세션 쿠키·Node crypto 사용).

---

## 3. 구현 명세

### 기능 1: GitHub OAuth 로그인 + 활동 데이터 수집 → 구현 명세

> PRD 매핑: F1 — "GitHub 계정으로 한 번 로그인하고 기간만 선택하면 그 기간의 내 활동이 자동으로 모여 보이기를 원한다"
> 대응 AC: AC-1.1 ~ AC-1.9

#### 1-A. 인증 (`src/lib/session.ts`, `src/app/api/auth/*`)

**세션 타입** (`src/types/api.ts`):

```typescript
export interface SessionUser {
  login: string;        // GitHub 로그인 ID
  name: string | null;  // 표시 이름
  avatarUrl: string;    // 아바타 URL
}

export interface SessionData {
  accessToken: string;  // GitHub OAuth access token (서버 전용)
  user: SessionUser;
  createdAt: number;    // epoch ms
}
```

**세션 유틸** (`src/lib/session.ts`, `import 'server-only'`):

```typescript
export const sessionOptions: SessionOptions = {
  password: env.SESSION_SECRET,
  cookieName: 'md_session',
  ttl: 60 * 60 * 8,                                  // 8시간
  cookieOptions: { httpOnly: true, sameSite: 'lax', secure: env.isProduction, path: '/' },
};

export async function getSession(): Promise<IronSession<SessionData>>;      // cookies() 기반
export async function getSessionUser(): Promise<SessionUser | null>;        // 미로그인 시 null
export async function requireSession(): Promise<SessionData>;               // 없으면 ApiError('UNAUTHORIZED') throw
export async function destroySession(): Promise<void>;
```

**`GET /api/auth/login`** (`src/app/api/auth/login/route.ts`)

| 항목 | 내용 |
|---|---|
| 요청 | 쿼리 없음 |
| 처리 | `state = crypto.randomUUID()` 생성 → `md_oauth_state` 쿠키(httpOnly, maxAge 600초)에 저장 |
| 응답 | `302` → `https://github.com/login/oauth/authorize?client_id=...&redirect_uri=...&scope=read%3Auser&state=...` |
| 비고 | scope는 `read:user` 고정 (Q1: 공개 저장소만) |

**`GET /api/auth/callback`** (`src/app/api/auth/callback/route.ts`)

| 항목 | 내용 |
|---|---|
| 요청 | `?code=...&state=...` 또는 `?error=access_denied&error_description=...` |
| 처리 순서 | ① `error` 파라미터 존재 → `302 /?error=oauth_denied`<br>② `state` ≠ `md_oauth_state` 쿠키 → `302 /?error=oauth_failed`<br>③ `POST https://github.com/login/oauth/access_token` (`Accept: application/json`)로 code 교환<br>④ `GET https://api.github.com/user` 로 프로필 조회<br>⑤ 화이트리스트 검사: `env.allowedLogins.length > 0 && !includes(login)` → `302 /?error=forbidden`<br>⑥ iron-session 저장 후 `302 /` |
| 실패 | ③④ 중 예외 발생 시 `302 /?error=oauth_failed` — **어떤 경로에서도 예외를 던진 채 종료하지 않는다**(AC-1.3) |

**`POST /api/auth/logout`** (`src/app/api/auth/logout/route.ts`)

| 항목 | 내용 |
|---|---|
| 요청 | 본문 없음 |
| 처리 | `destroySession()` |
| 응답 | `204 No Content` |
| 클라이언트 후속 | `Header.tsx`가 응답 수신 후 `clearSnapshot()` 호출 → `window.location.assign('/')` (AC-1.9: 화면의 활동·분석·콘텐츠 전부 제거) |

#### 1-B. 활동 수집 (`src/lib/github.ts`, `src/lib/activity.ts`, `src/app/api/activity/route.ts`)

**도메인 타입** (`src/types/domain.ts` — zod 스키마가 단일 출처, 타입은 `z.infer`로 파생):

```typescript
export const periodDaysSchema = z.union([z.literal(7), z.literal(30), z.literal(90)]);
export type PeriodDays = z.infer<typeof periodDaysSchema>;              // 7 | 30 | 90

export const commitActivitySchema = z.object({
  sha: z.string(),
  message: z.string(),          // 첫 줄만 보관
  repo: z.string(),             // "owner/name"
  occurredAt: z.string(),       // ISO 8601
});

export const pullRequestActivitySchema = z.object({
  number: z.number(),
  title: z.string(),
  repo: z.string(),
  state: z.enum(['opened', 'merged', 'closed']),   // AC-1.5: 생성/머지 구분
  url: z.string(),
  occurredAt: z.string(),
});

export const issueActivitySchema = z.object({
  number: z.number(),
  title: z.string(),
  repo: z.string(),
  state: z.enum(['opened', 'closed']),             // AC-1.5: 생성/종료 구분
  url: z.string(),
  occurredAt: z.string(),
});

export const starActivitySchema = z.object({ repo: z.string(), occurredAt: z.string() });

export const activityCountsSchema = z.object({
  commits: z.number(),
  pullRequests: z.object({ total: z.number(), opened: z.number(), merged: z.number(), closed: z.number() }),
  issues: z.object({ total: z.number(), opened: z.number(), closed: z.number() }),
  stars: z.number(),
});

export const activitySummarySchema = z.object({
  period: z.object({ days: periodDaysSchema, from: z.string(), to: z.string() }),
  counts: activityCountsSchema,
  commits: z.array(commitActivitySchema),
  pullRequests: z.array(pullRequestActivitySchema),
  issues: z.array(issueActivitySchema),
  stars: z.array(starActivitySchema),
  repositories: z.array(z.string()),   // 활동이 발생한 저장소 전체 목록 (AC-1.5 And, AC-3.8 대조 기준)
  totalCount: z.number(),              // commits + PR + issues + stars 총합
  truncated: z.boolean(),              // GitHub Events API 300건 상한 도달 여부 (C2)
});
export type ActivitySummary = z.infer<typeof activitySummarySchema>;
```

**GitHub 클라이언트** (`src/lib/github.ts`, `import 'server-only'`):

```typescript
export interface GitHubUser { login: string; name: string | null; avatar_url: string }

/** 인증 사용자 프로필. 콜백에서 사용 */
export async function fetchGitHubUser(accessToken: string): Promise<GitHubUser>;

/** 공개 이벤트를 최대 3페이지(=300건) 수집. since 이전 이벤트가 나오면 조기 종료 */
export async function fetchPublicEvents(
  accessToken: string,
  login: string,
  since: Date,
): Promise<{ events: GitHubEvent[]; truncated: boolean }>;

/**
 * 한 저장소의 기간·작성자 커밋 수집. `PushEvent` payload 에 커밋이 없어 반드시 필요하다.
 * 404(삭제·비공개 전환)·409(빈 저장소) 등 저장소 국소 실패는 빈 배열로 흡수하고,
 * 토큰 무효·rate limit 은 그대로 던진다 (AC-1.8).
 * `GET /repos/{owner}/{repo}/commits?author={login}&since=&until=&per_page=100` (최대 2페이지)
 */
export async function fetchRepoCommits(
  accessToken: string,
  repo: string,
  login: string,
  since: Date,
  until: Date,
): Promise<GitHubRepoCommit[]>;

/** 응답 상태·헤더로 실패 원인을 ApiErrorCode로 분류 (AC-1.8) */
export function classifyGitHubError(res: Response): ApiErrorCode;
//  401                                   → 'GITHUB_TOKEN_INVALID'
//  403|429 && x-ratelimit-remaining==='0'→ 'GITHUB_RATE_LIMIT'
//  그 외                                  → 'GITHUB_ERROR'
```

- 공통 헤더: `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, `User-Agent: marketing-dashboard`.
- `cache: 'no-store'` 고정 (PRD 5.1: 캐싱 레이어 미도입).

**집계 함수** (`src/lib/activity.ts` — 순수 함수, 테스트 대상):

```typescript
/** 기간 내 PushEvent 가 발생한 저장소 목록(중복 제거·사전순) — 2단계 커밋 조회 대상 */
export function collectPushedRepositories(events: GitHubEvent[], period: ActivityPeriod): string[];

/** GET /repos/{o}/{r}/commits 응답 → 도메인 커밋 활동 (message 는 첫 줄만) */
export function toCommitActivities(repo: string, commits: GitHubRepoCommit[]): CommitActivity[];

/**
 * 이벤트 + **별도 조회한 커밋**을 기간 필터링·분류·집계해 ActivitySummary로 변환.
 * 커밋을 인자로 받는 이유: 커밋 조회에 네트워크가 필요한데 이 함수는 순수 함수로 유지해야 하기 때문.
 */
export function buildActivitySummary(
  events: GitHubEvent[],
  repoCommits: CommitActivity[],
  period: { days: PeriodDays; from: Date; to: Date },
  truncated: boolean,
): ActivitySummary;
```

이벤트 매핑 규칙:

> ⚠️ **Events API 계약 주의 (2026-08 확인)**: `PushEvent` 의 payload 에는 **커밋 목록이 없다.**
> 실제 키는 `repository_id / push_id / ref / head / before` 뿐이며, 공개 이벤트 파이어호스(`GET /events`) 표본 94건 전부 동일했다.
> 따라서 커밋·커밋 메시지는 이벤트에서 얻을 수 없고 아래 **2단계 수집**으로 채운다.
> (`IssuesEvent`·`PullRequestEvent` 의 payload 는 종전대로 `action`/`issue`/`pull_request` 를 담는다.)

| GitHub 이벤트 | 조건 | 산출 |
|---|---|---|
| `PushEvent` | 기간 내 발생 | **저장소명만** 수집 → `collectPushedRepositories()` (커밋 본문은 2단계에서) |
| `PullRequestEvent` | `action==='opened'` | `state: 'opened'` |
| `PullRequestEvent` | `action==='closed' && payload.pull_request.merged` | `state: 'merged'` |
| `PullRequestEvent` | `action==='closed' && !merged` | `state: 'closed'` |
| `IssuesEvent` | `action==='opened' \| 'closed'` | 동일 state |
| `WatchEvent` | `action==='started'` | `StarActivity` (스타 부여) |
| 그 외 | — | 무시 |

- 기간 필터: `created_at >= from`. 정렬: 각 배열 `occurredAt` 내림차순.
- 같은 PR/이슈에 대해 opened와 closed가 모두 있으면 **최신 상태 1건만** 남긴다(중복 계수 방지).
- `repositories`는 4개 배열의 repo를 합집합·사전순 정렬.

**`GET /api/activity`** (`src/app/api/activity/route.ts`)

| 항목 | 내용 |
|---|---|
| 요청 | `?period=7\|30\|90` (`periodDaysSchema`로 검증, 미지정·불량 시 `400 INVALID_REQUEST`) |
| 인증 | `requireSession()` — 미로그인 `401 UNAUTHORIZED` |
| 처리 | `from = now - period일` → `fetchPublicEvents` → `collectPushedRepositories` → 저장소별 `fetchRepoCommits` **병렬**(`Promise.allSettled`) → `toCommitActivities` → `buildActivitySummary` |
| 부분 실패 | 개별 저장소 실패는 그 저장소만 제외하고 진행. `ApiException`(토큰 무효·rate limit)이 하나라도 있으면 전체를 그 코드로 실패시킨다 |
| 응답 200 | `{ activity: ActivitySummary }` |
| 응답 4xx/5xx | `{ error: { code, message, retryable } }` — 코드는 `classifyGitHubError` 결과 |

#### 1-C. UI

**`src/components/DashboardProvider.tsx`** (F0 소유 · 전 기능 공유 상태)

```typescript
export interface DashboardState {
  user: SessionUser;
  periodDays: PeriodDays;                 // 기본 7 (AC-1.4)
  activity: ActivitySummary | null;
  activityStatus: AsyncStatus;            // 'idle' | 'loading' | 'success' | 'error'
  activityError: ApiError | null;
  analysis: AnalysisResult | null;
  analysisStatus: AsyncStatus;
  analysisError: ApiError | null;
  drafts: ContentDraft[];                 // 사용자가 편집한 최신 본문 유지
  draftStatus: Record<Platform, AsyncStatus>;
  draftErrors: Record<Platform, ApiError | null>;
  restored: boolean;                      // localStorage 복원 완료 여부
  requestGeneration: number;              // 결과 무효화 세대. setPeriod·resetAll 마다 +1
}

export interface DashboardActions {
  setPeriod(days: PeriodDays): void;      // 변경 시 analysis·drafts 초기화 (AC-2.8)
  setActivity(...): void; setAnalysis(...): void;
  setDraft(platform: Platform, draft: ContentDraft): void;
  updateDraftContent(platform: Platform, content: string): void;   // AC-3.5
  setDraftStatus(...): void; setDraftError(...): void;
  resetAll(): void;                       // 디바운스 타이머 취소 + 스냅샷 삭제 + 상태 초기화 (AC-1.9, AC-3.9)
  getRequestGeneration(): number;         // 호출 시점의 세대. 비동기 응답 대조용(클로저 캡처값은 오래될 수 있음)
}

export function DashboardProvider(props: { user: SessionUser; children: ReactNode }): JSX.Element;
export function useDashboard(): DashboardState & DashboardActions;
```

- 마운트 시 `loadSnapshot(user.login)` 으로 복원(AC-3.9), 이후 `activity/analysis/drafts/periodDays` 변경 시 300ms 디바운스로 `saveSnapshot()`.
- **feature 훅을 import하지 않는다**(순수 상태 컨테이너). 훅들이 이 컨텍스트를 소비한다.
- **요청 세대(`requestGeneration`)**: 기존 결과를 무효화하는 조작(`setPeriod`, `resetAll`)마다 증가한다. 세 훅은 요청 시작 시 `getRequestGeneration()` 을 캡처하고 응답 반영 직전에 다시 대조해, 값이 달라졌으면 응답을 폐기한다. 훅 내부의 `requestId` 는 *같은 훅의* 연속 실행만 막으므로, 기간 변경·초기화로 무효화된 응답이 뒤늦게 되살아나는 것을 막으려면 이 세대 대조가 함께 필요하다.
- **로그아웃도 `resetAll()` 을 거친다**: `clearSnapshot()` 만 부르면 대기 중인 디바운스 저장 타이머가 삭제 직후 스냅샷을 다시 기록해 AC-3.9("로그아웃 시 삭제")가 깨진다. `resetAll` 은 타이머를 먼저 취소한다.

**`src/components/LoginScreen.tsx`**

```typescript
type LoginErrorCode = 'oauth_denied' | 'oauth_failed' | 'forbidden';
interface LoginScreenProps { errorCode?: LoginErrorCode }
```
- 기본: 제품 설명 + "GitHub으로 로그인" 링크(`/api/auth/login`). 활동/분석/생성 영역은 **렌더링 자체를 하지 않는다**(AC-1.1).
- `errorCode` 존재 시 `ErrorNotice`로 메시지 + 재시도 버튼 표시 (AC-1.3):
  - `oauth_denied`/`oauth_failed` → "GitHub 로그인에 실패했습니다. 다시 시도해 주세요."
  - `forbidden` → "이 계정은 접근이 허용되지 않았습니다."

**`src/components/Header.tsx`** — 아바타 `<img>` + `@{login}` 표시(AC-1.2), "초기화"(`resetAll`), "로그아웃"(POST → 스냅샷 삭제 → `/` 이동, AC-1.9).

**`src/components/PeriodSelector.tsx`** — `PERIOD_OPTIONS`(7/30/90) 세그먼트 버튼, 기본 선택 7(AC-1.4). 로딩 중 비활성.

**`src/components/ActivityPanel.tsx`** — `useActivity()` 소비.
- 로딩: `Spinner` + 카운트 영역 스켈레톤, 액션 버튼 비활성 (AC-1.6)
- 성공 & `totalCount>0`: 커밋/PR(생성·머지)/이슈(생성·종료)/스타 4개 카운트 카드 + 항목별 저장소명 목록(AC-1.5)
- 성공 & `totalCount===0`: "선택한 기간에 활동 기록이 없습니다. 다른 기간을 선택해 보세요." (AC-1.7)
- 오류: `ErrorNotice`(코드별 메시지, `GITHUB_TOKEN_INVALID`이면 로그인 버튼) (AC-1.8)
- 하단 상시 문구: "공개 저장소 활동 기준입니다." / `truncated`면 "GitHub API 제한으로 최근 300건까지만 조회되었습니다."

**`src/hooks/useActivity.ts`**

```typescript
export function useActivity(): {
  activity: ActivitySummary | null;
  status: AsyncStatus;
  error: ApiError | null;
  refresh(): Promise<void>;   // 현재 periodDays로 GET /api/activity
};
```
- `periodDays` 변경 또는 `restored===true` 직후 자동 호출(스냅샷에 동일 기간 활동이 있으면 재호출 생략).

#### 수용 기준 매핑 (F1)

| PRD 수용 기준 | 구현 방법 |
|---|---|
| AC-1.1 로그인 진입 | `src/app/page.tsx`에서 `getSessionUser()`가 null이면 `<LoginScreen/>`만 렌더. `Dashboard`는 트리에 포함되지 않음 |
| AC-1.2 인증 성공 | `callback` → 세션 저장 후 `302 /` → `Header.tsx`가 `session.user.avatarUrl`·`login` 표시 |
| AC-1.3 인증 거부/실패 | 콜백의 모든 실패 경로가 `302 /?error=...`. `page.tsx`가 `searchParams.error`를 `LoginScreen.errorCode`로 전달 |
| AC-1.4 기간 선택 | `PERIOD_OPTIONS = [7,30,90]`, `DEFAULT_PERIOD_DAYS = 7`, `PeriodSelector` 초기값 |
| AC-1.5 수집 항목 | `buildActivitySummary`의 `counts` 4종 + `repositories`, `ActivityPanel`이 항목별 저장소명 렌더 |
| AC-1.6 로딩 상태 | `activityStatus==='loading'` → `Spinner` + `AnalysisPanel`/`ContentPanel` 버튼 `disabled` |
| AC-1.7 활동 없음 | `totalCount===0` 분기 안내 문구 + `AnalysisPanel` 버튼 `disabled` |
| AC-1.8 API 오류 | `classifyGitHubError` → `api-error.ts`의 코드별 한국어 메시지 → `ErrorNotice` |
| AC-1.9 로그아웃 | `POST /api/auth/logout` + `clearSnapshot()` + 전체 페이지 이동으로 클라이언트 상태 폐기 |

---

### 기능 2: Gemini API 기반 활동 분석 요약 → 구현 명세

> PRD 매핑: F2 — "이번 기간의 핵심 작업은 무엇이었고 어떤 의미가 있었는가라는 정리된 서사를 보고 싶다"
> 대응 AC: AC-2.1 ~ AC-2.8

#### 2-A. 도메인 타입 (`src/types/domain.ts`)

```typescript
export const analysisHighlightSchema = z.object({
  title: z.string(),                    // 하이라이트 제목
  description: z.string(),              // 1~2문장 설명
  evidence: z.array(z.string()).min(1), // 근거: 저장소명 또는 PR/이슈 제목 (AC-2.3)
});

export const analysisResultSchema = z.object({
  periodSummary: z.string(),                          // 3~5문장 문단 (AC-2.2)
  highlights: z.array(analysisHighlightSchema).min(3).max(5),
  insights: z.array(z.string()).min(2),               // 관찰 2개 이상 (AC-2.2)
});
export type AnalysisResult = z.infer<typeof analysisResultSchema> & {
  generatedAt: string;      // 서버가 부여
  lowVolume: boolean;       // totalCount < LOW_ACTIVITY_THRESHOLD (Q6)
};
```

#### 2-B. Gemini 래퍼 (`src/lib/gemini.ts`, F0 소유 · F2/F3 공유, `import 'server-only'`)

```typescript
export interface GenerateStructuredParams<T> {
  prompt: string;
  responseSchema: Record<string, unknown>;  // @google/genai Schema 객체
  parse: (raw: unknown) => T;               // zod safeParse 래핑
  timeoutMs: number;
  temperature?: number;                     // 기본 0.7
}

/** 구조화 JSON 생성. 타임아웃 시 ApiError('AI_TIMEOUT'), 그 외 실패는 ApiError('AI_ERROR') */
export async function generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T>;
```

- 구현: `new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })` 싱글턴 → `ai.models.generateContent({ model: env.GEMINI_MODEL, contents: prompt, config: { responseMimeType: 'application/json', responseSchema, temperature, abortSignal } })`.
- 타임아웃: `AbortController` + `setTimeout(timeoutMs)` 을 `Promise.race`로 이중 적용 → SDK가 signal을 무시해도 반드시 끊긴다 (AC-2.5).
- JSON 파싱 실패 또는 zod 검증 실패 시 **1회만** 재요청, 재실패하면 `AI_ERROR`.
- **일시적 실패(429/500/502/503/504)는 지수 백오프 + 지터로 최대 4회 재시도**한다. 재시도 판정을 위해 `requestText` 는 해당 실패만 `TransientAiError` 로 구분해 던진다(원본 메시지는 여전히 버린다 — AC-2.7). 모든 대기·재시도는 `deadline` 예산 안에서만 이뤄지므로 AC-2.5 의 60초 상한을 넘지 않는다. 확정 실패(400/401/404 등)는 재시도하지 않고 즉시 `AI_ERROR`.
- **실패 원인은 서버 로그에 남긴다**(`logFailure`). 사용자 응답에는 AC-2.7 때문에 원본을 감추는데, 그것만으로는 "모델 은퇴로 404" 같은 원인이 어디에도 안 남아 진단이 불가능했다. 로그는 서버 전용이며 API 키는 `[REDACTED]` 로 치환한다.
- **`timeoutMs` 는 호출 1회가 아니라 `generateStructured` 전체의 상한이다.** 진입 시 `deadline = now + timeoutMs` 를 잡고 매 시도에 남은 시간만 넘긴다. 재시도가 각자 새 60초를 받으면 사용자 체감 대기가 120초까지 늘어나 AC-2.5의 "60초 초과 시 중단" 보증이 깨진다. 남은 예산이 0 이하면 재시도하지 않고 `AI_TIMEOUT`.
- 상수: `ANALYSIS_TIMEOUT_MS = 60_000` (AC-2.5), `CONTENT_TIMEOUT_MS = 60_000`.

#### 2-C. 프롬프트 (`src/lib/prompts/analysis.ts`)

```typescript
/** 활동 요약을 Q2 상한에 맞춰 압축한 프롬프트 입력 텍스트 생성 */
export function buildAnalysisPrompt(activity: ActivitySummary): string;

/** Gemini responseSchema (analysisResultSchema와 1:1 대응) */
export const ANALYSIS_RESPONSE_SCHEMA: Record<string, unknown>;
```

프롬프트 구성 규칙(Q2 확정 상한을 코드로 강제):

| 데이터 | 투입 범위 | 근거 |
|---|---|---|
| 커밋 | 최신 **100건**(`AI_INPUT_LIMITS.maxCommits`). 메시지 첫 줄 + 저장소명 | Q2, C11 |
| PR | **전체**. 제목 + 상태(opened/merged/closed) + 저장소명 | Q2 |
| 이슈 | **전체**. 제목 + 상태 + 저장소명 | Q2 |
| 스타 | **저장소명만** | Q2 |

프롬프트가 반드시 포함해야 할 지시:
1. 출력은 **한국어**. 단, 저장소명·커밋 메시지 원문·기술명 등 고유명사는 원문 유지 (AC-2.4)
2. 각 하이라이트의 `evidence`에는 **제공된 데이터에 실제로 등장한** 저장소명 또는 PR/이슈 제목만 사용. 새로 만들어내지 말 것 (AC-2.3, C9)
3. 제공되지 않은 수치·기술명·성과를 추측하지 말 것
4. `highlights` 3~5개, `insights` 2개 이상 (AC-2.2)
5. 활동이 적으면 억지로 부풀리지 말고 사실만 서술할 것 (Q6)

#### 2-D. `POST /api/analyze` (`src/app/api/analyze/route.ts`)

| 항목 | 내용 |
|---|---|
| 인증 | `requireSession()` → 미로그인 `401 UNAUTHORIZED` |
| 요청 본문 | `{ activity: ActivitySummary }` — `analyzeRequestSchema`(= `z.object({ activity: activitySummarySchema })`)로 검증, 실패 시 `400 INVALID_REQUEST` |
| 사전 조건 | `activity.totalCount === 0` → `400 INVALID_REQUEST` ("분석할 활동이 없습니다") (AC-2.1) |
| 처리 | `buildAnalysisPrompt` → `generateStructured(..., ANALYSIS_TIMEOUT_MS)` → `analysisResultSchema` 검증 |
| 응답 200 | `{ analysis: AnalysisResult }` (`generatedAt`, `lowVolume` 서버 부여) |
| 응답 오류 | `504 { error: { code: 'AI_TIMEOUT', retryable: true } }` / `502 { error: { code: 'AI_ERROR', retryable: true } }` |
| 보안 | Gemini 호출은 이 핸들러 내부에서만 수행. 응답 본문에 키·프롬프트 원문을 포함하지 않음 (AC-2.7) |

#### 2-E. UI

**`src/hooks/useAnalysis.ts`**

```typescript
export function useAnalysis(): {
  analysis: AnalysisResult | null;
  status: AsyncStatus;
  error: ApiError | null;
  runAnalysis(): Promise<void>;   // 컨텍스트의 activity를 본문으로 POST /api/analyze
};
```
- 실행 전 `setAnalysis(null)` 로 이전 결과 대체(AC-2.8). **실패해도 `setActivity`를 건드리지 않는다**(AC-2.6).

**`src/components/AnalysisPanel.tsx`**
- 헤더: "AI 분석", 버튼 라벨 `analysis ? '다시 분석' : '분석'` (AC-2.8)
- 버튼 `disabled` 조건: `!activity || activity.totalCount === 0 || activityStatus==='loading' || status==='loading'` (AC-2.1, AC-1.6, AC-1.7)
- 로딩: `Spinner` + "AI가 활동을 분석하고 있습니다…"
- 성공: ① 기간 요약 문단 ② 하이라이트 리스트(각 항목 아래 `evidence` 칩) ③ 인사이트 불릿 (AC-2.2, AC-2.3)
- `lowVolume`이면 상단에 "활동량이 적어 초안 품질이 낮을 수 있습니다" 안내 (Q6)
- 오류: `ErrorNotice`("분석에 실패했습니다." 또는 타임아웃 메시지) + 재시도 버튼. 이때 `ActivityPanel`은 그대로 유지 (AC-2.6)

#### 수용 기준 매핑 (F2)

| PRD 수용 기준 | 구현 방법 |
|---|---|
| AC-2.1 실행 조건 | 버튼 `disabled` 조건식 + 라우트의 `totalCount===0` 가드 |
| AC-2.2 결과 구성 | `analysisResultSchema`의 `min/max` 제약 + Gemini `responseSchema` 강제 + 3영역 렌더 |
| AC-2.3 근거 추적성 | `AnalysisHighlight.evidence: string[]` (min 1) + 프롬프트 지시 2 + 하이라이트별 칩 렌더 |
| AC-2.4 한국어 출력 | 프롬프트 지시 1 |
| AC-2.5 타임아웃 | `generateStructured`의 60초 `AbortController` + `Promise.race` → `AI_TIMEOUT` 전용 메시지·재시도 |
| AC-2.6 API 오류 | `useAnalysis`가 `analysisError`만 갱신. `activity` 상태 불변 |
| AC-2.7 키 비노출 | `env.ts`/`gemini.ts`의 `server-only` 임포트 + `NEXT_PUBLIC_` 변수 부재 + Gemini 호출이 Route Handler 내부에만 존재 |
| AC-2.8 재분석 | `setPeriod`가 analysis·drafts를 초기화, `runAnalysis`가 결과를 교체 저장 |

---

### 기능 3: 플랫폼별 콘텐츠 자동 생성 → 구현 명세

> PRD 매핑: F3 — "하나의 분석 결과로 LinkedIn·X·블로그 세 플랫폼의 초안을 한 번에 받고 싶다"
> 대응 AC: AC-3.1 ~ AC-3.10

#### 3-A. 도메인 타입 (`src/types/domain.ts`)

```typescript
export const platformSchema = z.enum(['linkedin', 'x', 'blog']);
export type Platform = z.infer<typeof platformSchema>;

export const contentDraftSchema = z.object({
  platform: platformSchema,
  content: z.string(),        // 마크다운(blog) 또는 플레인 텍스트
  generatedAt: z.string(),
  edited: z.boolean(),        // 사용자가 수정했는지 (AC-3.5, AC-3.9 복원 시 유지)
});
export type ContentDraft = z.infer<typeof contentDraftSchema>;

export interface DraftValidation {
  charCount: number;          // Array.from(content).length — 공백 포함
  withinLimit: boolean;       // 플랫폼별 분량 기준 충족 여부
  message: string | null;     // 위반 시 사용자 경고 문구
  unknownRepos: string[];     // 활동 데이터에 없는 저장소명 (AC-3.8)
}
```

플랫폼 규격 상수 (`src/lib/constants.ts`, AC-3.3 표와 1:1):

```typescript
export const PLATFORM_SPECS = {
  linkedin: { label: 'LinkedIn', min: 600, max: 1300, hashtags: '3~5개' },
  x:        { label: 'X',        min: 0,   max: 280,  hashtags: '1~2개' },
  blog:     { label: '블로그',    min: 800, max: null, hashtags: null },
} as const;
```

#### 3-B. 초안 검증 (`src/lib/drafts.ts` — 순수 함수, 테스트 대상)

```typescript
/** 공백 포함 문자 수. 이모지·서로게이트 페어를 1자로 계산 */
export function countChars(content: string): number;            // = Array.from(content).length

/** 플랫폼 규격 대비 검증 + 미확인 저장소명 탐지 */
export function validateDraft(
  platform: Platform,
  content: string,
  knownRepositories: string[],
): DraftValidation;

/** 본문에서 "owner/name" 패턴을 추출해 knownRepositories에 없는 것만 반환 (AC-3.8) */
export function findUnknownRepositories(content: string, knownRepositories: string[]): string[];

/** 블로그 초안이 H2 이상 소제목 2개 이상을 포함하는지 (AC-3.3) */
export function hasEnoughHeadings(markdown: string): boolean;   // /^#{2,}\s+/gm 매치 ≥ 2
```

경고 문구 규칙:
- `x` && `charCount > 280` → "280자를 초과했습니다. 게시 전 줄여 주세요." (AC-3.3 And)
- `linkedin` && 범위 밖 → "권장 분량(600~1,300자)을 벗어났습니다."
- `blog` && (`charCount < 800` || `!hasEnoughHeadings`) → "권장 분량 800자 이상 / 소제목 2개 이상을 충족하지 않습니다."
- `unknownRepos.length > 0` → "활동 데이터에 없는 저장소명이 포함되어 있습니다: …" (AC-3.8 검증 보조)

#### 3-C. 프롬프트 (`src/lib/prompts/content.ts`)

```typescript
export interface ContentPromptInput {
  platform: Platform;
  analysis: AnalysisResult;
  activity: ActivitySummary;   // 사실 근거 (저장소명·건수) 제공용
}

export function buildContentPrompt(input: ContentPromptInput): string;
export const CONTENT_RESPONSE_SCHEMA: Record<string, unknown>;   // { content: string }
```

공통 지시:
1. 한국어로 작성 (PRD 5.3: 다국어 생성 제외)
2. **아래 "허용 저장소 목록"과 분석 결과에 등장하지 않는 저장소명·수치·기술명을 만들어내지 말 것** (AC-3.8, C9)
3. 활동 건수는 제공된 `counts` 값만 사용

플랫폼별 지시:

| 플랫폼 | 프롬프트 지시 |
|---|---|
| `linkedin` | 600~1,300자. 1인칭·전문적 톤. **도입 훅 → 작업 내용 → 배운 점/성과** 3단 구성. 마지막에 해시태그 3~5개 |
| `x` | **280자 이내(공백 포함)**. 핵심 성과 1개에 집중. 후킹형 첫 문장. 해시태그 1~2개. 길이 초과 시 반드시 줄일 것 |
| `blog` | 800자 이상. 마크다운. `#` 제목 1개 + `##` 소제목 2개 이상. 도입-본문-마무리. 개요가 아닌 **완성된 초안**으로 작성 (Q4) |

#### 3-D. `POST /api/content` (`src/app/api/content/route.ts`)

| 항목 | 내용 |
|---|---|
| 인증 | `requireSession()` → `401 UNAUTHORIZED` |
| 요청 본문 | `contentRequestSchema` = `{ platforms: Platform[] (1~3, 중복 불가), analysis: analysisResultSchema, activity: activitySummarySchema }` |
| 사전 조건 | 스키마 검증 실패 → `400 INVALID_REQUEST` (분석 결과 부재 시 클라이언트가 애초에 호출 불가 — AC-3.1) |
| 처리 | `platforms`를 **순차 생성**(각 플랫폼 독립 타임아웃 `CONTENT_TIMEOUT_MS`). 한 플랫폼의 예외는 그 플랫폼 결과만 `status:'error'` 로 만들고 다음 플랫폼 생성을 막지 않는다 |
| 병렬 금지 근거 | 3건을 동시에 던지면 Gemini 가 `503 UNAVAILABLE`(high demand)로 2건을 거절해 **초안 1개만 생성되는 현상이 재현**됐다(2026-08). 순차 + 백오프 재시도로 3건/17.3초 전량 성공을 확인했다 — M7(45초) 이내 |
| 응답 200 | `{ results: ContentGenerationResult[] }` — 항상 200. 개별 성공/실패를 배열로 반환 (AC-3.10) |
| 응답 오류 | 인증·스키마 실패만 4xx |

```typescript
export interface ContentGenerationResult {
  platform: Platform;
  status: 'success' | 'error';
  draft?: ContentDraft;
  error?: ApiError;      // 실패한 플랫폼만
}
```

- **AC-3.7(개별 재생성)** 은 같은 엔드포인트에 `platforms: ['x']` 처럼 1개만 보내 처리한다. 별도 엔드포인트를 만들지 않는다.
- **AC-3.2(3개 동시 출력)** 은 `platforms: ['linkedin','x','blog']` 1회 호출.

#### 3-E. UI

**`src/hooks/useContent.ts`**

```typescript
export function useContent(): {
  drafts: ContentDraft[];
  statusOf(platform: Platform): AsyncStatus;
  errorOf(platform: Platform): ApiError | null;
  generateAll(): Promise<void>;                       // AC-3.2
  regenerate(platform: Platform): Promise<void>;      // AC-3.7 — 다른 플랫폼 상태 불변
  editDraft(platform: Platform, content: string): void; // AC-3.5 (edited=true)
  isBusy: boolean;
};
```
- `regenerate`는 대상 플랫폼의 상태·본문만 교체한다. 다른 플랫폼의 사용자 편집분은 컨텍스트에서 그대로 유지된다.

**`src/components/ContentPanel.tsx`**
- 헤더 + "콘텐츠 생성"/"전체 다시 생성" 버튼. `disabled`: `!analysis || isBusy || analysisStatus==='loading'` (AC-3.1)
- **상시 안내 문구**: "AI가 생성한 초안입니다. 게시 전 내용을 확인해 주세요." — 생성 여부와 무관하게 패널 상단에 항상 표시 (AC-3.8 And)
- 3개 `DraftCard`를 카드 그리드로 나열 (AC-3.2). 각 카드는 자기 플랫폼의 상태만 본다 (AC-3.10)

**`src/components/DraftCard.tsx`**

```typescript
interface DraftCardProps {
  platform: Platform;
  draft: ContentDraft | null;
  status: AsyncStatus;
  error: ApiError | null;
  knownRepositories: string[];
  canRegenerate: boolean;      // analysis 부재 시 false — "다시 생성" 무반응 클릭 방지 (AC-3.1)
  onEdit(content: string): void;
  onRegenerate(): void;
}
```
- 본문은 `<textarea>` — 입력 즉시 `onEdit` 호출 → 컨텍스트 갱신 (AC-3.5)
- 헤더 우측에 `{charCount}자` 표시. `textarea` 값 기준으로 매 렌더 재계산 → 실시간 갱신 (AC-3.4)
- `validateDraft` 결과의 `message`가 있으면 경고 배지 표시 (AC-3.3 And, AC-3.8)
- "복사" 버튼: `navigator.clipboard.writeText(현재 textarea 값)` → 2초간 "복사되었습니다" (AC-3.6). 클립보드 API 실패 시 `document.execCommand('copy')` 폴백
- "다시 생성" 버튼: `onRegenerate` (AC-3.7)
- `status==='loading'` → 카드 내부만 `Spinner`, `status==='error'` → 카드 내부에 `ErrorNotice` + 재시도 (AC-3.10)

**`src/components/Dashboard.tsx`** — `DashboardProvider` 하위에서 `Header` → `PeriodSelector` → `ActivityPanel` → `AnalysisPanel` → `ContentPanel` 순으로 세로 배치. 상태는 전부 컨텍스트에서 온다.

**`src/app/page.tsx`** (서버 컴포넌트)

```typescript
export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getSessionUser();
  const { error } = await searchParams;
  if (!user) return <LoginScreen errorCode={parseLoginError(error)} />;
  return <DashboardProvider user={user}><Dashboard /></DashboardProvider>;
}
```

#### 수용 기준 매핑 (F3)

| PRD 수용 기준 | 구현 방법 |
|---|---|
| AC-3.1 실행 조건 | `ContentPanel` 버튼 `disabled: !analysis` + 라우트의 `analysis` 스키마 필수 |
| AC-3.2 3개 동시 출력 | `generateAll()` → `platforms: ['linkedin','x','blog']` → 3개 `DraftCard` 그리드 |
| AC-3.3 형식 요건 | `PLATFORM_SPECS` + 플랫폼별 프롬프트 지시 + `validateDraft` 경고(280자 초과 경고 포함) |
| AC-3.4 글자 수 표시 | `DraftCard`가 `countChars(textarea 값)`를 렌더마다 계산 |
| AC-3.5 수정 가능 | `updateDraftContent(platform, content)` — 플랫폼 키 단위 갱신이라 타 플랫폼 불변 |
| AC-3.6 복사 | `navigator.clipboard.writeText` + 토스트 피드백. 복사 대상은 화면 표시값 |
| AC-3.7 개별 재생성 | `regenerate(platform)` → `platforms:[platform]` 단건 호출, 응답을 해당 키만 교체 |
| AC-3.8 사실 기반 | 프롬프트 지시 2·3 + `findUnknownRepositories` 경고 + 상시 안내 문구 |
| AC-3.9 로컬 보존 | `local-store.ts` 스냅샷 저장/복원, `resetAll()`·로그아웃 시 `clearSnapshot()` |
| AC-3.10 부분 실패 | `Promise.allSettled` 기반 `results[]` + 카드별 상태/오류 분리 |

---

## 4. 데이터 모델

DB가 없으므로 **모델 = 프로세스 간 전달 계약**이다. 단일 출처는 `src/types/domain.ts`의 zod 스키마이며, 타입은 전부 `z.infer`로 파생한다.

```typescript
// ── 공통 ────────────────────────────────────────────────
export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

export type ApiErrorCode =
  | 'UNAUTHORIZED'          // 401 세션 없음
  | 'FORBIDDEN_USER'        // 403 화이트리스트 미포함
  | 'INVALID_REQUEST'       // 400 스키마/파라미터 오류
  | 'GITHUB_TOKEN_INVALID'  // 401 GitHub 토큰 만료·무효 → 재로그인 유도
  | 'GITHUB_RATE_LIMIT'     // 429 호출 한도 초과
  | 'GITHUB_ERROR'          // 502 그 외 GitHub 실패
  | 'AI_TIMEOUT'            // 504 Gemini 60초 초과
  | 'AI_ERROR'              // 502 Gemini 실패·응답 파싱 실패
  | 'INTERNAL';             // 500

export interface ApiError { code: ApiErrorCode; message: string; retryable: boolean }
export interface ApiErrorResponse { error: ApiError }

// ── F1 ──────────────────────────────────────────────────
ActivitySummary { period, counts, commits[], pullRequests[], issues[], stars[], repositories[], totalCount, truncated }

// ── F2 ──────────────────────────────────────────────────
AnalysisResult { periodSummary, highlights[{title, description, evidence[]}], insights[], generatedAt, lowVolume }

// ── F3 ──────────────────────────────────────────────────
ContentDraft { platform, content, generatedAt, edited }
ContentGenerationResult { platform, status, draft?, error? }

// ── 세션/로컬 ────────────────────────────────────────────
SessionData   { accessToken, user{login,name,avatarUrl}, createdAt }   // 암호화 쿠키 md_session
LocalSnapshot { version, savedAt, login, periodDays, activity, analysis, drafts }  // localStorage 1개 키
```

### 4.1 오류 코드 → 사용자 메시지 (`src/lib/api-error.ts`)

| 코드 | HTTP | 사용자 메시지 | 액션 | 근거 AC |
|---|---|---|---|---|
| `UNAUTHORIZED` | 401 | 로그인이 필요합니다. | 로그인 버튼 | AC-1.9 |
| `FORBIDDEN_USER` | 403 | 이 계정은 접근이 허용되지 않았습니다. | 없음 | Q7 |
| `INVALID_REQUEST` | 400 | 요청이 올바르지 않습니다. | 재시도 | — |
| `GITHUB_TOKEN_INVALID` | 401 | 로그인이 만료되었습니다. 다시 로그인해 주세요. | 로그인 버튼 | AC-1.8 |
| `GITHUB_RATE_LIMIT` | 429 | GitHub API 호출 한도를 초과했습니다. 잠시 후 다시 시도해 주세요. | 재시도 | AC-1.8 |
| `GITHUB_ERROR` | 502 | 활동 데이터를 불러오지 못했습니다. | 재시도 | AC-1.8 |
| `AI_TIMEOUT` | 504 | 분석에 시간이 너무 오래 걸립니다. 기간을 줄이거나 다시 시도해 주세요. | 재시도 | AC-2.5 |
| `AI_ERROR` | 502 | AI 분석에 실패했습니다. | 재시도 | AC-2.6, AC-3.10 |
| `INTERNAL` | 500 | 알 수 없는 오류가 발생했습니다. | 재시도 | M8 |

```typescript
export class ApiException extends Error { constructor(public code: ApiErrorCode, message?: string) }
export function toErrorResponse(e: unknown): Response;      // 항상 { error: ApiError } JSON 반환
export function userMessage(code: ApiErrorCode): string;     // 위 표의 한국어 메시지
```
> 모든 Route Handler의 본문을 `try { ... } catch (e) { return toErrorResponse(e) }` 로 감싸 **처리되지 않은 예외로 인한 흰 화면을 0건으로 만든다**(M8).

---

## 5. API 명세

| Method | Endpoint | 설명 | Request | Response (성공) | 오류 코드 |
|---|---|---|---|---|---|
| GET | `/api/auth/login` | GitHub authorize 리다이렉트 | — | `302` Location: github.com/login/oauth/authorize | — |
| GET | `/api/auth/callback` | code 교환·화이트리스트·세션 발급 | `?code&state` 또는 `?error` | `302 /` (실패 시 `302 /?error=oauth_denied\|oauth_failed\|forbidden`) | — |
| POST | `/api/auth/logout` | 세션 파기 | — | `204` | `INTERNAL` |
| GET | `/api/activity` | 기간별 공개 활동 수집 | `?period=7\|30\|90` | `200 { activity: ActivitySummary }` | `UNAUTHORIZED`, `INVALID_REQUEST`, `GITHUB_TOKEN_INVALID`, `GITHUB_RATE_LIMIT`, `GITHUB_ERROR` |
| POST | `/api/analyze` | 활동 → AI 분석 | `{ activity: ActivitySummary }` | `200 { analysis: AnalysisResult }` | `UNAUTHORIZED`, `INVALID_REQUEST`, `AI_TIMEOUT`, `AI_ERROR` |
| POST | `/api/content` | 분석 → 플랫폼별 초안 | `{ platforms: Platform[], analysis: AnalysisResult, activity: ActivitySummary }` | `200 { results: ContentGenerationResult[] }` | `UNAUTHORIZED`, `INVALID_REQUEST` (개별 실패는 200 본문에 포함) |

공통 규약
- 모든 응답 `Content-Type: application/json` (리다이렉트 제외), `Cache-Control: no-store`.
- 오류 본문은 예외 없이 `{ "error": { "code", "message", "retryable" } }`.
- 모든 핸들러 상단: `export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';`

---

## 6. 검증 매트릭스

PRD 수용 기준 27개 전수 매핑.

| # | PRD 수용 기준 | 구현 위치 | 테스트 기준 |
|---|---|---|---|
| AC-1.1 | 로그인 진입 | `src/app/page.tsx`, `src/components/LoginScreen.tsx` | 미로그인 상태로 `/` 접속 → 로그인 버튼만 보이고 활동/분석/생성 DOM이 없음 |
| AC-1.2 | OAuth 인증 성공 | `src/app/api/auth/callback/route.ts`, `src/components/Header.tsx` | 로그인 완료 후 헤더에 아바타 이미지와 `@login` 표시 |
| AC-1.3 | OAuth 거부/실패 | `src/app/api/auth/callback/route.ts`, `src/components/LoginScreen.tsx` | 동의 화면에서 취소 → `/?error=oauth_denied` → 오류 메시지+재시도 버튼, 흰 화면 없음 |
| AC-1.4 | 기간 선택 | `src/components/PeriodSelector.tsx`, `src/lib/constants.ts` | 7/30/90 3개 옵션 존재, 초기 선택이 7일 |
| AC-1.5 | 수집 항목 | `src/lib/activity.ts`, `src/components/ActivityPanel.tsx` | `activity.test.ts`: 픽스처 이벤트 → 커밋/PR(opened·merged)/이슈(opened·closed)/스타 카운트와 `repositories` 일치. 화면에 4개 건수 + 저장소명 표시 |
| AC-1.6 | 로딩 상태 | `src/hooks/useActivity.ts`, `src/components/ActivityPanel.tsx` | 조회 중 Spinner 표시, 분석·생성 버튼 `disabled` |
| AC-1.7 | 활동 없음 | `src/lib/activity.ts`, `src/components/ActivityPanel.tsx` | `activity.test.ts`: 빈 이벤트 → `totalCount===0`. 화면에 지정 안내 문구 + 분석 버튼 비활성 |
| AC-1.8 | GitHub API 오류 | `src/lib/github.ts`, `src/lib/api-error.ts`, `src/components/ui/ErrorNotice.tsx` | rate limit/401/기타 3종을 각각 유발(토큰 조작 등) → 4.1 표의 메시지와 액션 일치 |
| AC-1.9 | 로그아웃 | `src/app/api/auth/logout/route.ts`, `src/components/Header.tsx` | 로그아웃 후 로그인 화면 복귀, 새로고침해도 이전 활동/분석/콘텐츠 미표시(localStorage 비어 있음) |
| AC-2.1 | 분석 실행 조건 | `src/components/AnalysisPanel.tsx`, `src/app/api/analyze/route.ts` | 활동 0건에서 버튼 비활성, 1건 이상에서 클릭 시 로딩 표시 |
| AC-2.2 | 결과 구성 요소 | `src/lib/prompts/analysis.ts`, `src/types/domain.ts`, `src/components/AnalysisPanel.tsx` | 응답이 `analysisResultSchema`(highlights 3~5, insights ≥2) 통과. 화면에 3영역 렌더 |
| AC-2.3 | 근거 추적성 | `src/lib/prompts/analysis.ts`, `src/components/AnalysisPanel.tsx` | 각 하이라이트에 `evidence` 1개 이상 렌더. 표시된 근거가 활동 데이터의 저장소명/제목에 존재 |
| AC-2.4 | 한국어 출력 | `src/lib/prompts/analysis.ts` | `prompts.test.ts`: 프롬프트에 한국어 출력 지시 문자열 포함. 실제 응답 육안 확인 |
| AC-2.5 | 타임아웃 | `src/lib/gemini.ts`, `src/app/api/analyze/route.ts` | `ANALYSIS_TIMEOUT_MS`를 1000ms로 낮춰 재현 → `AI_TIMEOUT` 메시지 + 재시도 버튼 |
| AC-2.6 | AI 오류 처리 | `src/hooks/useAnalysis.ts`, `src/components/AnalysisPanel.tsx` | 잘못된 `GEMINI_API_KEY`로 실행 → 분석 오류 표시, `ActivityPanel` 데이터 유지 |
| AC-2.7 | API 키 비노출 | `src/lib/env.ts`, `src/lib/gemini.ts`, `src/app/api/analyze/route.ts` | `.next/static` 번들 전체 grep에 `GEMINI`·키 문자열 0건. 네트워크 탭에 googleapis 직접 호출 0건 |
| AC-2.8 | 재분석 | `src/components/DashboardProvider.tsx`, `src/hooks/useAnalysis.ts` | 기간 변경 또는 "다시 분석" → 이전 결과가 새 결과로 교체(누적 아님) |
| AC-3.1 | 생성 실행 조건 | `src/components/ContentPanel.tsx`, `src/app/api/content/route.ts` | 분석 전에는 버튼 비활성, 분석 후 활성 |
| AC-3.2 | 3개 동시 출력 | `src/hooks/useContent.ts`, `src/components/ContentPanel.tsx` | 1회 생성으로 LinkedIn/X/블로그 3개 카드 모두 표시 |
| AC-3.3 | 플랫폼별 형식 | `src/lib/prompts/content.ts`, `src/lib/drafts.ts`, `src/components/DraftCard.tsx` | `drafts.test.ts`: 281자 X 초안 → 경고, 799자 블로그·소제목 1개 → 경고. 실제 생성물 3종 분량·구조 육안 확인 |
| AC-3.4 | 글자 수 표시 | `src/lib/drafts.ts`, `src/components/DraftCard.tsx` | textarea 타이핑 시 표시 글자 수가 즉시 변함 |
| AC-3.5 | 수정 가능 | `src/components/DraftCard.tsx`, `src/components/DashboardProvider.tsx` | LinkedIn 초안 편집 후 X·블로그 본문 불변 |
| AC-3.6 | 복사 | `src/components/DraftCard.tsx` | 편집한 상태로 복사 → 클립보드 내용이 화면 표시값과 동일, "복사되었습니다" 표시 |
| AC-3.7 | 개별 재생성 | `src/hooks/useContent.ts`, `src/app/api/content/route.ts`, `src/components/DraftCard.tsx` | X만 재생성 → X만 교체, LinkedIn 편집분·블로그 유지 |
| AC-3.8 | 사실 기반 생성 | `src/lib/prompts/content.ts`, `src/lib/drafts.ts`, `src/components/ContentPanel.tsx` | `drafts.test.ts`: 미확인 저장소명 탐지. 생성물의 저장소명·수치를 `ActivitySummary`와 수동 대조(10회 0건, M3). 안내 문구 상시 노출 |
| AC-3.9 | 로컬 임시 보존 | `src/lib/local-store.ts`, `src/components/DashboardProvider.tsx` | 생성·편집 후 새로고침 → 동일 내용 복원. "초기화"/로그아웃 후 새로고침 → 복원되지 않음 |
| AC-3.10 | 생성 부분 실패 | `src/app/api/content/route.ts`, `src/hooks/useContent.ts`, `src/components/DraftCard.tsx` | 특정 플랫폼 프롬프트를 의도적으로 실패시켜 → 해당 카드만 오류+재시도, 나머지 2개 정상 표시 |

### 6.1 기능 단위 요약

| PRD 기능 | TECH_SPEC 구현 명세 | 핵심 파일 | 완료 판정 |
|---|---|---|---|
| F1 GitHub 로그인 + 활동 수집 | 3. 기능 1 | `api/auth/*`, `api/activity`, `lib/github.ts`, `lib/activity.ts`, `ActivityPanel` 외 | AC-1.1~1.9 (9개) 통과 + M5(30일 조회 10초 이내) |
| F2 AI 활동 분석 | 3. 기능 2 | `api/analyze`, `lib/prompts/analysis.ts`, `lib/gemini.ts`, `AnalysisPanel` | AC-2.1~2.8 (8개) 통과 + M6(30초 이내) |
| F3 플랫폼별 콘텐츠 생성 | 3. 기능 3 | `api/content`, `lib/prompts/content.ts`, `lib/drafts.ts`, `ContentPanel`, `DraftCard` | AC-3.1~3.10 (10개) 통과 + M7(45초 이내) |

---

## 7. 구현 슬라이스 계획

> `/sdd-build`가 이 장을 그대로 추출해 `docs/tasks/*.md`를 만든다. 여기 없는 파일은 구현되지 않는다.
> 「2. 프로젝트 구조」의 **51개 파일이 아래 표에 정확히 한 번씩** 등장한다. `⚙️` 항목은 파일이 아니므로 파일 수 대조에서 제외한다.

### 슬라이스 목록

| 슬라이스 | 이름 | 대응 PRD 기능 | 항목 수 | 선행 |
|---|---|---|---|---|
| F0 | 공통 기반 (설정·타입·세션·UI 프리미티브) | (전 기능 공유) | 25 | - |
| F1 | GitHub 로그인 + 활동 데이터 수집 | 기능 1 | 12 | F0 |
| F2 | Gemini 기반 활동 분석 | 기능 2 | 5 | F0, F1 |
| F3 | 플랫폼별 콘텐츠 생성 + 합성 루트 | 기능 3 | 9 | F0, F1, F2 |

합계: 25 + 12 + 5 + 9 = **51항목** = 「프로젝트 구조」 파일 수 51개 ✅

**합성 루트 소유권에 대한 메모**: `src/app/page.tsx`와 `src/components/Dashboard.tsx`는 F1·F2·F3의 패널을 모두 import해야 타입 체크가 통과하므로, 마지막 슬라이스인 **F3가 소유**한다. 대신 전역 상태 컨테이너(`DashboardProvider.tsx`)는 feature 훅을 import하지 않는 순수 상태 컨테이너로 설계해 **F0가 한 번에 전부 정의**한다. 따라서 F1·F2 슬라이스는 어떤 공유 파일도 다시 열지 않는다.

---

### F0 — 공통 기반

> 범위: 설정/인프라, 공유 타입, 공용 lib, 세션 유틸, 전역 상태 컨텍스트, UI 프리미티브 — **2개 이상 기능이 공유**하는 것 전부
> 내부 순서: 설정 파일 → 의존성 설치 → 타입 → lib → UI 프리미티브 → 상태 컨텍스트
> 완료 게이트: `npm install && npx tsc --noEmit && npm run lint`
> (이 시점에는 `src/app/page.tsx`가 없어 `next build`·E2E를 요구하지 않는다. Route Handler·페이지가 생기는 F1부터 빌드 게이트를 적용한다.)

| # | 파일 / 작업 | 목적 | 의존 | 대응 AC |
|---|---|---|---|---|
| 1 | `package.json` | 의존성(next/react/typescript/tailwindcss/@tailwindcss/postcss/iron-session/@google/genai/zod/server-only/vitest/eslint)·스크립트(`dev`,`build`,`start`,`lint`,`test`,`typecheck`) | - | (인프라) |
| 2 | ⚙️ `npm install` | 의존성 설치 — 이후 모든 게이트의 전제 | `package.json` | (인프라) |
| 3 | `tsconfig.json` | strict, `paths: {"@/*": ["./src/*"]}`, Next 플러그인 | `package.json` | (인프라) |
| 4 | `next.config.ts` | Next.js 최소 설정 | `package.json` | (인프라) |
| 5 | `eslint.config.mjs` | ESLint 9 flat config (`next/core-web-vitals`, TS) | `package.json` | (인프라) |
| 6 | `postcss.config.mjs` | `@tailwindcss/postcss` 플러그인 등록 | `package.json` | (인프라) |
| 7 | `vitest.config.ts` | node 환경, `@` alias, `src/lib/__tests__` 포함 | `package.json` | (인프라) |
| 8 | `.gitignore` | `node_modules`, `.next`, `.env*.local`, `coverage` 제외 — 키 커밋 방지 | - | AC-2.7 |
| 9 | `.env.example` | 1.1 표의 7개 변수 템플릿 (`NEXT_PUBLIC_` 사용 금지 주석 포함) | - | AC-2.7 |
| 10 | `README.md` | 실행 방법, GitHub OAuth App 등록, 환경 변수, 화이트리스트 설정 안내 | `.env.example` | (인프라) |
| 11 | `src/app/globals.css` | Tailwind v4 진입(`@import "tailwindcss"`) + 색·간격 토큰 | `postcss.config.mjs` | (인프라) |
| 12 | `src/app/layout.tsx` | 루트 레이아웃. `<html lang="ko">`, metadata, `globals.css` 임포트 | `globals.css` | (전 기능 공통 · 한국어 UI) |
| 13 | `src/types/domain.ts` | 도메인 zod 스키마·타입 전부(Activity/Analysis/Content/Platform/PeriodDays) | `zod` | AC-1.5, AC-2.2, AC-3.3 |
| 14 | `src/types/api.ts` | Route Handler 요청·응답 스키마, `ApiError(Code)`, `AsyncStatus`, `SessionData`, `LocalSnapshot` | `types/domain.ts` | AC-1.8, AC-2.6, AC-3.10 |
| 15 | `src/lib/env.ts` | `server-only` 환경 변수 로드·필수값 검증·`allowedLogins` 파싱 | - | AC-2.7, (Q7) |
| 16 | `src/lib/constants.ts` | `PERIOD_OPTIONS`, `DEFAULT_PERIOD_DAYS`, `AI_INPUT_LIMITS`(커밋 100건), `PLATFORM_SPECS`, `ANALYSIS_TIMEOUT_MS`/`CONTENT_TIMEOUT_MS`(60s), `LOCAL_STORE_KEY`, `MAX_SNAPSHOT_BYTES`, `LOW_ACTIVITY_THRESHOLD` | `types/domain.ts` | AC-1.4, AC-2.5, AC-3.3 |
| 17 | `src/lib/api-error.ts` | `ApiException`, `toErrorResponse()`, `userMessage()` — 4.1 표 전체 | `types/api.ts` | AC-1.8, AC-2.5, AC-2.6, AC-3.10 |
| 18 | `src/lib/session.ts` | iron-session 옵션, `getSession/getSessionUser/requireSession/destroySession` (`server-only`) | `lib/env.ts`, `types/api.ts` | AC-1.2, AC-1.9, AC-2.7 |
| 19 | `src/lib/utils.ts` | `cn()`, `formatDateRange()`, `truncate()`, 날짜 헬퍼 | - | (공통) |
| 20 | `src/lib/gemini.ts` | Gemini 클라이언트 싱글턴 + `generateStructured()`(구조화 JSON·60초 타임아웃·1회 재시도) (`server-only`) | `lib/env.ts`, `lib/api-error.ts` | AC-2.5, AC-2.7 |
| 21 | `src/lib/local-store.ts` | `saveSnapshot/loadSnapshot/clearSnapshot` — 단일 키·버전·login 검증·용량 상한 (Q5) | `types/api.ts`, `lib/constants.ts` | AC-3.9 |
| 22 | `src/components/ui/Spinner.tsx` | 로딩 인디케이터 (size prop) | `lib/utils.ts` | AC-1.6, AC-2.1, AC-3.10 |
| 23 | `src/components/ui/Button.tsx` | variant/size/loading/disabled 버튼 | `lib/utils.ts`, `ui/Spinner.tsx` | AC-1.6, AC-2.1, AC-3.1 |
| 24 | `src/components/ui/ErrorNotice.tsx` | 오류 메시지 + 재시도/로그인 액션 (`ApiError` 또는 문자열 수용) | `types/api.ts`, `lib/api-error.ts`, `ui/Button.tsx` | AC-1.3, AC-1.8, AC-2.6, AC-3.10 |
| 25 | `src/components/ui/Card.tsx` | 섹션 카드 (title/description/actions/children) | `lib/utils.ts` | (공통 레이아웃) |
| 26 | `src/components/DashboardProvider.tsx` | 전역 상태 컨텍스트 + 액션 + localStorage 동기화·복원. feature 훅 비의존 | `types/api.ts`, `lib/local-store.ts`, `lib/constants.ts` | AC-2.8, AC-3.5, AC-3.9 |

> 파일 항목 수: 25개 (⚙️ 1개 제외)

---

### F1 — GitHub 로그인 + 활동 데이터 수집

> 대응 PRD 기능 1 / AC-1.1 ~ AC-1.9
> 내부 순서: 서버 lib → 인증 라우트 → 활동 라우트 → 훅 → 컴포넌트 → 테스트
> 완료 게이트: `npx tsc --noEmit && npm run lint && npx vitest run src/lib/__tests__/activity.test.ts`
> 추가 수동 확인(선택): `npm run dev` 후 `/api/auth/login` 이 GitHub authorize로 302, 로그인 후 `curl -b` 로 `/api/activity?period=7` 이 `ActivitySummary` JSON 반환

| # | 파일 / 작업 | 목적 | 의존 | 대응 AC |
|---|---|---|---|---|
| 1 | `src/lib/github.ts` | GitHub REST 호출(`/user`, `/users/{login}/events/public` 최대 3페이지) + `classifyGitHubError()` | `lib/env.ts`(F0), `lib/api-error.ts`(F0) | AC-1.2, AC-1.5, AC-1.8 |
| 2 | `src/lib/activity.ts` | 이벤트 → `ActivitySummary` 집계(기간 필터·PR/이슈 상태 판정·중복 제거·저장소 목록·truncated) | `types/domain.ts`(F0), `lib/github.ts` | AC-1.5, AC-1.7 |
| 3 | `src/app/api/auth/login/route.ts` | `state` 쿠키 발급 + GitHub authorize 302 (scope `read:user`) | `lib/env.ts`(F0) | AC-1.1, AC-1.2 |
| 4 | `src/app/api/auth/callback/route.ts` | code 교환 → 프로필 조회 → 화이트리스트 → 세션 저장 / 모든 실패는 `/?error=` 리다이렉트 | `lib/env.ts`(F0), `lib/session.ts`(F0), `lib/github.ts` | AC-1.2, AC-1.3 |
| 5 | `src/app/api/auth/logout/route.ts` | 세션 파기 후 `204` | `lib/session.ts`(F0) | AC-1.9 |
| 6 | `src/app/api/activity/route.ts` | `?period` 검증 → 이벤트 수집 → 집계 → `{ activity }` / 오류 코드 분류 | `lib/session.ts`(F0), `lib/api-error.ts`(F0), `lib/github.ts`, `lib/activity.ts` | AC-1.5, AC-1.7, AC-1.8 |
| 7 | `src/hooks/useActivity.ts` | `GET /api/activity` 호출·상태 전이·기간 변경 시 재조회 | `DashboardProvider.tsx`(F0), `types/api.ts`(F0) | AC-1.4, AC-1.6, AC-1.8 |
| 8 | `src/components/LoginScreen.tsx` | 로그인 전 화면 + OAuth 실패/차단 메시지 + 재시도 | `ui/Button.tsx`(F0), `ui/ErrorNotice.tsx`(F0) | AC-1.1, AC-1.3 |
| 9 | `src/components/Header.tsx` | 아바타·`@login` 표시, "초기화", "로그아웃"(스냅샷 삭제 포함) | `DashboardProvider.tsx`(F0), `lib/local-store.ts`(F0), `ui/Button.tsx`(F0) | AC-1.2, AC-1.9, AC-3.9 |
| 10 | `src/components/PeriodSelector.tsx` | 7/30/90일 세그먼트 컨트롤, 기본 7일, 로딩 중 비활성 | `lib/constants.ts`(F0), `DashboardProvider.tsx`(F0) | AC-1.4, AC-1.6 |
| 11 | `src/components/ActivityPanel.tsx` | 4개 건수 카드 + 저장소명 목록 + 로딩/0건/오류 분기 + "공개 저장소 활동 기준" 문구 | `useActivity.ts`, `ui/Card.tsx`·`ui/Spinner.tsx`·`ui/ErrorNotice.tsx`(F0) | AC-1.5, AC-1.6, AC-1.7, AC-1.8 |
| 12 | `src/lib/__tests__/activity.test.ts` | 이벤트 픽스처(Push/PR opened·merged/Issues/Watch/기간 밖) → 집계·카운트·`repositories`·`totalCount===0` 검증 | `lib/activity.ts` | AC-1.5, AC-1.7 |

> 파일 항목 수: 12개

---

### F2 — Gemini 기반 활동 분석

> 대응 PRD 기능 2 / AC-2.1 ~ AC-2.8
> 내부 순서: 프롬프트 → 라우트 → 훅 → 컴포넌트 → 테스트
> 완료 게이트: `npx tsc --noEmit && npm run lint && npx vitest run src/lib/__tests__/prompts.test.ts`
> 추가 수동 확인(선택): 세션 쿠키로 `POST /api/analyze` 에 F1 응답을 그대로 전달 → `analysisResultSchema` 를 만족하는 한국어 JSON 반환

| # | 파일 / 작업 | 목적 | 의존 | 대응 AC |
|---|---|---|---|---|
| 1 | `src/lib/prompts/analysis.ts` | `buildAnalysisPrompt()`(Q2 상한 적용·한국어·근거 강제 지시) + `ANALYSIS_RESPONSE_SCHEMA` | `types/domain.ts`(F0), `lib/constants.ts`(F0) | AC-2.2, AC-2.3, AC-2.4 |
| 2 | `src/app/api/analyze/route.ts` | 세션 검증 → 본문 스키마 검증 → 0건 가드 → `generateStructured` → `{ analysis }` (타임아웃·실패 코드 분류) | `lib/session.ts`·`lib/gemini.ts`·`lib/api-error.ts`(F0), `lib/prompts/analysis.ts` | AC-2.1, AC-2.5, AC-2.6, AC-2.7 |
| 3 | `src/hooks/useAnalysis.ts` | `POST /api/analyze` 호출·상태 전이. 실패해도 activity 상태 불변, 성공 시 결과 교체 | `DashboardProvider.tsx`(F0), `types/api.ts`(F0) | AC-2.6, AC-2.8 |
| 4 | `src/components/AnalysisPanel.tsx` | 분석/다시 분석 버튼(비활성 조건) + 요약·하이라이트(근거 칩)·인사이트 렌더 + 소량 활동 안내 + 오류/재시도 | `useAnalysis.ts`, `ui/Card.tsx`·`ui/Button.tsx`·`ui/Spinner.tsx`·`ui/ErrorNotice.tsx`(F0) | AC-2.1, AC-2.2, AC-2.3, AC-2.5, AC-2.6, AC-2.8 |
| 5 | `src/lib/__tests__/prompts.test.ts` | 커밋 101건 입력 시 프롬프트에 100건만 포함, PR·이슈 전체 포함, 스타는 저장소명만, 한국어·근거 지시 문자열 포함 검증 | `lib/prompts/analysis.ts` | AC-2.2, AC-2.3, AC-2.4 |

> 파일 항목 수: 5개

---

### F3 — 플랫폼별 콘텐츠 생성 + 합성 루트

> 대응 PRD 기능 3 / AC-3.1 ~ AC-3.10 (+ 합성 루트로 AC-1.1·AC-1.3 화면 진입 확정)
> 내부 순서: 검증 lib → 프롬프트 → 라우트 → 훅 → 카드/패널 → 합성 루트 → 테스트
> 완료 게이트: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
> 최종 수동 E2E(PRD 4.3): `npm run dev` → 로그인 → 기간 7일 → 활동 표시 → 분석 → 콘텐츠 생성 → 편집·복사 → 새로고침 복원 → 로그아웃까지 중단 없이 1회 완주 + 6장 검증 매트릭스 27행 확인

| # | 파일 / 작업 | 목적 | 의존 | 대응 AC |
|---|---|---|---|---|
| 1 | `src/lib/drafts.ts` | `countChars()`, `validateDraft()`, `findUnknownRepositories()`, `hasEnoughHeadings()` | `types/domain.ts`(F0), `lib/constants.ts`(F0) | AC-3.3, AC-3.4, AC-3.8 |
| 2 | `src/lib/prompts/content.ts` | 플랫폼별 프롬프트 빌더(LinkedIn 600~1300자·X 280자·블로그 800자+H2 2개) + 사실 기반 지시 + `CONTENT_RESPONSE_SCHEMA` | `types/domain.ts`(F0), `lib/constants.ts`(F0) | AC-3.3, AC-3.8 |
| 3 | `src/app/api/content/route.ts` | 세션·본문 검증 → `platforms` 병렬 생성(`Promise.allSettled`) → `{ results }` 항상 200 | `lib/session.ts`·`lib/gemini.ts`·`lib/api-error.ts`(F0), `lib/prompts/content.ts` | AC-3.1, AC-3.2, AC-3.7, AC-3.10 |
| 4 | `src/hooks/useContent.ts` | `generateAll()`/`regenerate(platform)`/`editDraft()` — 플랫폼 키 단위 상태 관리 | `DashboardProvider.tsx`(F0), `types/api.ts`(F0) | AC-3.2, AC-3.5, AC-3.7, AC-3.10 |
| 5 | `src/components/DraftCard.tsx` | textarea 편집·실시간 글자 수·규격 경고·복사·다시 생성·카드별 로딩/오류 | `lib/drafts.ts`, `ui/Card.tsx`·`ui/Button.tsx`·`ui/Spinner.tsx`·`ui/ErrorNotice.tsx`(F0) | AC-3.3, AC-3.4, AC-3.5, AC-3.6, AC-3.7, AC-3.10 |
| 6 | `src/components/ContentPanel.tsx` | 생성 버튼(비활성 조건) + 3개 카드 그리드 + "AI가 생성한 초안입니다…" 상시 안내 | `useContent.ts`, `DraftCard.tsx`, `ui/Card.tsx`·`ui/Button.tsx`(F0) | AC-3.1, AC-3.2, AC-3.8 |
| 7 | `src/components/Dashboard.tsx` | 로그인 후 합성: Header → PeriodSelector → ActivityPanel → AnalysisPanel → ContentPanel | `Header.tsx`·`PeriodSelector.tsx`·`ActivityPanel.tsx`(F1), `AnalysisPanel.tsx`(F2), `ContentPanel.tsx` | AC-1.2, AC-1.6, AC-2.1, AC-3.1 |
| 8 | `src/app/page.tsx` | 서버 컴포넌트 합성 루트: 세션 분기 → `LoginScreen`(+`?error` 파싱) 또는 `DashboardProvider>Dashboard` | `lib/session.ts`(F0), `DashboardProvider.tsx`(F0), `LoginScreen.tsx`(F1), `Dashboard.tsx` | AC-1.1, AC-1.3, AC-1.9 |
| 9 | `src/lib/__tests__/drafts.test.ts` | 281자 X 경고, 799자·소제목 1개 블로그 경고, LinkedIn 범위 검증, 미확인 저장소명 탐지, 이모지 포함 글자 수 | `lib/drafts.ts` | AC-3.3, AC-3.4, AC-3.8 |

> 파일 항목 수: 9개

---

### 자체 검증 결과

| 검증 항목 | 결과 |
|---|---|
| 「프로젝트 구조」 파일 수 | 51 |
| 슬라이스 항목 수 합계(⚙️ 제외) | 25 + 12 + 5 + 9 = 51 ✅ |
| 파일 누락 / 중복 | 0 / 0 ✅ (모든 파일이 정확히 한 슬라이스에만 체크 항목으로 등장) |
| PRD 수용 기준 커버리지 | 27 / 27 ✅ (AC-1.1~1.9 · AC-2.1~2.8 · AC-3.1~3.10 전부 `대응 AC` 열에 1회 이상 등장) |
| F0에 `⚙️ npm install` 포함 | ✅ (F0 #2) |
| 슬라이스별 완료 게이트 실행 가능성 | ✅ F0는 페이지 미존재 상태에서 통과 가능한 `tsc + lint`, 빌드·E2E는 페이지가 생기는 F3 게이트로 배치 |
| 25항목 초과 슬라이스 | 없음 (최대 F0 = 25) ✅ |
| 공유 파일의 F0 소유 | ✅ 공유 타입(`types/*`), 공용 lib(`env/constants/session/api-error/utils/gemini/local-store`), UI 프리미티브, 전역 상태 컨텍스트 모두 F0 소유. 미들웨어는 사용하지 않음(접근 제한을 OAuth 콜백에서 처리) |
