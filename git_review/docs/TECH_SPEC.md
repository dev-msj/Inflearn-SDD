# TECH_SPEC: git_review

> PRD 참조: `docs/PRD.md` (기능 3개 / 수용 기준 20개)
> 이 문서는 PRD에 정의된 범위만 다룬다. PRD 비범위(DB, 정적 분석, 팀 협업, GitHub 외 호스팅, 자동 수정)는 설계에 포함하지 않는다.

---

## 0. 설계 요약 (Executive Summary)

| 항목 | 결정 |
|------|------|
| 실행 형태 | Next.js App Router 단일 애플리케이션 (서버 런타임 포함) |
| 인증 | **GitHub App** user access token (읽기 전용 fine-grained 권한) |
| 세션 | iron-session 암호화 httpOnly 쿠키 (DB 없음, 서버 상태 없음) |
| 토큰 노출 | 클라이언트 JS 접근 불가. 모든 GitHub 호출은 서버 Route Handler가 프록시 |
| 저장소 파일 조회 | Git Trees API `?recursive=1` **단일 요청**으로 전체 트리 획득 |
| 문서 파싱 | remark(mdast) 기반, **브라우저에서 실행** → 문서 내용이 서버로 전송되지 않음 |
| 영속 저장 | 없음. 업로드 문서·추출 목록·검증 결과는 React 메모리 상태로만 존재 |
| 판정 | 준수율 ≥ 80% → PASS, < 80% → FAIL |

---

## 1. 기술 스택

### 1.1 핵심 스택

| 구분 | 기술 | 버전 | 선정 근거 (충족하는 PRD 제약) |
|------|------|------|------|
| Framework | Next.js (App Router) | 15.x | OAuth code↔token 교환에 **서버 사이드 시크릿**이 필요하므로 서버 런타임이 있는 스택이 필수. Route Handler가 API 서버 역할을 겸해 별도 백엔드 배포 없이 "GitHub 토큰 서버 보관" 제약(보안 요구 4항)을 만족. RSC로 초기 페이로드가 작아 저장소 목록 3초 목표에 유리. |
| 언어 | TypeScript | 5.6+ | 산출물·검증 결과 도메인 타입을 컴파일 타임에 고정. 판정 정확도 95% 목표를 위해 `kind`/`status` 유니온 타입으로 분기 누락 방지. |
| Styling | Tailwind CSS | 4.x | 유틸리티 기반으로 1280px/768px 2개 브레이크포인트 대응(접근성 요구 4항)을 빠르게 구현. 디자인 토큰으로 명도 대비 4.5:1을 중앙 관리. |
| UI 컴포넌트 | shadcn/ui (Radix 기반) | latest | Radix 프리미티브가 키보드 내비게이션·ARIA를 기본 제공 → "모든 단계 키보드 수행"(접근성 1항)을 직접 구현하지 않아도 충족. 소스 복사 방식이라 런타임 의존성이 늘지 않음. |
| 아이콘 | lucide-react | 0.4x | PASS/FAIL·존재/없음을 **색상 외 아이콘**으로도 구분(접근성 2항). |

### 1.2 인증 / 세션

| 구분 | 기술 | 선정 근거 |
|------|------|------|
| 인증 방식 | **GitHub App** user-to-server 토큰 | PRD 보안 3항 "읽기 목적 이외의 저장소 변경은 일어나지 않는다"를 **기술적으로 강제**하려면 fine-grained 권한이 필요. GitHub App은 `Metadata: Read-only`, `Contents: Read-only`만 선언 가능. (아래 1.2.1 비교표 참조) |
| 세션 저장소 | `iron-session` 8.x (AES-256-GCM 암호화 쿠키) | DB 금지 제약 하에서 세션을 유지하는 유일한 무상태 방식. 서버 메모리 Map은 인스턴스 재시작·다중 인스턴스에서 세션이 유실되므로 부적합. 쿠키는 `httpOnly` → **클라이언트 JS가 토큰에 접근 불가**(보안 1·4항). |
| 쿠키 정책 | `httpOnly, secure, sameSite=lax, path=/`, **Max-Age 미지정(세션 쿠키)** | 브라우저 종료 시 즉시 폐기 → "세션 종료 시 즉시 폐기"(보안 1항), "세션 종료 후 다시 조회할 수 없다"(보안 2항). |
| GitHub 클라이언트 | `@octokit/rest` 21.x (+ `@octokit/plugin-retry`) | 응답 타입 제공, `x-ratelimit-*` 헤더 파싱 내장, 페이지네이션 유틸 제공. **서버 전용 import**로 클라이언트 번들에 포함되지 않음. |

#### 1.2.1 인증 방식 비교 (선정 근거)

| 방식 | 비공개 저장소 읽기 | 쓰기 권한 | PRD "읽기 전용" 제약 | 판정 |
|------|------|------|------|------|
| OAuth App + `public_repo` | 불가 | **있음**(공개 저장소 쓰기) | 위반 | 탈락 |
| OAuth App + `repo` | 가능 | **있음**(전체 읽기/쓰기) | 위반 | 탈락 |
| OAuth App + 스코프 없음 | 불가 | 없음 | 충족하나 비공개 저장소 목록 불가 → 기능1 수용기준 2("공개/비공개 여부 표시") 미충족 | 탈락 |
| **GitHub App (Contents: Read-only)** | 가능 | **없음** | 충족 | **채택** |

> GitHub App 채택의 부작용: 앱이 설치된 저장소만 접근 가능. 이는 기능1 엣지 수용기준("접근 가능한 저장소가 0개이면 안내와 **다음 행동 안내 문구**")과 자연스럽게 연결된다 → 다음 행동 = "GitHub App에 저장소 접근 허용하기" 링크.

### 1.3 문서 파싱 / 상태

| 구분 | 기술 | 선정 근거 |
|------|------|------|
| 마크다운 파서 | `unified` + `remark-parse` + `remark-gfm` | 정규식으로 코드블록·인라인코드·표를 구분하려면 오탐이 급증한다. mdast는 노드 타입(`code`/`inlineCode`/`tableCell`)을 정확히 구분하고, `node.position.start.line`으로 **출처 위치(줄 번호)**를 제공 → 기능2 수용기준 2("어느 문서의 어느 위치") 직접 충족. GFM 플러그인은 표 파싱에 필수. |
| 파싱 실행 위치 | **브라우저(클라이언트)** | ① 문서 내용이 네트워크로 나가지 않아 "업로드 문서는 저장되지 않음"을 구조적으로 보장. ② 네트워크 왕복 0회 → 5초 목표를 여유롭게 충족(1MB 문서 파싱 실측 기대 <300ms). |
| 트리 순회 | `unist-util-visit`, `mdast-util-to-string` | mdast 표준 유틸. 자체 순회 코드 제거. |
| 상태 관리 | React `useReducer` + Context (`AppStateProvider`) | 세션 스코프 상태(선택 저장소·문서·산출물·결과)만 다루므로 외부 라이브러리 불필요. **어떤 스토리지에도 쓰지 않음** → "영구 저장되지 않음"을 코드 레벨에서 보장. |
| 서버 데이터 페칭 | `SWR` 2.x | 저장소 목록 페이지네이션/재시도/로딩 상태를 표준화. `revalidateOnFocus: false`로 불필요한 GitHub 요청을 줄여 rate limit 여유 확보. |

### 1.4 채택하지 않은 기술과 이유

| 미채택 | 이유 |
|--------|------|
| Auth.js(NextAuth) | GitHub App user-to-server 토큰 + 만료/리프레시 흐름을 직접 제어해야 하고, DB 어댑터 없는 JWT 모드에서도 규약 학습 비용이 iron-session보다 크다. 필요한 것은 "암호화 쿠키 하나"뿐. |
| localStorage / sessionStorage | PRD 보안 2항(업로드 문서·검증 결과 미저장) 위반 소지. 상태는 메모리에만 둔다. |
| `git clone` / `simple-git` | PRD 기술 제약 1항 위반(로컬 다운로드 금지). |
| Contents API 항목별 조회 | 50개 항목 = 50 요청 → 15초 목표 및 rate limit 제약 모두 위협. Trees API 1회로 대체. |
| Zustand/Redux | 상태 트리가 얕고 세션 스코프. 오버엔지니어링. |

---

## 2. 프로젝트 구조

```
git_review/
├── docs/
│   ├── PRD.md                              # 제품 요구사항 (입력)
│   └── TECH_SPEC.md                        # 본 문서
├── .env.local.example                      # 필요한 환경변수 목록과 설명
├── next.config.ts                          # Next.js 설정 (서버 전용 패키지 지정)
├── postcss.config.mjs                      # Tailwind v4 PostCSS 플러그인 등록
├── tsconfig.json                            # strict 모드, @/* 경로 별칭
├── package.json                             # 의존성 및 스크립트
└── src/
    ├── app/
    │   ├── layout.tsx                       # 루트 레이아웃, AppStateProvider·스킵링크·lang="ko" 설정
    │   ├── page.tsx                         # 단일 화면 대시보드(로그인 게이트 → 3단 워크플로) 조립
    │   ├── globals.css                      # Tailwind 진입점 + 명도 대비 4.5:1 색상 토큰 정의
    │   ├── error.tsx                        # 렌더 단계 예외의 최종 폴백 화면
    │   └── api/
    │       ├── auth/login/route.ts          # GET: state 발급 후 GitHub 인가 페이지로 302
    │       ├── auth/callback/route.ts       # GET: code↔token 교환(서버 시크릿), 세션 생성 후 / 로 302
    │       ├── auth/logout/route.ts         # POST: 세션 쿠키 파기
    │       ├── session/route.ts             # GET: 로그인 여부와 프로필만 반환(토큰 절대 미포함)
    │       ├── repos/route.ts               # GET: 접근 가능 저장소 목록 페이지 조회
    │       └── verify/route.ts              # POST: 트리 조회 + 매칭, NDJSON 스트림으로 진행률·결과 응답
    ├── components/
    │   ├── AppHeader.tsx                    # 로그인 계정명·프로필 이미지·로그아웃 버튼
    │   ├── LoginGate.tsx                    # 미인증 시 "GitHub으로 로그인" 진입점만 노출
    │   ├── RepoPicker.tsx                   # 저장소 검색+목록+더보기를 묶는 컨테이너
    │   ├── RepoSearchInput.tsx              # 저장소명 부분 일치 필터 입력(디바운스)
    │   ├── RepoListItem.tsx                 # 저장소명·기본 브랜치·공개/비공개 배지 1행
    │   ├── SelectedRepoBanner.tsx           # 선택된 "검증 대상" 고정 표시 영역
    │   ├── DocumentUploader.tsx             # 파일 선택 + 드래그앤드롭 + 업로드 검증 호출
    │   ├── DocumentList.tsx                 # 업로드된 문서의 파일명·크기 표시 및 제거
    │   ├── ArtifactList.tsx                 # 추출된 기대 산출물 목록 + 총 항목 수 표시
    │   ├── ArtifactItemRow.tsx              # 산출물 1건(경로·종류·출처 뱃지·삭제 버튼)
    │   ├── ArtifactAddForm.tsx              # 경로 수동 추가 입력 폼
    │   ├── VerifyRunner.tsx                 # 검증 실행 버튼 + 진행률(확인 완료 n/전체 N) 표시
    │   ├── ComplianceSummary.tsx            # 준수율(소수 1자리)·PASS/FAIL·기준값 80% 안내
    │   ├── ResultFilterTabs.tsx             # 전체 / "없음"만 보기 필터
    │   ├── ResultChecklist.tsx              # 항목별 존재·없음 체크리스트 + GitHub 링크
    │   ├── StatusBadge.tsx                  # 아이콘+텍스트+색상 3중 표기 배지 (접근성 2항)
    │   ├── EmptyState.tsx                   # 저장소 0개 / 산출물 0개 / 파일 0개 공통 빈 상태
    │   └── ErrorNotice.tsx                  # AppErrorCode별 안내 문구 + 재시도 버튼
    ├── hooks/
    │   ├── useSession.ts                    # /api/session 조회, 로그아웃, 세션 만료 감지
    │   ├── useRepoList.ts                   # 저장소 페이지네이션·검색 필터·선택 상태 유지
    │   ├── useDocumentUpload.ts             # 확장자/크기/개수 검증 후 문서 상태 등록
    │   ├── useExpectedArtifacts.ts          # 추출 실행, 항목 추가/삭제, 총 항목 수 파생
    │   └── useVerification.ts               # /api/verify NDJSON 스트림 소비, 진행률·리포트 상태
    ├── state/
    │   ├── AppStateProvider.tsx             # 세션 스코프 전역 상태 Context (메모리 전용)
    │   └── appReducer.ts                    # 액션 정의 및 상태 전이(로그아웃 시 전체 초기화 포함)
    ├── lib/
    │   ├── env.ts                           # 환경변수 로드 및 기동 시 필수값 검증
    │   ├── session.ts                       # iron-session 옵션, 세션 읽기/쓰기/파기, 만료 판정
    │   ├── errors.ts                        # AppError 클래스, 에러 코드 ↔ 사용자 메시지 매핑
    │   ├── ndjson.ts                        # NDJSON 인코더(서버)·디코더(클라이언트) 유틸
    │   ├── github/
    │   │   ├── oauth.ts                     # 인가 URL 생성, state 검증, code↔token 교환
    │   │   ├── client.ts                    # 요청별 Octokit 인스턴스 생성 및 에러 정규화
    │   │   ├── user.ts                      # 인증 사용자 프로필 조회
    │   │   ├── repos.ts                     # 접근 가능 저장소 목록 조회(pushed 내림차순)
    │   │   ├── tree.ts                      # Git Trees API recursive 단일 호출로 전체 트리 조회
    │   │   ├── urls.ts                      # 저장소 파일/폴더 GitHub 웹 URL 생성
    │   │   └── rateLimit.ts                 # 응답 헤더 기반 잔여 한도 파싱 및 초과 판정
    │   ├── upload/
    │   │   └── validateUpload.ts            # .md 확장자·1MB·최대 2개 규칙 검증
    │   ├── extract/
    │   │   ├── extractArtifacts.ts          # 문서 목록 → 기대 산출물 목록 (추출 파이프라인 진입점)
    │   │   ├── parseMarkdown.ts             # remark로 mdast 생성 및 대상 노드 수집
    │   │   ├── treeBlock.ts                 # 코드블록 디렉터리 트리 판별 및 전체 경로 복원
    │   │   ├── pathHeuristics.ts            # 경로 후보 판별 규칙(허용/거부 목록, 확장자 사전)
    │   │   ├── normalizePath.ts             # 경로 정규화 및 파일/폴더 종류 판정
    │   │   └── mergeArtifacts.ts            # 동일 경로 병합, 출처 누적, 종류 충돌 해소
    │   └── verify/
    │       ├── buildTreeIndex.ts            # 트리 엔트리 → 파일 집합·파일보유 폴더 집합 인덱스
    │       ├── matchArtifact.ts             # 경로 매칭 및 존재/없음 판정(파일·폴더 규칙 분리)
    │       └── compliance.ts                # 준수율 계산 및 PASS/FAIL 판정
    └── types/
        ├── github.ts                        # 사용자·저장소·트리·rate limit 타입
        ├── artifact.ts                      # 업로드 문서·출처·기대 산출물 타입
        ├── verification.ts                  # 검증 항목·준수율·리포트·스트림 이벤트 타입
        └── api.ts                           # API 요청/응답 스키마 타입
```

**파일 수**: 소스 파일 58개 (설정 5, `app` 10, `components` 18, `hooks` 5, `state` 2, `lib` 14, `types` 4)

---

## 3. 데이터 모델 (타입 정의)

### 3.1 `src/types/github.ts` — 저장소 / 트리

```typescript
/** 로그인한 GitHub 사용자. 토큰은 절대 포함하지 않는다. */
export interface GitHubUser {
  login: string;
  name: string | null;
  avatarUrl: string;
}

/** 검증 대상 후보가 되는 저장소 요약 정보 */
export interface RepoSummary {
  id: number;
  owner: string;          // 예: "dev-msj"
  name: string;           // 예: "git_review"
  fullName: string;       // 예: "dev-msj/git_review"
  defaultBranch: string;  // 예: "main"
  isPrivate: boolean;
  htmlUrl: string;
  pushedAt: string;       // ISO8601, 정렬 기준
}

/** 저장소 목록 한 페이지 */
export interface RepoPage {
  items: RepoSummary[];
  page: number;
  hasNext: boolean;
}

/** Git Trees API 엔트리 (필요한 필드만 축약) */
export interface TreeEntry {
  path: string;                      // 저장소 루트 기준 상대 경로 (선행 슬래시 없음)
  type: 'blob' | 'tree' | 'commit';  // commit = 서브모듈
}

/** 저장소 전체 파일 트리 (단일 요청 결과) */
export interface RepoTree {
  ref: string;            // 조회에 사용한 기본 브랜치명
  entries: TreeEntry[];
  truncated: boolean;     // GitHub이 응답을 잘랐는지 여부
  fileCount: number;      // type === 'blob' 개수
}

/** GitHub 요청 한도 상태 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: string;        // ISO8601
}
```

### 3.2 `src/types/artifact.ts` — 업로드 문서 / 기대 산출물

```typescript
/** 산출물이 파일인지 폴더인지. 판정 불가 시 'unknown' */
export type ArtifactKind = 'file' | 'directory' | 'unknown';

/** 어떤 추출 규칙으로 뽑혔는지 (출처 표시 및 정확도 튜닝에 사용) */
export type ExtractionRule =
  | 'tree-block'        // 코드블록 내 디렉터리 트리
  | 'code-block-path'   // 코드블록 내 단독 경로 라인
  | 'inline-code'       // 백틱 인라인 코드
  | 'table-cell'        // GFM 표 셀
  | 'list-label'        // "**파일**: `경로`" 형태의 목록 항목
  | 'manual';           // 사용자가 직접 추가

/** 업로드된 스펙 문서. 메모리에만 존재하며 어디에도 저장되지 않는다. */
export interface UploadedDocument {
  id: string;           // crypto.randomUUID()
  fileName: string;     // 예: "TECH_SPEC.md"
  sizeBytes: number;
  content: string;      // 원문 (파싱 후에도 재추출을 위해 메모리 유지)
  uploadedAt: string;   // ISO8601
}

/** 기대 산출물 1건이 어느 문서 어느 줄에서 나왔는지 */
export interface ArtifactSource {
  documentId: string;
  documentName: string;
  line: number;         // 1-base 줄 번호 (mdast position 기준)
  rule: ExtractionRule;
  snippet: string;      // 근거 원문 최대 120자
}

/** 문서에서 추출(또는 수동 입력)된 기대 산출물 */
export interface ExpectedArtifact {
  id: string;
  path: string;              // 정규화된 저장소 루트 기준 경로 (선행/후행 슬래시 없음)
  kind: ArtifactKind;
  sources: ArtifactSource[]; // 병합 시 2건 이상이 될 수 있음
  origin: 'extracted' | 'manual';
}

/** 추출 과정에서 걸러진 후보 (디버깅/정확도 튜닝용, 화면 비노출) */
export interface RejectedCandidate {
  rawText: string;
  reason: RejectReason;
  line: number;
}

export type RejectReason =
  | 'contains-whitespace' | 'is-url' | 'code-syntax' | 'shell-command'
  | 'version-string' | 'single-segment-no-extension' | 'unknown-extension'
  | 'glob-pattern' | 'too-long' | 'placeholder';

/** 추출 파이프라인 결과 */
export interface ExtractResult {
  artifacts: ExpectedArtifact[];
  rejected: RejectedCandidate[];
  stats: {
    documentCount: number;
    candidateCount: number;   // 규칙에 걸린 원시 후보 수
    mergedCount: number;      // 병합으로 줄어든 건수
    elapsedMs: number;
  };
}
```

### 3.3 `src/types/verification.ts` — 검증 결과

```typescript
export type ArtifactStatus = 'present' | 'missing';

/** 어떤 규칙으로 존재 판정되었는지 (정확도 검증 시 근거) */
export type MatchMethod =
  | 'exact-file'                  // blob 경로 완전 일치
  | 'exact-directory'             // 해당 접두사로 시작하는 blob 1개 이상
  | 'case-insensitive-file'       // 대소문자만 다른 blob 일치
  | 'case-insensitive-directory'
  | 'none';

/** 검증 결과 항목 1건 */
export interface VerificationItem {
  artifactId: string;
  path: string;
  kind: ArtifactKind;
  status: ArtifactStatus;
  matchedPath: string | null;  // 실제 저장소에서 일치한 경로 (대소문자 차이 확인용)
  matchMethod: MatchMethod;
  htmlUrl: string | null;      // status === 'present'일 때만 채워짐
  childFileCount: number;      // 폴더 판정 시 하위 파일 수, 파일이면 0
}

/** 준수율 및 판정 */
export interface ComplianceScore {
  total: number;
  present: number;
  missing: number;
  rate: number;         // 0~100, 반올림 전 원값
  rateText: string;     // 소수점 첫째 자리 고정 문자열, 예: "83.3"
  verdict: 'PASS' | 'FAIL';
  threshold: number;    // 80 (화면에 기준값 안내용으로 함께 전달)
}

/** 검증 리포트 (메모리 전용, 저장하지 않음) */
export interface VerificationReport {
  repo: RepoSummary;
  ref: string;
  items: VerificationItem[];
  score: ComplianceScore;
  repoEmpty: boolean;      // 저장소에 blob이 0개
  treeTruncated: boolean;  // 트리가 잘려 결과가 불완전할 수 있음
  startedAt: string;
  finishedAt: string;
  rateLimit: RateLimitInfo | null;
}

/** /api/verify NDJSON 스트림 이벤트 */
export type VerifyEvent =
  | { type: 'phase'; phase: 'fetching-tree' | 'matching'; message: string }
  | { type: 'progress'; checked: number; total: number }
  | { type: 'item'; item: VerificationItem }
  | { type: 'done'; report: VerificationReport }
  | { type: 'error'; code: AppErrorCode; message: string; retryable: boolean };
```

### 3.4 `src/lib/errors.ts` — 에러 코드

```typescript
export type AppErrorCode =
  // 인증/세션
  | 'AUTH_CANCELLED' | 'AUTH_STATE_MISMATCH' | 'AUTH_EXCHANGE_FAILED'
  | 'UNAUTHENTICATED' | 'SESSION_EXPIRED' | 'NO_INSTALLATION'
  // 저장소/GitHub
  | 'REPO_FORBIDDEN' | 'REPO_NOT_FOUND' | 'REPO_EMPTY'
  | 'RATE_LIMITED' | 'NETWORK_ERROR' | 'GITHUB_UNAVAILABLE' | 'TREE_TRUNCATED'
  // 업로드/추출
  | 'UPLOAD_INVALID_EXTENSION' | 'UPLOAD_TOO_LARGE' | 'UPLOAD_TOO_MANY'
  | 'EXTRACTION_EMPTY'
  // 기타
  | 'INVALID_REQUEST' | 'UNKNOWN';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly httpStatus: number;
  readonly userMessage: string;   // 화면에 그대로 노출되는 한국어 문구
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;
  constructor(code: AppErrorCode, options?: { details?: Record<string, unknown>; cause?: unknown });
}

/** 코드별 HTTP 상태·사용자 문구·재시도 가능 여부 단일 정의 */
export const ERROR_CATALOG: Record<AppErrorCode, {
  httpStatus: number; userMessage: string; retryable: boolean;
}>;

/** 임의의 예외를 AppError로 정규화 (Octokit 에러 → 코드 매핑 포함) */
export function toAppError(error: unknown): AppError;
```

---

## 4. 구현 명세

### 기능 1: GitHub 로그인 및 검증 대상 저장소 선택 → 구현 명세

> PRD 매핑: 기능 1 — GitHub 계정으로 로그인해 내 저장소 중 하나를 검증 대상으로 선택

**담당 파일**

| 계층 | 파일 |
|------|------|
| 화면 | `src/components/LoginGate.tsx`, `AppHeader.tsx`, `RepoPicker.tsx`, `RepoSearchInput.tsx`, `RepoListItem.tsx`, `SelectedRepoBanner.tsx`, `EmptyState.tsx` |
| 훅 | `src/hooks/useSession.ts`, `src/hooks/useRepoList.ts` |
| API | `src/app/api/auth/login/route.ts`, `auth/callback/route.ts`, `auth/logout/route.ts`, `session/route.ts`, `repos/route.ts` |
| 로직 | `src/lib/session.ts`, `src/lib/github/oauth.ts`, `src/lib/github/user.ts`, `src/lib/github/repos.ts` |

**세션 구조** (`src/lib/session.ts`)

```typescript
/** 암호화 쿠키에 담기는 전체 내용. 이 객체는 서버에서만 복호화된다. */
export interface AppSession {
  accessToken: string;         // GitHub user access token (서버 전용, 응답 바디에 절대 포함 금지)
  refreshToken?: string;       // GitHub App 만료형 토큰 사용 시
  tokenExpiresAt?: string;     // ISO8601
  user: GitHubUser;
  createdAt: string;
  oauthState?: string;         // 인가 요청 시 저장, 콜백에서 비교 후 삭제
}

export const SESSION_OPTIONS: SessionOptions; // cookieName: 'gr_session', ttl: 0(세션 쿠키), httpOnly/secure/sameSite=lax

export async function getSession(): Promise<IronSession<AppSession>>;
export async function requireSession(): Promise<AppSession>;   // 미인증/만료 시 AppError('UNAUTHENTICATED' | 'SESSION_EXPIRED')
export async function destroySession(): Promise<void>;
export function isSessionExpired(session: AppSession, now?: Date): boolean;
```

**OAuth 흐름** (`src/lib/github/oauth.ts`)

```typescript
/** 인가 URL 생성. GitHub App은 권한이 앱 설정에 고정되므로 scope 파라미터를 보내지 않는다. */
export function buildAuthorizeUrl(state: string): string;
// => https://github.com/login/oauth/authorize?client_id=...&redirect_uri=...&state=...

export function generateState(): string;                       // crypto.randomBytes(16).toString('hex')
export function verifyState(received: string | null, stored: string | undefined): void; // 불일치 시 AUTH_STATE_MISMATCH

/** 서버에서만 실행. client_secret이 필요하므로 브라우저에서 호출 불가. */
export async function exchangeCodeForToken(code: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresInSec?: number;
}>;

/** GitHub App 설치 페이지 URL (저장소 0개일 때 "다음 행동" 링크) */
export function buildInstallUrl(): string;
// => https://github.com/apps/{GITHUB_APP_SLUG}/installations/new
```

**저장소 목록 조회** (`src/lib/github/repos.ts`)

```typescript
export const REPOS_PER_PAGE = 50; // 임의 설정 — 검토 필요 (3초 목표와 요청 횟수의 절충)

/**
 * GET /user/repos?sort=pushed&direction=desc&per_page=50&page=N
 * - GitHub App user access token으로 호출하면 "사용자와 앱이 모두 접근 가능한 저장소"만 반환된다.
 * - sort=pushed&direction=desc → PRD "최근 수정일 내림차순" 요구를 서버 측에서 충족(페이지 간 순서 보장).
 * - Link 헤더의 rel="next" 유무로 hasNext 판정 → 100개 초과 저장소의 순차 로드 지원.
 */
export async function listAccessibleRepos(
  accessToken: string,
  params: { page: number; perPage?: number },
): Promise<{ page: RepoPage; rateLimit: RateLimitInfo }>;

/** Octokit 응답 → RepoSummary 축약 매핑 (불필요한 필드를 클라이언트로 보내지 않음) */
export function toRepoSummary(raw: unknown): RepoSummary;
```

**검색 필터** (`src/hooks/useRepoList.ts`)

```typescript
export interface UseRepoListResult {
  repos: RepoSummary[];        // 누적 로드된 전체
  visibleRepos: RepoSummary[]; // query로 필터링된 결과
  query: string;
  setQuery(next: string): void;      // 250ms 디바운스 (임의 설정 — 검토 필요)
  loadMore(): Promise<void>;         // hasNext일 때만 활성
  hasNext: boolean;
  isLoading: boolean;
  error: AppError | null;
  selectedRepo: RepoSummary | null;
  selectRepo(repo: RepoSummary): void;
}

/** 저장소명(name) 기준 대소문자 무시 부분 일치. fullName이 아닌 name만 대상(PRD 문구 준수) */
export function filterReposByName(repos: RepoSummary[], query: string): RepoSummary[];
```

> **선택 상태 유지 근거**: `selectedRepo`는 `repos` 배열이 아닌 `AppStateProvider`의 독립 필드에 `RepoSummary` 값 전체를 복사해 보관한다. 따라서 추가 페이지 로드로 `repos`가 교체되어도 선택이 풀리지 않는다(기능1 엣지 수용기준 2).

**수용 기준 매핑**

| PRD 수용 기준 | 구현 방법 |
|--------------|----------|
| 미로그인 시 로그인 진입점만 노출 / 인증 후 계정명·프로필 이미지 표시 | `page.tsx`가 `useSession()`의 `authenticated`가 false면 `LoginGate`만 렌더. true면 `AppHeader`에 `user.login` + `user.avatarUrl`(next/image) 표시 |
| 저장소 목록 최근 수정일 내림차순 + 저장소명·기본 브랜치·공개/비공개 표시 | `listAccessibleRepos`가 `sort=pushed&direction=desc` 사용, `RepoListItem`이 `name` / `defaultBranch` / `isPrivate ? '비공개' : '공개'` 배지 렌더 |
| 검색 필터 + 선택 시 "검증 대상" 고정 표시 | `RepoSearchInput` → `filterReposByName` → `visibleRepos`. 선택 시 `SELECT_REPO` 액션, `SelectedRepoBanner`가 상단 sticky로 고정 표시 |
| (엣지) 저장소 0개 | `repos.length === 0 && !isLoading` → `EmptyState` variant `no-repos`: "검증할 저장소가 없습니다" + `buildInstallUrl()` 링크("GitHub App에 저장소 접근 허용하기") |
| (엣지) 100개 초과 순차 로드 + 선택 유지 | `hasNext`가 true인 동안 "더 보기" 버튼 노출, `loadMore()`가 `page+1` 요청 후 배열에 append. `selectedRepo`는 별도 필드라 유지됨 |
| (에러) 인증 취소/권한 거부 | `auth/callback/route.ts`가 쿼리에 `error=access_denied` 존재 시 `/?error=AUTH_CANCELLED`로 302 → `ErrorNotice`가 "인증이 취소되었습니다. 다시 시도해 주세요" + 재시도 버튼 표시 |
| (에러) 로그아웃/세션 만료 시 전체 초기화 | `logout/route.ts`가 `destroySession()` 후 클라이언트가 `RESET_ALL` 액션 디스패치 → user·repos·documents·artifacts·report 전부 초기값으로 복귀. 401 응답 수신 시에도 동일 액션 실행 |

---

### 기능 2: SDD 스펙 문서 업로드 및 기대 산출물 목록 추출 → 구현 명세

> PRD 매핑: 기능 2 — PRD/TECH_SPEC 문서를 업로드해 문서가 요구하는 산출물 목록을 자동 추출

**담당 파일**

| 계층 | 파일 |
|------|------|
| 화면 | `DocumentUploader.tsx`, `DocumentList.tsx`, `ArtifactList.tsx`, `ArtifactItemRow.tsx`, `ArtifactAddForm.tsx`, `EmptyState.tsx` |
| 훅 | `useDocumentUpload.ts`, `useExpectedArtifacts.ts` |
| 로직 | `lib/upload/validateUpload.ts`, `lib/extract/*` (6개 파일) |

#### 2-1. 업로드 검증 (`lib/upload/validateUpload.ts`)

```typescript
export const UPLOAD_LIMITS = {
  maxFiles: 2,                       // PRD 명시
  maxBytes: 1 * 1024 * 1024,         // PRD 명시: 1MB
  allowedExtensions: ['.md'] as const, // PRD 명시
} as const;

export interface UploadValidationError { fileName: string; error: AppError; }

/** 확장자 → 크기 → 총 개수 순으로 검사. 통과분과 거부분을 함께 반환해 부분 업로드를 허용. */
export function validateUploads(
  files: File[],
  alreadyUploadedCount: number,
): { accepted: File[]; rejected: UploadValidationError[] };

export async function readAsUploadedDocument(file: File): Promise<UploadedDocument>;
```

#### 2-2. 추출 파이프라인 (`lib/extract/extractArtifacts.ts`)

```typescript
export const MAX_ARTIFACTS = 300; // 임의 설정 — 검토 필요 (화면·성능 보호용 상한)

export function extractArtifacts(documents: UploadedDocument[]): ExtractResult;

/** 문서 1건 → 원시 후보 목록 (규칙 R1~R5 적용) */
export function extractFromDocument(document: UploadedDocument): RawCandidate[];

export interface RawCandidate {
  rawText: string;        // 원문 토큰 (정규화 전)
  path: string;           // 정규화된 경로
  kind: ArtifactKind;
  rule: ExtractionRule;
  line: number;
  snippet: string;
  hasChildren?: boolean;  // 트리 파싱 시 하위 노드 보유 여부 (폴더 판정 근거)
}
```

**파이프라인 단계**

```
문서 원문
  → [0] 전처리: CRLF→LF 치환, BOM 제거
  → [1] parseMarkdown(): remark-parse + remark-gfm → mdast (position 포함)
  → [2] 규칙별 후보 수집 R1~R5 (아래 상세)
  → [3] normalizePath(): 정규화 + 파일/폴더 종류 판정
  → [4] pathHeuristics.rejectionReason(): 거부 규칙 통과 검사
  → [5] mergeArtifacts(): 동일 경로 병합 + 출처 누적 + 종류 충돌 해소
  → [6] MAX_ARTIFACTS 상한 적용(초과분 절단, stats에 기록)
  → ExpectedArtifact[]
```

#### 2-3. 추출 규칙 상세 (제품 정확도의 핵심)

우선순위는 R1 > R2 > R3 > R4 > R5. **동일 경로가 여러 규칙에 걸리면 R5까지 모두 수집한 뒤 [5]단계에서 병합**하며, `kind` 충돌 시 우선순위가 높은 규칙의 판정을 채택한다.

##### R1. 코드블록 디렉터리 트리 (`rule: 'tree-block'`) — 가장 신뢰도 높음

대상: mdast `code` 노드 중 `isTreeBlock(value) === true`.

```typescript
// lib/extract/treeBlock.ts
export const TREE_GLYPHS = /[├└│─┬┐┌]/;

/**
 * 트리 블록 판별 (둘 중 하나라도 만족):
 *  (a) 본문에 TREE_GLYPHS가 1회 이상 등장한다.
 *  (b) 2줄 이상이고, 들여쓰기 깊이가 서로 다른 줄이 존재하며,
 *      전체 줄의 50% 이상이 looksLikePath()를 통과한다.
 */
export function isTreeBlock(code: string): boolean;

/** 트리 블록을 전체 경로 목록으로 복원 */
export function parseTreeBlock(code: string, blockStartLine: number): RawCandidate[];
```

`parseTreeBlock` 알고리즘 (컬럼 스택 방식):

```
1. 줄 단위 분할. 빈 줄과 생략 표시("...", "…", "// ...")는 건너뛴다.
2. 각 줄에서 꼬리 주석 제거:
   /\s{2,}(#|\/\/|←|→|<--).*$/ 에 매치되면 그 앞부분만 사용.
   (근거: 공백 2칸 이상을 요구해 "a#b.txt" 같은 파일명 오손상을 방지)
3. 각 줄을 다음 정규식으로 분해:
   /^(?<indent>[\s│|]*)(?<branch>(?:[├└`+][-─]{1,3}|[-*+])\s+)?(?<name>\S.*?)\s*$/
   - nameColumn = indent.length + (branch?.length ?? 0)   // name이 시작하는 컬럼 위치
4. 스택 S = [] (요소: { column, path, index })
   - S의 top.column >= nameColumn 인 동안 pop  (형제/상위로 복귀)
   - parentPath = S.top?.path ?? ''            (S가 비면 루트)
   - fullPath = parentPath ? `${parentPath}/${strip(name)}` : strip(name)
     * strip(name): 후행 '/' 제거, 후행 '*'(변경 표시) 제거
   - 자식 판정을 위해 push({ column: nameColumn, path: fullPath, index })
5. 부모 노드는 push 이후 자식이 push되면 hasChildren = true 로 갱신.
6. kind 판정:
   - name이 '/'로 끝남           → 'directory'
   - hasChildren === true        → 'directory'
   - 확장자 보유 또는 특수 파일명 → 'file'
   - 그 외                        → 'unknown'
7. line = blockStartLine + (블록 내 줄 인덱스) + 1   // 펜스 라인 보정
8. 단일 루트 절단:
   - 부모 없이 push된 최상위 노드(= 4단계에서 S가 비어 있던 노드)를 모은다.
   - 최상위 노드가 정확히 1개이고 그 노드가 hasChildren === true 이면:
     * 그 루트 노드를 후보 목록에서 제외한다.
     * 나머지 전 노드의 fullPath에서 `${root}/` 접두사를 제거한다.
   - 최상위 노드가 2개 이상이면(= 루트 없이 형제 목록을 나열한 트리) 절단하지 않는다.
   - 최상위 노드가 1개여도 자식이 없으면(단일 파일 표기) 절단하지 않는다.
```

> **들여쓰기 폭을 고정값(4칸)으로 가정하지 않고 컬럼 위치 스택을 쓰는 근거**: 2칸/3칸/4칸 들여쓰기와 `│   ` 혼용이 실제 문서에 모두 존재한다. 컬럼 비교는 폭에 무관하게 동작한다.

> **8단계(단일 루트 절단)가 필요한 근거**: 문서의 트리 블록은 대개 저장소 이름을 루트 노드로 얹어 그린다(본 문서 §2가 정확히 그 형태다). 절단하지 않으면 복원 경로가 `git_review/src/app/page.tsx`가 되는데, `TreeEntry.path`는 저장소 루트 기준 상대 경로이므로(§3.1) 이 경로는 어떤 저장소와도 매칭되지 않아 R1 산출물이 전량 "없음"으로 오판정된다. 또한 인라인 코드(R3)·표(R4)가 뽑은 올바른 경로와 병합되지 않아 같은 파일이 중복 항목으로 남는다. 절단 규칙이 §8 검증 매트릭스 2-2의 기대 출력(`src/app/page.tsx`)을 성립시킨다.

##### R2. 코드블록 내 단독 경로 라인 (`rule: 'code-block-path'`)

대상: `isTreeBlock === false`인 `code` 노드.

```
- 언어가 셸 계열(bash, sh, shell, console, powershell, zsh)이면 블록 전체를 건너뛴다.
  (근거: 명령어 인자와 경로의 구분이 불가능해 오탐이 급증)
- 각 줄을 trim한 뒤 다음을 모두 만족할 때만 후보로 채택:
  (a) 줄 전체가 단일 토큰(내부 공백 없음)
  (b) looksLikePath(token) === true
  (c) 줄이 주석 기호(#, //, /*, *)로 시작하지 않음
```

##### R3. 인라인 코드 (`rule: 'inline-code'`)

대상: mdast `inlineCode` 노드.

```
- value를 trim → looksLikePath 통과 시 채택
- 값에 공백이 있으면, 공백 분할 후 마지막 토큰이 경로처럼 보이고
  앞 토큰이 명령어 프리픽스이면 전체를 거부한다. (예: `npm run build`)
- 링크 노드(link)의 자식인 inlineCode는 건너뛴다. (외부 링크 텍스트 오탐 방지)
```

##### R4. GFM 표 셀 (`rule: 'table-cell'`)

대상: mdast `table` → `tableRow` → `tableCell`.

```
- 헤더 행(첫 tableRow)의 각 셀 텍스트를 소문자화하여 열 성격을 분류한다.
  PATH_HEADER_KEYWORDS = ['파일','경로','파일 경로','위치','file','path','location','산출물']
- (a) 헤더 키워드에 해당하는 열: 셀 텍스트 전체(plain text 포함)를 후보로 검사한다.
- (b) 그 외 열: 셀 내부의 inlineCode 노드만 후보로 검사한다.
  (근거: 설명 열의 자연어에서 오탐이 나오는 것을 막되, 백틱으로 감싼 경로는 놓치지 않음)
```

##### R5. 목록 라벨 (`rule: 'list-label'`)

대상: mdast `listItem` / `paragraph`.

```
- 다음 패턴을 만족하는 문단에서 값 부분만 추출:
  /^\s*(?:[-*]\s*)?(?:\*\*)?(파일|경로|파일 경로|위치|생성 파일|File|Path)(?:\*\*)?\s*[:：]\s*(?<value>.+)$/
- value 안의 inlineCode를 우선 사용하고, 없으면 value 전체를 토큰으로 검사한다.
```

##### 경로 판별·거부 규칙 (`lib/extract/pathHeuristics.ts`)

```typescript
export const KNOWN_EXTENSIONS: ReadonlySet<string>;
// ts tsx js jsx mjs cjs json jsonc md mdx css scss sass less html htm svg png jpg jpeg gif ico webp
// yml yaml toml ini cfg conf env txt csv sql sh ps1 bat py go rs java kt kts rb php c cpp h hpp
// swift dart vue svelte astro prisma graphql gql lock tsbuildinfo map xml pdf

export const KNOWN_EXTENSIONLESS_FILES: ReadonlySet<string>;
// Dockerfile Makefile Procfile LICENSE LICENCE README CHANGELOG CODEOWNERS
// .gitignore .gitattributes .env .env.local .env.example .npmrc .nvmrc .editorconfig
// .eslintrc .prettierrc .dockerignore .babelrc

export const COMMAND_PREFIXES: readonly string[];
// npm npx yarn pnpm bun git cd ls mkdir touch rm cp mv curl wget docker node python pip
// java gradle mvn make sudo echo export set cat chmod

export const SEGMENT_RE = /^[A-Za-z0-9._@+\-가-힣]+$/;

/** 후보 토큰이 경로로 보이는지 (거부 사유가 없으면 true) */
export function looksLikePath(token: string): boolean;

/** 거부 사유 판정. null이면 통과. 아래 순서대로 검사한다. */
export function rejectionReason(token: string): RejectReason | null;
```

거부 규칙 (순서대로 적용):

| # | 조건 | RejectReason | 근거 |
|---|------|--------------|------|
| 1 | 길이 0 또는 200자 초과, 세그먼트 15개 초과 | `too-long` | 문장 오인식 차단 |
| 2 | 내부에 공백/탭 포함 | `contains-whitespace` | 공백 포함 경로는 MVP 미지원 (**임의 설정 — 검토 필요**) |
| 3 | `://` 포함 또는 `//`로 시작 또는 `www.`로 시작 | `is-url` | 외부 링크 |
| 4 | `( ) { } [ ] = ; " ' < > , ! ? & \| $` 중 하나 포함 | `code-syntax` | 코드 조각·타입 시그니처 |
| 5 | 첫 토큰이 `COMMAND_PREFIXES`에 포함 | `shell-command` | 명령어 |
| 6 | `*` 또는 `?` 포함 | `glob-pattern` | 글롭은 MVP 미지원(매칭 규칙 없음) |
| 7 | `/^v?\d+(\.\d+)*\+?$/` 매치 | `version-string` | "14+", "3.4.1" 등 버전 표기 |
| 8 | `...`, `…`, `TODO`, `기타`, `생략` 등 자리표시자 | `placeholder` | 트리 생략 표기 |
| 9 | 세그먼트에 `SEGMENT_RE` 불일치 문자 존재 | `code-syntax` | 비정상 문자 |
| 10 | 세그먼트 1개 & 확장자 없음 & `KNOWN_EXTENSIONLESS_FILES` 미포함 | `single-segment-no-extension` | `useState`, `addTodo` 같은 식별자 차단 |
| 11 | 세그먼트 1개 & 확장자가 `KNOWN_EXTENSIONS` 미포함 | `unknown-extension` | `Component.Props` 같은 표기 차단 |

> 세그먼트가 2개 이상(`/` 포함)이면 규칙 10·11을 적용하지 않는다. 근거: `src/components`처럼 확장자 없는 폴더 경로를 살려야 한다.

##### 정규화 (`lib/extract/normalizePath.ts`)

```typescript
export interface NormalizedPath { path: string; kind: ArtifactKind; }

/**
 * 순서:
 *  1) trim, 양끝 백틱/따옴표 제거
 *  2) 역슬래시 → 슬래시 치환 (윈도우 표기 흡수)
 *  3) 선행 './' 제거, 선행 '/' 제거 (저장소 루트 기준으로 통일)
 *  4) 중복 슬래시 '//' → '/' 축약
 *  5) 후행 '/' 있으면 제거하고 kind='directory' 로 확정
 *  6) 세그먼트 중 '.' 제거, '..' 존재 시 null 반환(거부)
 *  7) kind 미확정이면: 마지막 세그먼트에 확장자/특수파일명 있으면 'file', 없으면 'unknown'
 * 대소문자는 변경하지 않는다. (GitHub 경로는 대소문자 구분)
 */
export function normalizePath(raw: string): NormalizedPath | null;
```

##### 병합 (`lib/extract/mergeArtifacts.ts`)

```typescript
/**
 * 병합 키 = 정규화된 path (대소문자 구분).
 * - 동일 키의 후보들은 ExpectedArtifact 1건으로 합치고 sources를 모두 누적한다.
 *   → 기능2 엣지 수용기준("두 문서 동일 경로 → 1항목, 출처 2건") 충족
 * - sources는 (documentName, line) 오름차순 정렬 후 중복 제거.
 * - kind 충돌 해소 우선순위:
 *     1) 규칙 우선순위가 높은 후보(tree-block > code-block-path > inline-code > table-cell > list-label)의 kind
 *     2) 동순위면 'directory' > 'file' > 'unknown'  (근거: 폴더 판정이 하위 파일 존재까지 포괄해 오탐 위험이 낮음)
 * - 정렬: path 사전순 오름차순 (화면 안정성 확보)
 */
export function mergeArtifacts(candidates: RawCandidate[]): ExpectedArtifact[];
```

#### 2-4. 수동 편집 (`hooks/useExpectedArtifacts.ts`)

```typescript
export interface UseExpectedArtifactsResult {
  artifacts: ExpectedArtifact[];
  totalCount: number;                          // artifacts.length 파생값
  isExtracting: boolean;
  extractStats: ExtractResult['stats'] | null;
  runExtraction(documents: UploadedDocument[]): void;
  addManualArtifact(rawPath: string): { ok: true } | { ok: false; message: string };
  removeArtifact(artifactId: string): void;
}
```

- `addManualArtifact`는 `normalizePath` → `rejectionReason` 검사를 동일하게 적용하고, 이미 존재하는 경로면 `{ ok: false, message: '이미 목록에 있는 경로입니다' }`를 반환한다.
- 추가/삭제는 `AppStateProvider`의 `artifacts` 배열을 갱신하고 `totalCount`는 파생값이므로 **즉시 반영**된다.

**수용 기준 매핑**

| PRD 수용 기준 | 구현 방법 |
|--------------|----------|
| .md 최대 2개, 파일 선택 또는 드래그앤드롭, 이름·크기 표시 | `DocumentUploader`가 `<input type="file" accept=".md,text/markdown" multiple>` + `onDrop` 두 경로 모두 `useDocumentUpload.addFiles()` 호출. `DocumentList`가 `fileName` / `formatBytes(sizeBytes)` 표시 |
| 산출물 목록 추출 + 항목별 출처(문서·위치) 표시 | `extractArtifacts()` 결과를 `ArtifactList`에 렌더. `ArtifactItemRow`가 `sources`를 `문서명:줄번호` 배지로 나열, 툴팁에 `snippet` |
| 개별 삭제 / 직접 추가 + 총 항목 수 즉시 반영 | `ArtifactItemRow`의 삭제 버튼 → `removeArtifact`, `ArtifactAddForm` → `addManualArtifact`. `ArtifactList` 헤더의 `총 {totalCount}개`는 파생값이라 리렌더 시 동기 갱신 |
| (엣지) 두 문서 동일 경로 병합 + 출처 2건 | `mergeArtifacts()`가 path 키로 그룹핑하고 `sources`를 누적 |
| (엣지) 추출 0건 시 안내 + 수동 입력 제공 | `artifacts.length === 0 && documents.length > 0` → `EmptyState` variant `no-artifacts`: "기대 산출물을 찾지 못했습니다" + `ArtifactAddForm` 상시 노출 → 검증 진행 가능 |
| (에러) .md 외 확장자 / 1MB 초과 거부 | `validateUploads()`가 `UPLOAD_INVALID_EXTENSION`("마크다운(.md) 파일만 업로드할 수 있습니다") / `UPLOAD_TOO_LARGE`("파일 크기는 최대 1MB까지 지원합니다") 반환 → `ErrorNotice`가 파일명과 함께 표시. 통과한 파일은 정상 업로드(부분 수용) |

---

### 기능 3: 산출물 존재 여부 체크리스트 및 준수율 대시보드 → 구현 명세

> PRD 매핑: 기능 3 — 기대 산출물이 실제 저장소에 존재하는지 체크리스트와 준수율로 확인

**담당 파일**

| 계층 | 파일 |
|------|------|
| 화면 | `VerifyRunner.tsx`, `ComplianceSummary.tsx`, `ResultFilterTabs.tsx`, `ResultChecklist.tsx`, `StatusBadge.tsx`, `EmptyState.tsx`, `ErrorNotice.tsx` |
| 훅 | `useVerification.ts` |
| API | `src/app/api/verify/route.ts` |
| 로직 | `lib/github/tree.ts`, `lib/github/rateLimit.ts`, `lib/github/urls.ts`, `lib/verify/*` (3개 파일) |

#### 3-1. 트리 조회 (`lib/github/tree.ts`) — 단일 요청 원칙

```typescript
/**
 * GET /repos/{owner}/{repo}/git/trees/{ref}?recursive=1
 * - 브랜치명을 그대로 ref로 사용할 수 있어 커밋 SHA 선조회가 불필요하다(요청 1회 절감).
 * - 항목 수와 무관하게 요청은 항상 1회 → 항목 50개 검증 15초 목표와 rate limit 제약을 동시에 충족.
 * - 409 Conflict(빈 저장소) → entries: [], fileCount: 0 으로 정상 반환하고 repoEmpty 처리로 넘긴다.
 * - 응답 truncated=true → RepoTree.truncated에 그대로 전달(결과 신뢰도 경고에 사용).
 */
export async function fetchRepoTree(
  accessToken: string,
  params: { owner: string; repo: string; ref: string },
): Promise<{ tree: RepoTree; rateLimit: RateLimitInfo }>;
```

#### 3-2. 트리 인덱싱 (`lib/verify/buildTreeIndex.ts`)

```typescript
export interface TreeIndex {
  files: Set<string>;                 // blob 경로 원본
  dirsWithFiles: Set<string>;         // blob 1개 이상을 하위에 가진 모든 조상 경로
  filesLower: Map<string, string>;    // 소문자 경로 → 원본 경로
  dirsLower: Map<string, string>;
  childFileCount: Map<string, number>; // 폴더 경로 → 하위(재귀) 파일 수
  fileCount: number;
}

/**
 * 구현:
 *   for (entry of entries where type === 'blob'):
 *     files.add(entry.path); filesLower.set(lower, path)
 *     조상 접두사를 순회하며 dirsWithFiles.add(prefix), childFileCount 증가
 * 복잡도 O(총 경로 세그먼트 수). 5만 파일 저장소 기준 기대 50ms 이내.
 *
 * type === 'tree' 엔트리는 dirsWithFiles에 넣지 않는다.
 *   근거: PRD 엣지 수용기준 "폴더는 하위에 파일이 1개 이상 존재해야 존재로 판정".
 *         blob 경로에서 역산한 접두사만 사용하면 이 규칙이 정의상 항상 성립한다.
 * type === 'commit'(서브모듈)은 파일로 취급하지 않는다. (임의 설정 — 검토 필요)
 */
export function buildTreeIndex(entries: TreeEntry[]): TreeIndex;
```

#### 3-3. 매칭 (`lib/verify/matchArtifact.ts`)

```typescript
export interface MatchContext { repo: RepoSummary; ref: string; }

/**
 * 판정 규칙 (kind별로 분리):
 *
 *  kind === 'file'
 *    1) files.has(path)                       → present / 'exact-file'
 *    2) filesLower.has(lower(path))           → present / 'case-insensitive-file'
 *    3) 그 외                                  → missing / 'none'
 *
 *  kind === 'directory'
 *    1) dirsWithFiles.has(path)               → present / 'exact-directory'
 *    2) dirsLower.has(lower(path))            → present / 'case-insensitive-directory'
 *    3) 그 외                                  → missing / 'none'
 *
 *  kind === 'unknown'
 *    파일 규칙을 먼저 적용하고, 실패하면 폴더 규칙을 적용한다.
 *    (근거: 확장자 없는 경로는 폴더일 가능성이 높지만, Dockerfile 같은 예외를 놓치지 않기 위해 파일을 먼저 본다)
 *
 * 대소문자 무시 매칭은 판정 정확도 95% 목표를 위해 포함하되,
 * matchedPath !== path 인 경우 화면에 "대소문자 불일치" 보조 배지를 표시한다.
 *   → 임의 설정 — 검토 필요 (엄격 일치만 허용할지 결정 필요)
 */
export function matchArtifact(
  artifact: ExpectedArtifact,
  index: TreeIndex,
  ctx: MatchContext,
): VerificationItem;
```

#### 3-4. 링크 생성 (`lib/github/urls.ts`)

```typescript
/** 파일: /blob/{ref}/{path}, 폴더: /tree/{ref}/{path}. 경로 세그먼트는 encodeURIComponent 적용. */
export function buildRepoFileUrl(
  repo: RepoSummary, ref: string, path: string, kind: ArtifactKind,
): string;
```

#### 3-5. 준수율 계산 (`lib/verify/compliance.ts`)

```typescript
export const PASS_THRESHOLD = 80; // PRD 명시값

/**
 * rate = total === 0 ? 0 : (present / total) * 100
 * rateText = rate.toFixed(1)                    // 소수점 첫째 자리까지 (PRD 명시)
 * verdict = rate >= PASS_THRESHOLD ? 'PASS' : 'FAIL'
 *   주의: 표시값(rateText)이 아닌 원값(rate)으로 판정한다.
 *         (79.96%가 "80.0"으로 표시되며 PASS로 뒤집히는 것을 방지)
 */
export function calculateCompliance(
  items: VerificationItem[], threshold?: number,
): ComplianceScore;
```

#### 3-6. 검증 API 및 진행률 (`app/api/verify/route.ts`, `hooks/useVerification.ts`)

```typescript
// 서버: NDJSON 스트리밍 응답 (Content-Type: application/x-ndjson)
// 1) phase: 'fetching-tree'  → fetchRepoTree (지연 대부분이 여기서 발생)
// 2) phase: 'matching'       → buildTreeIndex
// 3) 항목을 VERIFY_CHUNK_SIZE(=10, 임의 설정 — 검토 필요)씩 처리하며
//    item 이벤트와 progress 이벤트를 교대로 flush
// 4) done: VerificationReport 전체
export const VERIFY_CHUNK_SIZE = 10;

// 클라이언트
export interface UseVerificationResult {
  status: 'idle' | 'running' | 'done' | 'error';
  progress: { checked: number; total: number };
  phaseMessage: string;
  report: VerificationReport | null;   // 성공 시에만 교체
  error: AppError | null;
  filter: 'all' | 'missing';
  setFilter(next: 'all' | 'missing'): void;
  visibleItems: VerificationItem[];    // filter 적용 결과
  run(): Promise<void>;
  retry(): Promise<void>;
}
```

> **직전 결과 보존 근거**(기능3 에러 수용기준): `report` 상태는 `done` 이벤트를 수신했을 때만 교체한다. `error` 이벤트나 네트워크 예외 시에는 `error`만 세팅하고 기존 `report`는 유지하므로, 부정확한 값으로 덮어쓰이지 않는다.

**수용 기준 매핑**

| PRD 수용 기준 | 구현 방법 |
|--------------|----------|
| 항목별 존재/없음 + 준수율 소수점 첫째 자리 | `matchArtifact()`가 `status` 산출, `calculateCompliance()`가 `rateText = rate.toFixed(1)`. `ComplianceSummary`가 "준수율 83.3%" 표기 |
| 80% 기준 PASS/FAIL + 기준값 안내 | `verdict` 계산 후 `ComplianceSummary` 상단에 `StatusBadge`(아이콘+텍스트) 표시, 하단에 "판정 기준: 준수율 80% 이상 PASS" 고정 문구 |
| "없음"만 보기 필터 + "존재" 항목 링크 | `ResultFilterTabs`가 `setFilter('missing')` → `visibleItems = items.filter(i => i.status === 'missing')`. `ResultChecklist`가 `htmlUrl` 존재 시 `<a target="_blank" rel="noopener noreferrer">` 렌더 |
| 진행률 표시 + 50개 15초 이내 | `progress` 이벤트로 `VerifyRunner`에 "확인 완료 {checked} / 전체 {total}" 표시. 총 지연 = GitHub 트리 요청 1회(기대 1~2초) + 인메모리 매칭(50개 기준 <10ms) → 목표 대비 충분한 여유 |
| (엣지) 폴더는 하위 파일 1개 이상이면 존재 | `buildTreeIndex`가 blob 경로의 조상 접두사만 `dirsWithFiles`에 넣으므로 규칙이 구조적으로 보장됨. `childFileCount`를 함께 표시 |
| (엣지) 저장소 파일 0개 → 0%, FAIL, 안내 | `tree.fileCount === 0` → `repoEmpty: true`, 전 항목 `missing`, `rate = 0`, `verdict = 'FAIL'`. `EmptyState` variant `empty-repo`: "저장소에 파일이 없습니다" |
| (에러) 권한 부족/한도 초과/네트워크 + 재시도 + 직전 결과 보존 | `route.ts`가 `toAppError()`로 정규화 후 `error` 이벤트 전송(각각 `REPO_FORBIDDEN` / `RATE_LIMITED` / `NETWORK_ERROR`). `ErrorNotice`가 원인별 문구 + `retry()` 버튼 렌더. `report`는 미교체 |

---

## 5. API 명세

모든 응답은 `Content-Type: application/json`(verify만 `application/x-ndjson`)이며, 실패 시 공통 스키마를 사용한다.

```typescript
// src/types/api.ts
export interface ApiErrorBody {
  error: { code: AppErrorCode; message: string; retryable: boolean };
}
```

| Method | Endpoint | 설명 | Request | Response |
|--------|----------|------|---------|----------|
| GET | `/api/auth/login` | GitHub 인가 페이지로 리다이렉트 | 없음 | `302` → `github.com/login/oauth/authorize?...` (state는 세션 쿠키에 저장) |
| GET | `/api/auth/callback` | code↔token 교환 후 세션 생성 | Query: `code`, `state` \| `error`, `error_description` | 성공 `302 /` / 취소 `302 /?error=AUTH_CANCELLED` / state 불일치 `302 /?error=AUTH_STATE_MISMATCH` |
| POST | `/api/auth/logout` | 세션 쿠키 파기 | 없음 | `200 { ok: true }` + `Set-Cookie` 만료 |
| GET | `/api/session` | 로그인 상태 조회 | 없음 | `200 { authenticated: boolean; user: GitHubUser \| null }` — **accessToken 미포함** |
| GET | `/api/repos` | 접근 가능 저장소 목록 | Query: `page`(기본 1), `perPage`(기본 50, 최대 100) | `200 { page: RepoPage; rateLimit: RateLimitInfo }` / `401 UNAUTHENTICATED` / `403 RATE_LIMITED` |
| POST | `/api/verify` | 산출물 존재 검증 실행 | Body: `VerifyRequest` | `200` NDJSON 스트림(`VerifyEvent` 줄 단위) / `401` / `400 INVALID_REQUEST` |

```typescript
export interface VerifyRequest {
  repo: { owner: string; name: string; defaultBranch: string };
  artifacts: Array<{ id: string; path: string; kind: ArtifactKind }>;
  // 문서 원문은 전송하지 않는다. (보안 요구: 업로드 문서가 서버로 나가지 않음)
}
```

**요청 검증 규칙** (`/api/verify`)

| 항목 | 규칙 | 위반 시 |
|------|------|--------|
| `artifacts.length` | 1 이상 500 이하 (임의 설정 — 검토 필요) | `400 INVALID_REQUEST` |
| `artifacts[].path` | 200자 이하, `..` 미포함, 선행 `/` 미포함 | 해당 항목 제외 후 진행 |
| `repo.owner`/`name` | `/^[A-Za-z0-9._-]+$/` | `400 INVALID_REQUEST` |

**보안 규칙 (전 라우트 공통)**

1. `accessToken`은 `AppSession` 안에만 존재하며 **어떤 응답 바디·헤더·로그에도 출력하지 않는다**. 응답 직렬화 함수는 `GitHubUser`만 노출하는 전용 매퍼를 사용한다.
2. GitHub API 호출은 전부 Route Handler 내부에서만 수행한다. 클라이언트가 `api.github.com`을 직접 호출하는 코드는 존재하지 않는다.
3. `next.config.ts`의 `serverExternalPackages`에 `@octokit/rest`를 등록해 클라이언트 번들 유입을 차단한다.
4. 로그 출력 시 `Authorization` 헤더와 `code`·`state` 파라미터는 마스킹한다.

**환경변수** (`.env.local.example`)

| 변수 | 용도 |
|------|------|
| `GITHUB_APP_CLIENT_ID` | GitHub App의 Client ID |
| `GITHUB_APP_CLIENT_SECRET` | code↔token 교환용 시크릿 (서버 전용) |
| `GITHUB_APP_SLUG` | 설치 안내 링크 생성용 |
| `SESSION_SECRET` | iron-session 암호화 키 (32자 이상) |
| `APP_BASE_URL` | redirect_uri 구성용 (예: `http://localhost:3000`) |

---

## 6. 에러 처리 전략

### 6.1 처리 원칙

1. **단일 정의**: 모든 에러는 `AppErrorCode`로 표현하고, 사용자 문구는 `ERROR_CATALOG`에서만 관리한다(문구 중복·불일치 방지).
2. **정규화 지점**: 서버 예외는 Route Handler 최외곽에서 `toAppError()`로 변환한다. 클라이언트는 `code`만 보고 UI를 결정한다.
3. **부분 실패 허용**: 업로드는 파일 단위로, 검증은 항목 단위로 실패를 격리한다.
4. **덮어쓰기 금지**: 실패 시 직전 성공 결과(`report`)를 유지한다.
5. **원문 비노출**: GitHub 응답 원문·토큰은 사용자 메시지에 포함하지 않는다.

### 6.2 PRD 에러 케이스 ↔ 처리 위치 매핑

| PRD 에러 케이스 | 감지 위치 | 에러 코드 | 처리 방식 | 사용자 문구 | 재시도 |
|----------------|----------|----------|----------|------------|--------|
| 인증 취소 / 권한 거부 | `api/auth/callback/route.ts` — 쿼리 `error=access_denied` | `AUTH_CANCELLED` | 세션 미생성, `/?error=AUTH_CANCELLED`로 302 | "인증이 취소되었습니다. 다시 시도해 주세요" | `LoginGate`의 로그인 버튼 |
| state 불일치(CSRF 의심) | `lib/github/oauth.ts` `verifyState()` | `AUTH_STATE_MISMATCH` | 세션 파기 후 로그인 화면 복귀 | "인증 요청을 확인할 수 없습니다. 처음부터 다시 시도해 주세요" | 로그인 버튼 |
| 토큰 교환 실패 | `exchangeCodeForToken()` | `AUTH_EXCHANGE_FAILED` | 302 + 에러 코드 | "GitHub 인증에 실패했습니다. 잠시 후 다시 시도해 주세요" | 로그인 버튼 |
| 로그아웃 / 세션 만료 | `lib/session.ts` `requireSession()` → 401 | `SESSION_EXPIRED` / `UNAUTHENTICATED` | 클라이언트 fetch 래퍼가 401 감지 → `RESET_ALL` 디스패치(계정·저장소·문서·산출물·결과 전부 제거) | "세션이 만료되었습니다. 다시 로그인해 주세요" | 로그인 버튼 |
| 접근 가능 저장소 0개 | `api/repos/route.ts` 응답 `items.length === 0 && page === 1` | `NO_INSTALLATION`(안내용, 예외 아님) | `EmptyState` 렌더 | "검증할 저장소가 없습니다" + "GitHub App에 저장소 접근을 허용하면 목록에 표시됩니다" | 설치 페이지 링크 |
| 저장소 조회 권한 부족 | `lib/github/client.ts` — 403(rate limit 아님) / 404 | `REPO_FORBIDDEN` / `REPO_NOT_FOUND` | `verify` 스트림에 `error` 이벤트, 직전 report 유지 | "이 저장소를 조회할 권한이 없습니다. 접근 권한을 확인해 주세요" | 재시도 버튼 |
| 요청 한도 초과 | `lib/github/rateLimit.ts` — 403/429 + `x-ratelimit-remaining: 0` | `RATE_LIMITED` | **검증 즉시 중단**, `resetAt`를 한국 시각으로 포맷해 안내 | "GitHub 요청 한도를 초과했습니다. {HH:mm} 이후 다시 시도해 주세요" | `resetAt` 이후 활성화되는 재시도 버튼 |
| 네트워크 오류 | 클라이언트 `fetch` reject / 서버 `ECONNRESET`·타임아웃(15초) | `NETWORK_ERROR` | 스트림 중단, 직전 report 유지 | "네트워크 연결이 불안정합니다. 연결 확인 후 다시 시도해 주세요" | 재시도 버튼 |
| GitHub 장애 | 5xx 응답 | `GITHUB_UNAVAILABLE` | `@octokit/plugin-retry`로 2회 자동 재시도(지수 백오프) 후 실패 처리 | "GitHub 서비스에 일시적인 문제가 있습니다" | 재시도 버튼 |
| 확장자 위반 | `validateUploads()` (클라이언트) | `UPLOAD_INVALID_EXTENSION` | 해당 파일만 거부, 나머지는 업로드 | "마크다운(.md) 파일만 업로드할 수 있습니다: {fileName}" | 다시 선택 |
| 크기 위반 | `validateUploads()` (클라이언트) | `UPLOAD_TOO_LARGE` | 해당 파일만 거부 | "파일 크기는 최대 1MB까지 지원합니다: {fileName} ({크기})" | 다시 선택 |
| 개수 초과 | `validateUploads()` (클라이언트) | `UPLOAD_TOO_MANY` | 앞 2개만 수용, 초과분 거부 | "문서는 최대 2개까지 업로드할 수 있습니다" | 기존 문서 제거 후 재시도 |
| 추출 0건 | `useExpectedArtifacts` — `artifacts.length === 0` | `EXTRACTION_EMPTY`(안내용) | 검증 버튼은 유지, 수동 입력 폼 노출 | "기대 산출물을 찾지 못했습니다. 검증할 경로를 직접 추가해 주세요" | 수동 추가 |
| 빈 저장소 | `fetchRepoTree()` 409 또는 `fileCount === 0` | `REPO_EMPTY`(안내용) | 정상 리포트 생성(0%, FAIL) + 안내 배너 | "저장소에 파일이 없습니다" | 다른 저장소 선택 |
| 트리 잘림 | `RepoTree.truncated === true` | `TREE_TRUNCATED`(경고) | 결과는 표시하되 상단 경고 배너 | "저장소가 매우 커서 일부 파일만 조회되었습니다. 결과가 실제와 다를 수 있습니다" | — (임의 설정 — 검토 필요) |

---

## 7. 비기능 요구사항 대응

### 7.1 성능

| PRD 목표 | 설계 대응 | 예상 병목 |
|----------|----------|----------|
| 저장소 목록 3초 이내 | 첫 페이지 `per_page=50` 단일 요청, RSC로 셸 즉시 렌더 후 목록만 클라이언트 페칭 | GitHub `/user/repos` 응답 (기대 300~800ms) |
| 산출물 추출 5초 이내 | 브라우저 내 remark 파싱, 네트워크 왕복 0회. 1MB 문서 2개 기대 <500ms | mdast 생성 |
| 항목 50개 검증 15초 이내 | Trees API **1회** + 인메모리 Set 조회 O(1) × 50 | GitHub 트리 응답 (기대 0.5~2초) |

> 성능 상한 방어: `/api/verify`의 GitHub 호출에 15초 타임아웃(임의 설정 — 검토 필요)을 걸고 초과 시 `NETWORK_ERROR`로 종료한다.

### 7.2 보안 (PRD 보안 4항 대응)

| 요구 | 구현 |
|------|------|
| 인증 정보 세션 동안만 유지 | 세션 쿠키(Max-Age 미지정) + `tokenExpiresAt` 서버 검사. 로그아웃 시 `destroySession()` |
| 업로드 문서·결과 영구 미저장 | 문서/결과는 React 메모리에만 존재. `localStorage`/`sessionStorage`/`indexedDB` 사용 금지(ESLint `no-restricted-globals`로 강제). `/api/verify`는 경로 문자열만 수신하고 응답을 캐시하지 않음(`Cache-Control: no-store`) |
| 읽기 목적 외 변경 없음 | GitHub App 권한을 `Contents: Read-only`, `Metadata: Read-only`로 선언. 코드에도 GET 호출만 존재 |
| 인증 정보 원문 미노출 | 토큰은 암호화 쿠키 내부에만 존재. `/api/session`은 `GitHubUser`만 반환. 토큰을 인자로 받는 함수는 전부 `lib/github/*`(서버 전용 모듈) |

### 7.3 접근성

| 요구 | 구현 |
|------|------|
| 전 단계 키보드 조작 | 업로드 영역은 `role="button" tabIndex={0}` + Enter/Space 핸들러로 파일 다이얼로그 오픈(드래그 대체 경로 제공). 저장소 목록은 `role="listbox"`/`role="option"` + 방향키 이동. Radix 기반 컴포넌트는 기본 지원 |
| 색상 외 구분 | `StatusBadge`가 `아이콘(CheckCircle/XCircle) + 텍스트("존재"/"없음") + 색상` 3중 표기. PASS/FAIL도 동일 |
| 명도 대비 4.5:1 | `globals.css`의 색상 토큰만 사용. 상태색은 `green-700`/`red-700` 계열(흰 배경 대비 ≥ 4.5:1)로 고정 |
| 1280px / 768px 가로 스크롤 없음 | 2단 그리드는 `md:` 브레이크포인트에서만 적용, 긴 경로 문자열은 `break-all` + `min-w-0` 처리 |
| 진행률·결과 갱신 안내 | 진행률 영역 `role="status" aria-live="polite"`, 에러 영역 `role="alert"` |

---

## 8. 검증 매트릭스 (PRD 수용 기준 20개 전수)

| # | PRD 수용 기준 | 구현 파일 | 핵심 함수/요소 | 검증 방법 |
|---|--------------|----------|---------------|----------|
| 1-1 | 미로그인 시 로그인 진입점만 / 인증 후 계정명·프로필 표시 | `app/page.tsx`, `components/LoginGate.tsx`, `AppHeader.tsx`, `hooks/useSession.ts` | `useSession().authenticated` 분기 | 시나리오: 시크릿 창 접속 → 로그인 버튼만 보임 / 로그인 후 헤더에 login·avatar 표시 |
| 1-2 | 저장소 목록 최근 수정일 내림차순 + 저장소명·기본 브랜치·공개여부 | `lib/github/repos.ts`, `components/RepoListItem.tsx` | `listAccessibleRepos()` (`sort=pushed&direction=desc`) | 단위: `toRepoSummary` 매핑 테스트 / 시나리오: 목록 첫 항목이 가장 최근 푸시된 저장소, 3개 필드 표시 확인 |
| 1-3 | 검색 필터 + 선택 시 "검증 대상" 고정 표시 | `components/RepoSearchInput.tsx`, `SelectedRepoBanner.tsx`, `hooks/useRepoList.ts` | `filterReposByName()`, `selectRepo()` | 단위: `filterReposByName` 대소문자·부분일치 테스트 / 시나리오: 검색어 입력 후 목록 축소, 선택 시 배너 고정 |
| 1-4 | (엣지) 저장소 0개 안내 + 다음 행동 | `components/EmptyState.tsx`, `lib/github/oauth.ts` | `EmptyState variant="no-repos"`, `buildInstallUrl()` | 시나리오: 앱 설치 저장소 0개 계정으로 로그인 → 안내 문구와 설치 링크 노출 |
| 1-5 | (엣지) 100개 초과 순차 로드 + 선택 유지 | `hooks/useRepoList.ts`, `components/RepoPicker.tsx` | `loadMore()`, `hasNext`(Link 헤더) | 시나리오: 저장소 120개 계정에서 1페이지 선택 후 "더 보기" → 선택 배너 유지 확인 |
| 1-6 | (에러) 인증 취소 시 로그인 화면 복귀 + 메시지 | `app/api/auth/callback/route.ts`, `components/ErrorNotice.tsx` | `error=access_denied` 분기 → `AUTH_CANCELLED` | 시나리오: GitHub 인가 화면에서 Cancel → "인증이 취소되었습니다. 다시 시도해 주세요" + 재시도 정상 동작 |
| 1-7 | (에러) 로그아웃·세션 만료 시 전체 제거 | `app/api/auth/logout/route.ts`, `lib/session.ts`, `state/appReducer.ts` | `destroySession()`, `RESET_ALL` 액션 | 단위: reducer `RESET_ALL` 후 user/repos/documents/artifacts/report 초기값 검증 / 시나리오: 로그아웃 후 화면 전체 초기화 |
| 2-1 | .md 최대 2개 업로드(선택·드래그) + 이름·크기 표시 | `components/DocumentUploader.tsx`, `DocumentList.tsx`, `lib/upload/validateUpload.ts` | `validateUploads()`, `readAsUploadedDocument()` | 단위: 개수/확장자/크기 조합 테스트 / 시나리오: 드래그와 파일 선택 두 경로 모두 업로드 후 이름·크기 표시 |
| 2-2 | 산출물 목록 추출 + 출처(문서·위치) 표시 | `lib/extract/*`, `components/ArtifactList.tsx`, `ArtifactItemRow.tsx` | `extractArtifacts()`, `ArtifactSource.line` | 단위: 본 TECH_SPEC 문서 자체를 입력으로 넣어 `src/app/page.tsx` 등이 추출되고 line이 실제 줄과 일치하는지 검증 |
| 2-3 | 항목 삭제/추가 + 총 항목 수 즉시 반영 | `hooks/useExpectedArtifacts.ts`, `components/ArtifactAddForm.tsx` | `addManualArtifact()`, `removeArtifact()`, `totalCount` | 단위: 추가/삭제/중복 추가 반환값 테스트 / 시나리오: 삭제 즉시 카운트 감소 확인 |
| 2-4 | (엣지) 두 문서 동일 경로 병합 + 출처 2건 | `lib/extract/mergeArtifacts.ts` | `mergeArtifacts()` | 단위: 동일 경로를 포함한 문서 2건 입력 → 결과 1건, `sources.length === 2` |
| 2-5 | (엣지) 추출 0건 안내 + 수동 입력 제공 | `components/EmptyState.tsx`, `ArtifactAddForm.tsx` | `EmptyState variant="no-artifacts"` | 시나리오: 경로가 없는 산문 .md 업로드 → 안내 노출, 수동 추가 후 검증 실행 가능 |
| 2-6 | (에러) 확장자·1MB 위반 거부 + 명시적 메시지 | `lib/upload/validateUpload.ts`, `components/ErrorNotice.tsx` | `UPLOAD_INVALID_EXTENSION`, `UPLOAD_TOO_LARGE` | 단위: `.txt` 파일, 1.5MB `.md` 입력 → 각 코드 반환 / 시나리오: 허용 확장자·최대 크기 문구 노출 확인 |
| 3-1 | 항목별 존재/없음 + 준수율 소수 첫째 자리 | `lib/verify/matchArtifact.ts`, `compliance.ts`, `components/ComplianceSummary.tsx` | `matchArtifact()`, `calculateCompliance()` | 단위: 5개 중 3개 존재 → `rateText === '60.0'` / 시나리오: 체크리스트 상태와 준수율 표기 확인 |
| 3-2 | 80% 기준 PASS/FAIL + 기준값 안내 | `lib/verify/compliance.ts`, `components/ComplianceSummary.tsx`, `StatusBadge.tsx` | `PASS_THRESHOLD`, `verdict` | 단위: 79.9→FAIL, 80.0→PASS 경계 테스트 / 시나리오: 기준값 안내 문구 노출 확인 |
| 3-3 | "없음" 필터 + "존재" 항목 링크 | `components/ResultFilterTabs.tsx`, `ResultChecklist.tsx`, `lib/github/urls.ts` | `setFilter('missing')`, `buildRepoFileUrl()` | 단위: URL이 파일은 `/blob/`, 폴더는 `/tree/`인지 검증 / 시나리오: 필터 적용 시 missing만 노출, 링크 클릭 시 해당 파일 페이지 도달 |
| 3-4 | 진행률 표시 + 50개 15초 이내 | `app/api/verify/route.ts`, `hooks/useVerification.ts`, `components/VerifyRunner.tsx` | `VerifyEvent('progress')`, `VERIFY_CHUNK_SIZE` | 성능 측정: 항목 50개 검증 3회 실행, `finishedAt - startedAt` 15초 미만 / 시나리오: 진행 중 "확인 완료 n/50" 갱신 확인 |
| 3-5 | (엣지) 폴더는 하위 파일 1개 이상이면 존재 | `lib/verify/buildTreeIndex.ts`, `matchArtifact.ts` | `dirsWithFiles`, `exact-directory` | 단위: blob `a/b/c.ts` 입력 시 `a`, `a/b`가 존재 판정, `a/z`는 없음 판정 |
| 3-6 | (엣지) 파일 0개 저장소 → 0%, FAIL, 안내 | `lib/github/tree.ts`, `lib/verify/compliance.ts`, `components/EmptyState.tsx` | `repoEmpty`, `REPO_EMPTY` | 시나리오: 빈 저장소 선택 후 검증 → 0.0%, FAIL, "저장소에 파일이 없습니다" 노출 |
| 3-7 | (에러) 권한 부족·한도 초과·네트워크 오류 원인별 안내 + 재시도 + 직전 결과 보존 | `lib/errors.ts`, `lib/github/rateLimit.ts`, `hooks/useVerification.ts`, `components/ErrorNotice.tsx` | `toAppError()`, `isRateLimited()`, `retry()` | 단위: 403/404/429/네트워크 예외 → 각 코드 매핑 검증 / 시나리오: 성공 1회 후 오류 유발 → 기존 결과 유지되고 오류 배너만 추가 |

**매핑 완전성**: PRD 수용 기준 20개 = 매트릭스 행 20개 (기능1: 1-1~1-7 = 7개, 기능2: 2-1~2-6 = 6개, 기능3: 3-1~3-7 = 7개). 누락 없음.

---

## 9. 검토가 필요한 임의 결정 사항

| # | 항목 | 설정값 | 근거 / 리스크 |
|---|------|--------|--------------|
| 1 | 저장소 목록 페이지 크기 | `REPOS_PER_PAGE = 50` | 3초 목표와 요청 횟수의 절충. 저장소가 많은 사용자는 "더 보기" 클릭이 잦아질 수 있음 |
| 2 | 검색 입력 디바운스 | 250ms | 체감 반응성 기준 관행값. 클라이언트 필터라 지연 없이 0ms도 가능 |
| 3 | 최대 추출 항목 수 | `MAX_ARTIFACTS = 300` | 화면·성능 보호. 대형 TECH_SPEC에서 절단 발생 가능 |
| 4 | 검증 요청 항목 상한 | 500개 | API 남용 방지. PRD 성능 기준(50개)의 10배 |
| 5 | 공백 포함 경로 미지원 | 거부 규칙 #2 | 오탐 억제 우선. `docs/my file.md` 같은 경로를 놓침 |
| 6 | 대소문자 무시 매칭 허용 | 2차 매칭으로 허용 + 배지 표시 | 판정 정확도 95% 목표에 유리하나, 엄격 일치를 원하는 사용자에겐 오탐일 수 있음 |
| 7 | 서브모듈(`type: 'commit'`) 처리 | 파일로 취급하지 않음 | 서브모듈 경로를 기대 산출물로 적은 경우 "없음"으로 판정됨 |
| 8 | 트리 잘림(truncated) 처리 | 결과 표시 + 경고 배너 | PRD에 규정 없음. "결과를 아예 표시하지 않음"이 더 안전할 수 있음 |
| 9 | 검증 스트림 청크 크기 | `VERIFY_CHUNK_SIZE = 10` | 진행률 갱신 빈도. 성능 영향 미미 |
| 10 | GitHub 호출 타임아웃 | 15초 | PRD 성능 목표와 동일값. 별도 여유를 둘지 검토 필요 |
| 11 | 상태 새로고침 시 소실 | 브라우저 스토리지 미사용 | 보안 요구를 최우선한 결과. 새로고침 시 문서 재업로드가 필요해 완주율 70% 목표에 불리할 수 있음 |
| 12 | `/user/repos` 엔드포인트 사용 | GitHub App user token 기준 | 앱 설치 범위에 따라 반환 결과가 달라질 수 있어, 구현 착수 시 실계정으로 동작 확인 필요 |

---

## 10. PRD 커버리지 확인

| PRD 기능 | 수용 기준 수 | TECH_SPEC 섹션 | 상태 |
|----------|-------------|---------------|------|
| 기능 1: GitHub 로그인 및 검증 대상 저장소 선택 | 7 | §4 기능1, §5 API(auth/session/repos), §8 1-1~1-7 | 전부 매핑 |
| 기능 2: SDD 스펙 문서 업로드 및 기대 산출물 추출 | 6 | §4 기능2(추출 규칙 R1~R5 포함), §8 2-1~2-6 | 전부 매핑 |
| 기능 3: 산출물 체크리스트 및 준수율 대시보드 | 7 | §4 기능3, §5 API(verify), §8 3-1~3-7 | 전부 매핑 |
| 비기능: 성능/보안/접근성 | — | §7 | 전부 매핑 |
| 비범위(DB, 정적분석, 팀 협업 등) | — | 설계에 미포함 | 준수 |
