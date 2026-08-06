# 스펙 검증 리포트: git_review

> `/sdd-review` 3단계 검증 결과 · 검증일 2026-08-06
> 대상: `docs/PRD.md`(기능 3 / 수용 기준 20) ↔ `docs/TECH_SPEC.md`(1101줄) ↔ `src/`(60개 파일)
> 방법: Stage 1·2·3을 서로 독립한 리뷰어 3인이 병렬 수행. 사전에 알려진 이슈를 공유하지 않아 교차 확인이 성립함.

---

## 종합 결과

| 단계 | 결과 | 점수 |
|------|------|------|
| Stage 1 — PRD ↔ 코드 | ⚠️ 조건부 | PASS 18 / PARTIAL 2 / FAIL 0 (18/20) |
| Stage 2 — TECH_SPEC ↔ 코드 | ⚠️ 부분일치 | 일치 2 / 부분일치 3 / 불일치 0 (5개 축) |
| Stage 3 — 코드 품질 | ⚠️ 조건부 | 양호 3 / 개선 필요 3 (6개 축) |
| **종합 (최초 검증)** | **❌ 배포 불가 — 치명 결함 1건** | — |

수용 기준 기계적 점수는 90%지만, 아래 **C-1(루트 접두사)** 이 제품의 핵심 기능을 구조적으로 무력화하므로 최초 판정은 배포 불가였다.

---

## 🔧 수정 현황 (2026-08-06 반영)

| 항목 | 상태 | 조치 |
|---|---|---|
| **C-1** 트리 루트 접두사 | ✅ 해결 | `treeBlock.ts`에 단일 루트 절단 추가 + TECH_SPEC §4 R1 8단계 명문화 |
| **H-1** 클라이언트 예외 정규화 | ✅ 해결 | `caught as AppError` 4곳을 `toAppError()`로 교체 + 카탈로그 폴백 2곳 |
| H-2 / M-1~M-7 / L-1~L-8 / D-2~D-12 | ⬜ 미착수 | 아래 "권장 처리 순서" 참조 |

**검증 결과**: `tsc --noEmit` exit 0 · `eslint .` exit 0 · `npm run build` exit 0(8개 라우트) · 단위 테스트 **115/115 통과**(기존 80 + C-1 회귀 19 + H-1 회귀 16).

C-1 수정 후 TECH_SPEC.md 입력 시 추출 항목이 **179 → 159개**로 줄었다. 감소분 20건은 접두사 때문에 같은 파일이 2건으로 갈라져 있던 중복이며, 이제 `git_review/` 접두사 경로 0건 · 경로 중복 0건이다.

⚠️ 아래 원문은 **최초 검증 시점 기록**이다. C-1·H-1 항목은 위 표대로 이미 해결되었다.

---

## 🔴 치명 (배포 차단)

### C-1. 트리 블록 복원 경로에 저장소 루트 이름이 남아 R1 산출물이 전량 오판정

- **위치**: `src/lib/extract/treeBlock.ts:126-179`
- **교차 확인**: 구현 단계 · Stage 2가 각각 독립 발견

**증상.** 문서의 트리 코드블록이 저장소 이름을 루트 노드로 포함하면(가장 흔한 표기이며 **본 프로젝트의 TECH_SPEC §2 트리가 정확히 그 형태**), 그 이름이 경로 접두사로 남는다.

```
git_review/                → "git_review"
├── src/ → app/ → page.tsx → "git_review/src/app/page.tsx"
```

`TreeEntry.path`는 저장소 루트 기준 상대 경로이고(`src/types/github.ts:36`), `buildTreeIndex`는 blob 경로를 그대로 키로 넣는다(`src/lib/verify/buildTreeIndex.ts:43-54`). 따라서 `index.files.has('git_review/src/app/page.tsx')`는 **항상 false** → 해당 항목 전부 `missing`.

**파급.**
1. R1은 스펙이 "가장 신뢰도 높음"으로 규정한 규칙인데 그 결과물이 100% 오판정된다.
2. 인라인 코드(R3)·표(R4)는 올바른 루트 상대 경로를 뽑으므로, 같은 파일이 **서로 다른 2건**으로 남는다(병합 키가 정규화 경로이므로 병합되지 않음).
3. PRD 성공 지표 "판정 정확도 95%"와 TECH_SPEC §8의 3-1/3-2 경계 테스트를 통과할 수 없다.

**근본 원인 — 스펙 자체가 모순.**
- §4 R1 의사코드에는 루트 접두사 처리 규칙이 **없다** (`docs/TECH_SPEC.md:586-609`)
- §8 검증 매트릭스 2-2는 "이 TECH_SPEC 문서를 입력하면 **`src/app/page.tsx`가 추출**될 것"을 기대값으로 명시 (`docs/TECH_SPEC.md:1057`)

구현은 의사코드를 따랐다. 즉 코드와 스펙 양쪽 모두 수정이 필요하다.

**수정 방향.**
- `docs/TECH_SPEC.md` §4 R1에 8단계 추가: "블록에 컬럼 0인 노드가 정확히 1개이고 나머지 전 노드가 그 자손이면, 해당 루트 노드를 제거하고 자식 경로에서 접두사를 제거한다(단일 루트 절단)."
- `parseTreeBlock` 반환 직전에 위 규칙 적용, 루트 노드 자체는 후보에서 제외.
- 회귀 테스트: §8 2-2에 이미 명시된 방법 그대로 — 본 TECH_SPEC §2 트리를 입력해 `src/app/page.tsx`가 나오는지 검증.

---

## 🟠 높음

### H-1. 스트림 중단 시 `caught as AppError` → 렌더 크래시

- **위치**: `src/hooks/useVerification.ts:161-164` (동일 패턴: `useRepoList.ts:84-85`, `useSession.ts:55,72`)
- **교차 확인**: Stage 1(3-7 PARTIAL) · Stage 3(3-A 높음) 이 독립 발견

`readNdjsonStream` 소비 중 연결이 끊기면 `reader.read()`가 원시 `TypeError`로 reject된다. `api.request`는 fetch **시작** 시점 예외만 정규화하므로 이 값은 정규화되지 않은 채 `as AppError` 캐스트로 상태에 들어간다. 이후 `ErrorNotice.tsx:76,80`에서 `ERROR_CATALOG[undefined].userMessage` 접근으로 2차 `TypeError` → `app/error.tsx` 전체 폴백 화면.

**영향**: PRD 수용 기준 3-7("네트워크 오류 → 원인별 안내 + 재시도 + 직전 결과를 부정확한 값으로 덮어쓰지 않음")이 정확히 그 시나리오에서 무너지고, 직전 리포트가 화면에서 사라진다.

**수정**: `setError(isAppError(caught) ? caught : createClientError('NETWORK_ERROR', undefined, caught))` (3곳). 방어로 `ErrorNotice.tsx:76`과 `AppError` 생성자(`errors.ts:185`)에 `ERROR_CATALOG[code] ?? ERROR_CATALOG.UNKNOWN` 폴백 추가. → 5파일 / 각 1~3줄.

### H-2. 미사용 에러 코드 3개 + 사용자 문구 중복 정의

- **위치**: `src/lib/errors.ts:80-99,135-139` ↔ `src/components/EmptyState.tsx:45-75`

`NO_INSTALLATION` / `EXTRACTION_EMPTY` / `REPO_EMPTY` 는 `ERROR_CATALOG`에만 존재하고 생산자·소비자가 없다. 그 문구가 `EmptyState` 프리셋에 문자열로 재작성되어 있으며, 이미 어미가 갈라지기 시작했다("…표시됩니다" vs "…표시됩니다.").

TECH_SPEC §6.1 처리 원칙 1항("사용자 문구는 `ERROR_CATALOG`에서만 관리 — 문구 중복·불일치 방지")의 직접 위반.

---

## 🟡 중간

| # | 항목 | 위치 | 수정 |
|---|---|---|---|
| M-1 | 콜백 라우트의 `destroySession()`이 try 밖 → 인증 취소 경로에서 500 누출 (PRD 1-6 "화면 오류 없이 재시도"와 충돌) | `src/app/api/auth/callback/route.ts:43-46` | try/catch로 감싸기 |
| M-2 | `httpStatus: 200`인 AppError가 JSON 오류 응답으로 나가면 클라이언트가 성공으로 오인 → `response.page.items` 접근에서 크래시 | `api/repos/route.ts:55`, `api/verify/route.ts:134` | `Math.max(httpStatus, 400)` 클램프 |
| M-3 | `<ul>`에 `role="tabpanel"` 부여로 리스트 시맨틱 파괴 — 스크린리더가 "목록, 항목 N개"를 낭독하지 못함 | `src/components/ResultChecklist.tsx:63-69` | `div[role=tabpanel] > ul` 구조로 래핑 |
| M-4 | `item` 이벤트마다 `setProgress` → 항목 수만큼 전체 리렌더. 재실행 시 최대 500행 체크리스트가 매번 재조정 | `src/hooks/useVerification.ts:122-128` | 중복 progress 증분 제거(서버 `progress` 이벤트만 신뢰) |
| M-5 | NDJSON 이벤트를 스키마 검증 없이 소비 — `event.code`가 카탈로그에 없으면 H-1과 동일 크래시 경로 | `lib/ndjson.ts:57`, `useVerification.ts:114-143` | `type`/`code` 최소 검증 + 카탈로그 대조 정규화 |
| M-6 | `/api/repos` 응답의 `installUrl`이 `ReposResponse` 타입과 §5 스펙에 미반영, 로컬 인터페이스 2중 정의 | `types/api.ts:34-37`, `api/repos/route.ts:24`, `useRepoList.ts:28` | 타입에 필드 추가 후 로컬 정의 제거 |
| M-7 | `RATE_LIMITED` 재시도 버튼이 `resetAt` 이전에도 활성 → 무의미한 재시도로 잔여 한도 추가 소모 | `components/ErrorNotice.tsx:81,119-130` | `retryAfter` 전달 후 `disabled` 처리 |

---

## 🟢 낮음

- **L-1** 업로드 거부 메시지가 확장자/크기 중 하나만 언급 (PRD 2-6은 둘 다 요구). 화면 힌트에는 둘 다 있어 정보 자체는 제공됨 — `lib/errors.ts:120-129`
- **L-2** 미사용 의존성 6개: `swr`, `clsx`, `tailwind-merge`, `class-variance-authority`, `@radix-ui/react-slot`, `remark`. TECH_SPEC §1.1의 "Radix가 키보드·ARIA를 기본 제공" 논거가 성립하지 않으며 실제로는 listbox 키보드 처리를 수작업 구현함 → §7.3 접근성 근거 재검토 필요
- **L-3** ID 생성 유틸 3중 중복(`mergeArtifacts.ts:44`, `useExpectedArtifacts.ts:54`, `validateUpload.ts:101`), `getExtension`이 두 곳에 서로 다른 계약으로 존재
- **L-4** 죽은 코드: `maskSecret`(§5 로그 마스킹 규칙의 실행 주체 부재), `isRateLimitExceeded`, 표시되지 않는 `VerificationReport.rateLimit`
- **L-5** 라이브 리전 중첩(`ComplianceSummary.tsx:44-51`이 `role="alert"`를 품음), 페이지 내 `<h1>` 2개, `aria-disabled`가 막지 못하는 링크
- **L-6** `SESSION_OPTIONS.secure`가 `NODE_ENV==='production'` 조건부 — 스테이징을 development로 배포하면 평문 전송
- **L-7** 로그인 직후 첫 페인트에 "검증할 저장소가 없습니다"가 한 프레임 오출력 가능 — `RepoPicker.tsx:116`
- **L-8** GitHub 요청 타임아웃(15초)이 PRD 성능 목표(15초)와 동일 + 5xx 2회 재시도 → 목표 초과 위험. 트리 조회만 10초로 분리 권장

---

## 📄 TECH_SPEC 문서 자체의 결함 (코드가 아닌 문서를 고쳐야 함)

| # | 항목 | 위치 |
|---|---|---|
| D-1 | **§4 R1에 루트 접두사 처리 규칙 부재 → §8 2-2 기대 출력과 모순** (C-1의 근본 원인) | `:586-609` ↔ `:1057` |
| D-2 | 파일 수 집계 오류: "소스 58개, lib 14" — 자기 트리를 세면 lib 21 / 총 65 | `:163` |
| D-3 | `export const VERIFY_CHUNK_SIZE`는 Next.js Route Handler에서 export 불가 (코드가 옳음) | `:892` |
| D-4 | §5 `/api/repos` 응답 스키마에 `installUrl` 누락 | `:942` |
| D-5 | `mergeArtifacts(candidates: RawCandidate[])` — `RawCandidate`에 문서 정보가 없어 `ArtifactSource` 생성 불가한 실현 불가 시그니처 (코드가 `MergeCandidate`로 올바르게 확장) | `:735` |
| D-6 | 거부 규칙 #4(`?`→`code-syntax`)가 #6(`?`→`glob-pattern`)보다 앞서 `glob-pattern`이 `*`로만 도달 가능 | `:692,694` |
| D-7 | 거부 규칙 #11에 `KNOWN_EXTENSIONLESS_FILES` 면제가 없어 `.env.local`이 오거부됨 (코드가 옳게 면제) | `:699` |
| D-8 | 파이프라인 [6]단계가 "절단을 stats에 기록"이라 했으나 §3.2 `ExtractResult.stats`에 해당 필드 없음 | `:558` ↔ `:277-283` |
| D-9 | §6.2 감지 위치 표기 부정확: `REPO_FORBIDDEN`/`REPO_NOT_FOUND`의 실제 매핑은 `errors.ts toAppError()` | `:999` |
| D-10 | §6.2 `NO_INSTALLATION`/`EXTRACTION_EMPTY`/`REPO_EMPTY` 처리 위치가 실제 구현과 다름 (H-2 수정 후 정정) | `:998,1006,1007` |
| D-11 | §2 트리에 `eslint.config.mjs` 누락 (§7.2가 요구하는 강제 수단의 담당 파일) | `:79-161` |
| D-12 | §4 R3 "마지막 토큰이 경로처럼 보이고" 조건이 실제 판정에 영향 없음 | `:632-633` |

---

## ✅ 검증에서 결함이 발견되지 않은 영역

- **타입 계층(§3 ↔ `src/types/`)**: 4개 파일이 필드·유니온 멤버·주석까지 1:1 일치. 누락 0 / 개명 0 / 추가 0.
- **보안 (PRD의 가장 강한 제약)**: 토큰 유출 경로 없음(`console.*` 0건, `AppError.toBody()`가 code/message/retryable만 직렬화, `/api/session`이 3필드 재구성). `import 'server-only'` + `serverExternalPackages` 이중 차단. OAuth state를 `timingSafeEqual` 상수시간 비교(`oauth.ts:56-67`) 후 세션에서 삭제해 재사용 차단. 오픈 리다이렉트 없음(리다이렉트 대상이 `new URL('/', request.url)` 고정). 경로 트래버설 이중 차단.
- **스토리지 금지 제약**: 실사용 0건이며 `eslint.config.mjs:22-43`의 `no-restricted-globals`/`no-restricted-properties`로 실제 강제. 업로드 문서 원문은 서버로 전송되지 않음.
- **단일 트리 호출 원칙**: Octokit 호출이 3종뿐이며 항목 수에 비례하는 지점 없음. 매칭은 전부 인메모리 O(1).
- **거부 규칙 11개 + 상수 사전 3종**: 문서 순서 그대로 구현되고 각 분기에 규칙 번호 주석.
- **타입 안전성**: `any` 0건, `@ts-ignore` 0건, non-null 단언 0건. 외부 경계는 `unknown`으로 받아 필드별 검사.
- **키보드 접근성**: 로그인→업로드→저장소 선택→검증 실행 전 단계가 실제 핸들러로 수행 가능. `StatusBadge`가 아이콘+텍스트+색상 3중 표기.

---

## ⚠️ 이 검증의 한계 (미확인 항목)

리뷰어는 코드를 실행할 수 없었고, 유효한 GitHub App 자격증명이 없어 성공 경로가 한 번도 실행되지 않았다.

1. **실제 GitHub 연동 전 구간 미검증** — 저장소 목록 조회, 트리 조회, 준수율 계산, 진행률 갱신. 실측된 것은 인증 실패·검증 실패 경로뿐이다.
2. **성능 목표 3종(3초 / 5초 / 15초) 미측정.**
3. **명도 대비 4.5:1은 정적 계산값** — `*-surface` 배경 위 실측은 브라우저 확인 필요.
4. **브라우저 조작 미실시** — 키보드 내비게이션과 768/1280px 반응형은 코드상 속성만 확인.
5. `iron-session` v8 `destroy()`의 실제 `Set-Cookie` 발행 여부, `/user/repos`가 GitHub App 토큰에서 설치 저장소만 반환하는지(TECH_SPEC §9 #12)는 실계정 확인 필요.

### 검증 과정에서 정정된 오탐

Stage 2가 "`eslint.config.mjs` 부재 → `npm run lint` 실패, §7.2 강제 미구현"으로 보고했으나 **사실이 아니다.** 파일은 루트에 존재하며 3종 스토리지를 error로 차단한다(`eslint.config.mjs:22-43`). `npx eslint .`가 exit 0으로 통과한 실행 결과, 그리고 Stage 3의 독립 확인과도 일치한다.

---

## 권장 처리 순서

1. **C-1** 루트 접두사 절단 — 코드 + TECH_SPEC §4 R1 동시 수정, §8 2-2 회귀 테스트 (배포 차단 요인)
2. **H-1** 클라이언트 예외 정규화 — 5파일 국소 수정
3. **M-1 ~ M-3** 500 누출 / status 클램프 / tabpanel 시맨틱
4. **H-2, M-6** 에러 문구 단일 출처화, `installUrl` 타입 반영
5. **D-1 ~ D-12** TECH_SPEC 문서 정정
6. **L-1 ~ L-8** 정리 작업
7. 실계정으로 성공 경로 E2E 검증 (위 "한계" 1~5 해소)
