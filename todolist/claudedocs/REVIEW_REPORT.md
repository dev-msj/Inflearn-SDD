# 스펙 검증 리포트: todolist

> 검증 일시: 2026-08-06
> 검증 대상: `src/` 소스 16개 + 루트 설정 파일 5개
> 기준 문서: `claudedocs/PRD.md`, `claudedocs/TECH_SPEC.md`
> 검증 방법: 전체 소스 파일 정독 후 스펙 조항별 대조 (근거는 `파일:라인`으로 명시)

---

## 종합 결과

| 단계 | 결과 | 점수 |
|------|------|------|
| Stage 1: PRD 수용 기준 일치 | PASS | 20 / 20 (100%) |
| Stage 2: TECH_SPEC 일치 | PASS | 23.5 / 24 (97.9%) |
| Stage 3: 코드 품질 | PASS | 19 / 20 (95.0%) |
| **종합** | **PASS** | **62.5 / 64 = 97.7%** |

**판정: PASS (80~99%) — 경미한 개선 후 배포 가능.**
Critical/Major 결함 0건. Minor 6건.

---

## Stage 1: PRD 일치 검증 (20/20)

### 기능 1: 할 일 등록 및 삭제

| # | 수용 기준 | 판정 | 근거 |
|---|----------|------|------|
| A1-1 | 1~100자 입력 후 등록 시 즉시 추가 + 입력란 초기화 | PASS | `TodoForm.tsx:32-48` (`handleSubmit` → 검증 → `onSubmit`), `TodoForm.tsx:44-47` (`onSubmit`이 true일 때만 `setTitle('')`, `setDueDate('')`), `useTodos.ts:71-98` (`addTodo` → `commit([...prev, todo])`) |
| A1-2 | 특정 항목만 삭제, 나머지 내용·완료 상태 불변 | PASS | `useTodos.ts:101-106` — `todosRef.current.filter((todo) => todo.id !== id)` 만 수행. 잔존 항목 객체 참조를 그대로 유지하므로 필드 재생성 없음 |
| A1-3 | 0개일 때 "등록된 할 일이 없습니다" 안내 | PASS | `TodoList.tsx:6-9` (`MESSAGES.empty`), `TodoList.tsx:48-54` — `isLoaded` 이후 `todos.length === 0`이면 안내 문구 렌더 |
| A1-4 | 동일 내용 중복 등록 허용 + 개별 삭제 | PASS | `useTodos.ts:87` `crypto.randomUUID()`로 id 생성, `TodoList.tsx:60` `key={todo.id}`. 내용 기반 중복 제거 로직 없음 |
| A1-5 | 새로고침·재방문 후에도 결과 유지 | PASS | `storage.ts:79-88` `writeTodos` → `todolist.todos.v1`, `useTodos.ts:44-51` 마운트 시 `readTodos()`로 복원, `useTodos.ts:58-68` 모든 변경이 `commit`을 경유해 저장 |
| A1-6 | 빈 값/공백만 입력 시 오류 안내 | PASS | `todoValidation.ts:18-21` (`trimmed.length === 0` → `emptyTitle`), `todoValidation.ts:6` 문구 일치, `TodoForm.tsx:72-76` `<p role="alert">` 렌더 |
| A1-7 | 100자 초과 시 오류 안내 | PASS | `todoValidation.ts:22-24` (`> TITLE_MAX_LENGTH` → `tooLongTitle`), `TodoForm.tsx:61-71` 입력란에 `maxLength` 미부여 → 붙여넣기 초과분도 검증 경로로 진입 (TECH_SPEC 159행 요구 충족) |

### 기능 2: 완료 체크 및 상태 변경

| # | 수용 기준 | 판정 | 근거 |
|---|----------|------|------|
| A2-1 | 완료 선택 시 상태 변경 + 시각적 구분(취소선) | PASS | `TodoItem.tsx:66-72` 네이티브 체크박스 `checked={todo.completed}`, `TodoItem.tsx:76-80` `todo.completed`일 때 `line-through` 적용 |
| A2-2 | 재선택 시 미완료 복귀 | PASS | `useTodos.ts:114-122` `completed: !todo.completed` 단일 반전 로직. 별도 분기 없음 |
| A2-3 | "완료 N / 전체 M" 표시 및 실시간 갱신 | PASS | `TodoSummary.tsx:8-10` `완료 ${completedCount} / 전체 ${totalCount}`, `useTodos.ts:150-154` 파생값 계산, `TodoApp.tsx:58` 연결 |
| A2-4 | 5회 이상 연속 전환에도 상태 정합 | PASS | `useTodos.ts:42,64,114` — `todosRef.current`가 `commit` 시점에 동기 갱신되어 같은 틱 내 연속 호출도 직전 결과를 기준으로 계산. 카운트는 `todos` 파생값(`useTodos.ts:150-154`)이라 목록과 어긋날 수 없음 |
| A2-5 | 완료 항목 삭제 시 두 카운트 각 1 감소 | PASS | `useTodos.ts:101-106` `removeTodo`가 `completed` 여부와 무관하게 동일 처리, 카운트는 파생값이므로 자동 반영 |
| A2-6 | 저장 실패 시 직전 상태 롤백 + "상태를 저장하지 못했습니다" | PASS | `useTodos.ts:58-68` — `writeTodos` 실패 시 `setTodos`/`todosRef` 갱신을 아예 하지 않아 직전 상태가 유지되고 `saveFailed` 세팅. `TodoApp.tsx:62-70` `<div role="alert" aria-live="assertive">`로 노출. 체크박스가 제어 컴포넌트(`TodoItem.tsx:69`)이므로 DOM 표시도 자동 원복 |

### 기능 3: 마감일 설정 및 정렬

| # | 수용 기준 | 판정 | 근거 |
|---|----------|------|------|
| A3-1 | 등록 시/등록 후 마감일 지정 및 표시 | PASS | 등록 시: `TodoForm.tsx:86-97` `<input type="date">`. 등록 후: `TodoItem.tsx:107-115` + `TodoItem.tsx:43-57` → `onChangeDueDate` → `useTodos.ts:129-148` `setDueDate`. 표시: `TodoItem.tsx:88-92` `formatDueDate` (`date.ts:38-41`) |
| A3-2 | 빠른 순 / 늦은 순 정렬 | PASS | `SortControl.tsx:15-18` `SORT_OPTIONS`, `todoSort.ts:16-20` `dueAsc`/`dueDesc` 분기, `TodoApp.tsx:38-41` `useMemo(sortTodos)` |
| A3-3 | 기한 지난 미완료 항목 구분 표시 | PASS | `date.ts:33-35` `isOverdue`(미완료 && dueDate < today), `TodoItem.tsx:93-97` "기한 지남" **텍스트 배지**, `TodoItem.tsx:61-63` 좌측 경계선 보조 |
| A3-4 | 마감일 없는 항목은 뒤 + 등록순 유지 | PASS | `todoSort.ts:13-15` — 양쪽 null이면 `seq` 오름차순, 한쪽만 null이면 항상 뒤로 밀림 (정렬 기준과 무관) |
| A3-5 | 마감일 동일 시 먼저 등록된 항목이 앞 | PASS | `todoSort.ts:21` `a.seq - b.seq` (정렬 방향 분기 밖에 위치하여 desc에서도 등록순 유지). `seq`는 `useTodos.ts:91`에서 `Math.max(...) + 1`로 단조 증가 |
| A3-6 | 정렬 기준이 새로고침 후 유지 | PASS | `useSortOrder.ts:21-32` 마운트 시 `readSortOrder`, 변경 시 `writeSortOrder`. 키 `todolist.sortOrder.v1` (`storage.ts:5`) |
| A3-7 | 잘못된 날짜 거부 + "올바른 날짜를 입력해 주세요" | PASS (조건부) | `date.ts:10-19` 롤오버 역검증으로 2026-02-30 차단, `todoValidation.ts:29-36` `validateDueDate`, `TodoForm.tsx:38-39,103-105` / `TodoItem.tsx:46-50,125-129` 오류 렌더 + 저장 미실행. **단, 아래 M-1 참조(네이티브 date 피커에서는 오류 문구 도달 경로가 사실상 없음)** |

**Stage 1 소계: 20 / 20 (100%)** — PRD 성공 지표 "수용 기준 20개 중 20개 검증 통과" 충족.

---

## Stage 2: TECH_SPEC 일치 검증 (23.5/24)

### 2-1. 파일 구조 (21개 명세 전량 존재, 누락 0 / 임의 추가 0)

| TECH_SPEC 명세 경로 | 실제 | 판정 |
|--------------------|------|------|
| `src/app/layout.tsx` | 존재 (`lang="ko"` = `layout.tsx:21`) | PASS |
| `src/app/page.tsx` | 존재 (서버 컴포넌트, TodoApp만 렌더 = `page.tsx:1-5`) | PASS |
| `src/app/globals.css` | 존재 (Tailwind 진입 + 색상 토큰 = `globals.css:1,8-18`) | PASS |
| `src/components/TodoApp.tsx` | 존재 (`'use client'` = 1행) | PASS |
| `src/components/TodoForm.tsx` | 존재 | PASS |
| `src/components/TodoSummary.tsx` | 존재 | PASS |
| `src/components/SortControl.tsx` | 존재 | PASS |
| `src/components/TodoList.tsx` | 존재 | PASS |
| `src/components/TodoItem.tsx` | 존재 | PASS |
| `src/hooks/useTodos.ts` | 존재 | PASS |
| `src/hooks/useSortOrder.ts` | 존재 | PASS |
| `src/lib/storage.ts` | 존재 | PASS |
| `src/lib/todoValidation.ts` | 존재 | PASS |
| `src/lib/todoSort.ts` | 존재 | PASS |
| `src/lib/date.ts` | 존재 | PASS |
| `src/types/todo.ts` | 존재 | PASS |
| `next.config.ts` | 존재 (`output: 'export'` = 5행) | PASS |
| `postcss.config.mjs` | 존재 (`@tailwindcss/postcss`) | PASS |
| `tsconfig.json` | 존재 (`strict: true` 7행, `@/*` paths 21-23행) | PASS |
| `eslint.config.mjs` | 존재 (`next/core-web-vitals`, `next/typescript`) | PASS |
| `package.json` | 존재 (next 15.5.4 / react 19.1.1 / tailwind 4.1.13 / typescript 5.9.2 / eslint 9.35.0 — 1장 기술 스택 표와 전부 일치) | PASS |

- **누락 파일: 없음.**
- **스펙 외 추가 소스 파일: 없음.** (`next-env.d.ts`는 Next.js 자동 생성, `.claude/settings.local.json`은 도구 설정으로 산정 제외)
- `public/` 디렉터리는 미생성이나 TECH_SPEC 62행이 "현재 파일 없음"으로 명시했으므로 결함 아님.

### 2-2. 타입 / 상수 / 함수 계약

| TECH_SPEC 명세 | 실제 구현 | 판정 |
|---------------|----------|------|
| `SortOrder`, `Todo`(7필드), `TodoStorePayload` | `types/todo.ts:2,5-20,23-26` — 필드명·타입·주석까지 완전 일치 | PASS |
| `STORAGE_KEYS = { todos: 'todolist.todos.v1', sortOrder: 'todolist.sortOrder.v1' }` | `storage.ts:3-6` 완전 일치 | PASS |
| `StorageErrorCode`, `StorageResult<T>` | `storage.ts:8-12` 완전 일치 | PASS |
| `isStorageAvailable / readTodos / writeTodos / readSortOrder / writeSortOrder` | `storage.ts:22,53,79,90,102` 시그니처 일치. 손상 항목 제외(`storage.ts:30-43,72`) 요구도 구현 | PASS |
| `TITLE_MAX_LENGTH`, `VALIDATION_MESSAGES`(4종), `ValidationResult<T>`, `validateTitle`, `validateDueDate` | `todoValidation.ts:3,5-10,12-14,17,29` — 메시지 문구 4종 모두 PRD 원문과 일치 | PASS |
| `isValidDateString / todayString / isOverdue / formatDueDate` | `date.ts:10,22,33,38` 일치 (todayString은 스펙의 선택 인자 시그니처를 기본값으로 구현) | PASS |
| `sortTodos(todos: readonly Todo[], order: SortOrder): Todo[]` | `todoSort.ts:11-23` — 4개 규칙 및 비변형(`[...todos]`)까지 스펙 예시와 동일 | PASS |
| `UseSortOrderResult`, `useSortOrder()` | `useSortOrder.ts:11-15,17` 일치 | PASS |
| `addTodo(input): boolean` | `useTodos.ts:71-98` 일치. `seq = Math.max(...)+1`(91행), `crypto.randomUUID()`(87행) 규칙 준수 | PASS |
| `removeTodo(id): void` | `useTodos.ts:101-106` 일치 | PASS |
| `setDueDate(id, rawDueDate): boolean` | `useTodos.ts:129-148` 일치 | PASS |
| `toggleTodo(id): void` | `useTodos.ts:112-126` — **시그니처·롤백 계약 유지, 내부 구현 방식은 스펙 예시와 상이 (아래 D-1 상세)** | PASS (변경 타당) |
| 파생 카운트(`totalCount`, `completedCount` useMemo) | `useTodos.ts:150-154` 스펙 예시와 동일 | PASS |
| `TodoFormProps` / `TodoListProps` / `TodoItemProps` / `TodoSummaryProps` / `SortControlProps` | `TodoForm.tsx:14-18`, `TodoList.tsx:17-24`, `TodoItem.tsx:17-23`, `TodoSummary.tsx:3-6`, `SortControl.tsx:10-13` — 5개 인터페이스 모두 필드명·타입 완전 일치 | PASS |
| `SORT_OPTIONS`(라벨 포함) | `SortControl.tsx:15-18` 완전 일치 | PASS |
| 동작규칙: 오류 문구 `role="alert"` + `aria-invalid`/`aria-describedby` (158행) | `TodoForm.tsx:68-76,92-106`, `TodoItem.tsx:112-113,125-129` | PASS |
| 동작규칙: 완료 3중 표시(체크박스·line-through·sr-only) (229행) | `TodoItem.tsx:66-72,76-80,83-85` | PASS |
| 동작규칙: 저장 실패 안내 목록 상단 `role="alert" aria-live="assertive"` (231행) | `TodoApp.tsx:62-70` | PASS |
| 동작규칙: `today` 마운트 1회 계산 후 props 전달 (351행) | `TodoApp.tsx:34,75` | PASS |
| 렌더링 방침: 로드 전 스켈레톤 표시 (74행) | `TodoList.tsx:34-46` (`role="status" aria-busy`) | PASS |
| 정렬은 `TodoApp`에서 `useMemo` (349행) | `TodoApp.tsx:38-41` | PASS |
| 6장 접근성: 명도 대비 팔레트(slate-900/600/500, red-700) | `TodoItem.tsx`, `TodoForm.tsx`, `TodoApp.tsx` 전반에서 명시 팔레트만 사용 | PASS |
| 6장 보안: `fetch`/외부 통신 미포함 | `src/` 전체 grep 결과 `fetch`/`XMLHttpRequest` 0건 | PASS |
| `globals.css` 색상 토큰 정의·활용 | 토큰 정의는 있으나(`globals.css:8-18`) 컴포넌트는 전부 Tailwind 기본 slate/red 유틸리티 사용 → **토큰 미사용(사문화)** | PARTIAL |

### 2-3. 스펙 외 기능 추가 여부

PRD "향후 확장" 항목(카테고리, 우선순위, 내용 수정, 검색/필터, 완료 일괄 정리, 내보내기/가져오기)에 대한 구현·UI·상태·타입 필드가 **전무함**을 전체 파일 대조로 확인. `useTodos`의 공개 API는 `addTodo / removeTodo / toggleTodo / setDueDate` 4종뿐(`useTodos.ts:21-31`)이며, 할 일 제목 편집 경로도 없음. **스펙 위반 없음.**

**Stage 2 소계: 23.5 / 24 (97.9%)**

---

## Stage 3: 코드 품질 검증 (19/20)

| # | 항목 | 판정 | 비고 |
|---|------|------|------|
| 1 | `any` 미사용 | PASS | `src/` 전체 grep 결과 0건 |
| 2 | 타입 단언 남용 없음 | PASS | 총 3곳(`storage.ts:32,48,67`, `SortControl.tsx:31`). 모두 `unknown` 좁히기 또는 `<select>` 값 좁히기 목적. `storage.ts`는 단언 직후 `isTodo`/`isSortOrder` 타입가드로 실제 검증 수행 |
| 3 | `strict: true` 및 경로 별칭 | PASS | `tsconfig.json:7,21-23` |
| 4 | 공개 함수 반환 타입 명시 | PASS | 훅·lib 전 함수에 명시적 반환 타입 부여 |
| 5 | 저장 실패(Quota 등) 처리 | PASS | `storage.ts:82-87` try/catch → `WRITE_FAILED`, `useTodos.ts:59-63` 사용자 안내 |
| 6 | JSON 파싱 실패 처리 | PARTIAL | `storage.ts:62-75`에서 예외를 `PARSE_FAILED`로 변환하고 손상 항목 필터링까지 하나, `useTodos.ts:47`이 실패를 빈 배열로 조용히 흡수 → 이후 첫 저장 시 손상 데이터가 덮어써짐. 사용자 고지 없음 |
| 7 | 잘못된 날짜 처리 | PASS | `date.ts:10-19` 역검증, `todoValidation.ts:32-34` |
| 8 | localStorage 미가용(SSR/프라이빗) 처리 | PASS | `storage.ts:22-28,54,80,91,103` 전 진입점에서 확인 |
| 9 | 예외의 화면 전파 차단 | PASS | 저장소 접근 전부 try/catch로 결과값 변환. 렌더 경로에 throw 없음 |
| 10 | 키보드만으로 전체 조작 | PASS | 등록 `<form>`+`<button type="submit">`(`TodoForm.tsx:51,109-115`), 완료 `<input type="checkbox">`(`TodoItem.tsx:66-72`), 삭제 `<button type="button">`(`TodoItem.tsx:116-123`), 정렬 `<select>`(`SortControl.tsx:28-39`), 마감일 `<input type="date">`. 커스텀 div 클릭 핸들러 0건, 전 인터랙션 요소에 `focus-visible:ring-2` |
| 11 | `role="alert"` 적용 | PASS | `TodoApp.tsx:64`, `TodoForm.tsx:73,103`, `TodoItem.tsx:126` |
| 12 | `aria-live` 적용 | PASS | `TodoApp.tsx:65`(assertive), `TodoSummary.tsx:15`(polite) |
| 13 | `aria-invalid` / `aria-describedby` 연결 | PASS | `TodoForm.tsx:68-69,92-95`, `TodoItem.tsx:112-113` |
| 14 | label ↔ 컨트롤 연결(`useId`) | PASS | `TodoForm.tsx:26-30,58,80`, `TodoItem.tsx:36-38,74,104`, `SortControl.tsx:21,25` |
| 15 | 색상 외 구분 수단 | PASS | 완료: 체크박스 상태 + `line-through` + `sr-only "완료됨/미완료"`(`TodoItem.tsx:83-85`). 기한 지남: 텍스트 배지(`TodoItem.tsx:93-97`) |
| 16 | 반응형(360~1920px) | PASS | `TodoApp.tsx:47` `mx-auto w-full max-w-2xl px-4`, `TodoItem.tsx:61` `flex-col sm:flex-row`, `TodoItem.tsx:76` `break-words`. 고정 px 폭 요소 없음 (`globals.css:23` `overflow-x: hidden`은 M-5 참조) |
| 17 | 명도 대비 4.5:1 이상 | PASS | slate-900/600/500·red-700 조합만 사용. `globals.css:3-7` 주석에 산출 근거 기재 |
| 18 | `console.*` / TODO / FIXME 잔존 없음 | PASS | `src/` 전체 grep 0건 |
| 19 | 하드코딩 문자열·매직 넘버 상수화 | PASS | 문구는 `LABELS`/`MESSAGES`/`TEXTS`/`VALIDATION_MESSAGES`로 분리, 숫자는 `SEQ_BASE`·`SEQ_STEP`·`PAD_LENGTH`·`SKELETON_ROW_COUNT`·`STORE_VERSION` 등으로 명명 |
| 20 | 중복 로직 없음 / 단일 책임 | PARTIAL | 컴포넌트 책임 분리는 양호하나 검증이 UI와 훅에서 이중 수행되어 훅 내부에 도달 불가 분기 발생 (M-2 참조) |

**Stage 3 소계: 19 / 20 (95.0%)**

---

## 불일치·미흡 항목 상세

### D-1. `useTodos.toggleTodo` 구현 방식 변경 (심각도: 없음 — 타당한 변경으로 판정)

- **스펙**: TECH_SPEC 202-217행 — `setTodos((prev) => { ... writeTodos(next); if (!saved.ok) { setErrorMessage(...); return prev; } ... })`
- **실제**: `useTodos.ts:42`(`todosRef`) + `useTodos.ts:58-68`(`commit`) + `useTodos.ts:112-126`(`toggleTodo`)
- **검증 결과**: 보고된 변경이 실재함을 코드로 확인. 계약 유지 여부는 다음과 같이 모두 충족.
  - 시그니처: `toggleTodo: (id: string) => void` — `useTodos.ts:29,113` 스펙과 동일.
  - A2-6 롤백: 스펙은 "저장 후 실패 시 `prev` 반환"으로 되돌리고, 구현은 "저장 성공 시에만 상태 반영"(`useTodos.ts:59-66`). 사용자가 관측하는 결과(변경 직전 상태 유지 + `saveFailed` 안내)는 동일하며, 실패 시 중간 상태가 렌더되지 않으므로 오히려 더 엄격함.
  - A2-4 정합성: `todosRef.current`가 `commit` 내에서 `setTodos`와 함께 동기 갱신(`useTodos.ts:64-65`)되어 같은 틱의 연속 토글도 직전 결과 기준으로 계산됨. 카운트는 여전히 파생값이라 목록과 어긋날 수 없음.
- **변경의 타당성**: 스펙 예시 코드는 `setTodos` 업데이터(순수해야 하는 함수) 안에서 `writeTodos`(부수효과)와 `setErrorMessage`(다른 setState)를 호출하는 React 안티패턴이다. `next.config.ts:6`에서 `reactStrictMode: true`가 켜져 있어 개발 모드에서 업데이터가 2회 호출되면 `localStorage` 쓰기도 2회 발생한다. `commit` 방식은 부수효과를 업데이터 밖으로 빼내 이 문제를 제거하면서 계약을 보존한다. **감점하지 않음. 다만 TECH_SPEC 202-217행 예시 코드를 실제 구현에 맞춰 갱신할 것을 권고한다(문서-코드 동기화).**

### M-1. A3-7 오류 문구가 네이티브 date 입력에서는 도달 불가 (심각도: Minor)

- **스펙**: PRD 61행 — "존재하지 않는 날짜(예: 2월 30일)나 형식에 맞지 않는 날짜는 저장되지 않으며, 오류 안내가 표시된다."
- **실제**: 검증 로직(`date.ts:10-19`, `todoValidation.ts:29-36`)과 오류 렌더(`TodoForm.tsx:103-105`, `TodoItem.tsx:125-129`)는 모두 구현되어 있고 TECH_SPEC 348행의 설계와 일치한다. 그러나 입력 요소가 `<input type="date">`(`TodoForm.tsx:88`, `TodoItem.tsx:109`)이므로, 지원 브라우저에서 사용자가 2026-02-30을 입력하면 `event.target.value`가 `''`로 전달된다.
- **차이**: "저장되지 않는다"는 100% 보장되지만, "오류 안내가 표시된다"는 타입 미지원 브라우저 폴백 상황에서만 관측 가능하다. 더 나아가 `TodoItem.tsx:43-57`에서 값 `''`은 `validateDueDate` 상 정상(`null`)이므로, 이미 지정된 마감일이 조용히 해제된다.
- **개선 제안**: (1) `TodoItem.handleDueDateChange`에서 값이 `''`이고 기존 `todo.dueDate`가 존재할 때는 "마감일 해제" 의도임을 확인 가능한 UI(별도 "마감일 지우기" 버튼)로 분리, (2) `<input type="date">`에 `onInvalid`/`validity.badInput` 검사를 덧붙여 브라우저가 거부한 입력에도 동일 문구를 노출. 예상 수정 범위: `TodoItem.tsx` 1개 파일, 약 15줄.

### M-2. 검증 이중 수행으로 인한 도달 불가 분기 (심각도: Minor)

- **스펙**: TECH_SPEC 143-144행 — `addTodo`는 "검증 통과 시 ... 실패 시 errorMessage를 세팅하고 false".
- **실제**: `TodoForm.tsx:35-41`이 이미 `validateTitle`/`validateDueDate`를 수행한 뒤 검증 통과 값만 `onSubmit`에 전달하므로, `useTodos.ts:73-82`의 실패 분기는 폼 경유 경로에서 절대 실행되지 않는다. 동일하게 `TodoItem.tsx:46-51`이 선검증하므로 `useTodos.ts:131-135`의 실패 분기도 도달 불가.
- **차이**: 기능 결함은 아니며 훅의 방어적 계약으로서는 정당하나, 오류 메시지가 두 위치(폼 하단 vs `TodoApp.tsx:62-70` 상단 배너)에서 표시될 수 있는 구조라 유지보수 시 혼동 소지가 있다.
- **개선 제안**: 훅의 검증 실패 분기를 유지하되 주석으로 "UI 우회 호출 대비 방어 로직"임을 명시하거나, 폼의 선검증을 제거하고 훅의 `errorMessage`를 폼 하단에 연결해 표시 지점을 일원화. 예상 수정 범위: `TodoForm.tsx` + `useTodos.ts`, 약 20줄.

### M-3. 저장소 파싱 실패가 사용자에게 고지되지 않음 (심각도: Minor)

- **스펙**: TECH_SPEC 425-436행 — `readTodos`는 파싱 실패를 `PARSE_FAILED`로 반환하고 손상 항목을 제외한다(구현 충족). 실패 후 처리에 대한 규정은 없음.
- **실제**: `useTodos.ts:45-49`가 `loaded.ok ? loaded.value : []`로 실패를 빈 목록으로 흡수한다. 이후 사용자가 항목을 1건이라도 추가하면 `commit` → `writeTodos`가 손상 데이터를 덮어써 복구 가능성이 사라진다.
- **개선 제안**: `PARSE_FAILED` 시 "저장된 목록을 불러오지 못했습니다" 안내를 `errorMessage`로 노출하고, 덮어쓰기 전 원본을 `todolist.todos.v1.backup` 키로 이관. 예상 수정 범위: `useTodos.ts` + `storage.ts`, 약 20줄.

### M-4. `globals.css` 색상 토큰 사문화 (심각도: Minor)

- **스펙**: TECH_SPEC 44행 — "globals.css # Tailwind 진입점 + 명도 대비 색상 토큰".
- **실제**: `globals.css:8-18`에 `--color-surface`, `--color-text-primary` 등 6개 토큰이 정의되어 있으나, 전 컴포넌트가 `text-slate-900`, `text-red-700` 등 Tailwind 기본 유틸리티만 사용한다(`--color-page`와 동일 값인 `bg-slate-50`이 `layout.tsx:22`에 하드코딩). 실제로 참조되는 토큰은 `--font-sans` 하나뿐이다.
- **차이**: 기능·접근성 영향 없음. 다만 TECH_SPEC 6장 접근성 표(466행)가 slate 팔레트를 직접 명시하고 있어 두 방식이 문서 내에서도 병존한다. 팔레트 변경 시 두 곳을 모두 손봐야 하는 이중 관리 위험.
- **개선 제안**: 미사용 토큰 5개를 제거하거나, 반대로 컴포넌트를 `text-text-primary` 등 토큰 기반 유틸리티로 통일. 예상 수정 범위: `globals.css` 1개 파일(제거 선택 시 약 6줄).

### M-5. `html { overflow-x: hidden }` 사용 (심각도: Minor)

- **스펙**: PRD 80행 — "360~1920px에서 가로 스크롤 없이 목록 전체 확인".
- **실제**: `globals.css:22-24`에서 전역으로 가로 오버플로를 숨긴다. 레이아웃 자체(`max-w-2xl px-4`, `flex-col sm:flex-row`, `break-words`)가 이미 요건을 충족하므로 이 선언 없이도 통과 가능하며, 오히려 향후 넘침 결함을 시각적으로 은폐한다. 일부 브라우저에서 `html`에 지정 시 `position: sticky` 동작에 영향을 줄 수 있다.
- **개선 제안**: 선언을 제거하고 360px 실측으로 검증. 예상 수정 범위: `globals.css` 3줄.

### M-6. 마감일 저장 실패 시 입력값 잔류 (심각도: Minor)

- **스펙**: PRD 47행(A2-6)은 "상태 변경" 저장 실패만 규정하므로 스펙 위반은 아님.
- **실제**: `TodoItem.tsx:54-56` — `onChangeDueDate`가 `false`(저장 실패)를 반환하면 `draftDueDate`가 초기화되지 않아, date 입력란에는 시도한 값이 남고 상단 표시 텍스트(`TodoItem.tsx:88-92`)에는 이전 마감일이 남는 불일치가 생긴다. 상단 배너에는 `saveFailed`가 표시된다.
- **개선 제안**: 실패 시에도 `setDraftDueDate(null)`로 되돌려 화면 전체를 저장된 상태로 통일. 예상 수정 범위: `TodoItem.tsx` 3줄.

---

## 잘 구현된 부분

- **파일 구조 21/21 완전 일치, 스펙 외 기능 0건.** PRD "향후 확장" 항목(카테고리·우선순위·검색·내용 수정)이 단 한 줄도 선반영되지 않아 MVP 범위 통제가 정확하다.
- **인터페이스 계약 무결.** Props 5종, 저장소 함수 7종, 검증/날짜/정렬 함수 7종의 이름·인자·반환 타입이 TECH_SPEC과 문자 단위로 일치한다.
- **카운트 파생 계산(`useTodos.ts:150-154`)** 으로 A2-3·A2-4·A2-5의 상태 불일치 가능성을 구조적으로 제거했다.
- **접근성 구현 수준이 높다.** `useId` 기반 label 연결, `role="alert"` 3종 배치, `aria-live` 구분(assertive/polite), 삭제 버튼의 `sr-only` 항목명 부여(`TodoItem.tsx:122`)로 스크린리더에서 버튼 이름이 중복되지 않는다. 이는 TECH_SPEC이 명시하지 않은 개선 사항이다.
- **`toggleTodo`의 `commit` 리팩터링(D-1)** 은 스펙 예시의 React 안티패턴을 제거하면서 계약을 보존한 판단으로, 문서보다 구현이 앞선 사례다.
- **하드코딩 통제.** 모든 사용자 문구가 상수 객체로 분리되어 있고 매직 넘버가 명명 상수화되어 있다. `console.*`, TODO 주석 잔존 0건.

---

## 개선 권고사항 (우선순위 순)

### 우선순위 높음 (PRD 관련)
1. **M-1** — `TodoItem`에서 date 입력이 빈 값으로 바뀔 때 기존 마감일이 조용히 해제되는 경로를 명시적 "마감일 지우기" 조작으로 분리하고, `validity.badInput` 검사를 추가해 A3-7 오류 문구의 실제 도달 경로를 확보한다.

### 우선순위 중간 (TECH_SPEC 동기화)
2. **D-1** — TECH_SPEC 202-217행의 `toggleTodo` 예시 코드를 실제 `todosRef` + `commit` 구현으로 갱신한다. (코드 수정 아님, 문서 갱신)
3. **M-3** — `readTodos`가 `PARSE_FAILED`를 반환한 경우 사용자 고지 + 원본 백업 키 이관을 추가한다.
4. **M-2** — 검증 표시 지점을 폼 하단 또는 상단 배너 중 하나로 일원화하고, 훅의 방어 분기에는 의도를 주석으로 남긴다.

### 우선순위 낮음 (품질 개선)
5. **M-6** — 마감일 저장 실패 시 `draftDueDate`를 초기화해 화면 상태를 일관되게 되돌린다.
6. **M-4** — `globals.css`의 미사용 색상 토큰 5개를 제거하거나 컴포넌트를 토큰 기반으로 통일한다.
7. **M-5** — `html { overflow-x: hidden }`을 제거하고 360px 실측으로 레이아웃을 검증한다.
8. **테스트 자산 부재** — 현재 저장소에 자동화 테스트가 없다. `sortTodos`(4개 규칙), `isValidDateString`(2/30, 윤년), `validateTitle`(0자/100자/101자) 3개 순수 함수는 부수효과가 없어 단위 테스트 비용이 매우 낮으므로 회귀 방지 차원에서 우선 도입을 권고한다.

---

## 검증 한계 (실행 미수행 항목)

본 검증은 정적 코드 대조로 수행했으며, 다음 항목은 런타임 실행이 필요하다.

| 항목 | 권장 검증 방법 |
|------|--------------|
| A1-5 / A3-6 새로고침 후 유지 | 브라우저에서 등록 후 F5, DevTools > Application > Local Storage에서 `todolist.todos.v1` / `todolist.sortOrder.v1` 확인 |
| A2-6 저장 실패 롤백 | DevTools 콘솔에서 `localStorage.setItem`을 throw로 몽키패치한 뒤 토글 → 체크 해제 유지 + "상태를 저장하지 못했습니다" 노출 확인 |
| 비기능 성능 (100건 정렬 1초 이내) | 100건 시드 후 Performance 패널로 정렬 변경 프레임 측정 |
| 명도 대비 4.5:1 | Lighthouse / axe DevTools 실측 (코드상 팔레트는 요건 충족) |
| 360px 가로 스크롤 | 반응형 모드 360px에서 `document.documentElement.scrollWidth` 확인 (M-5 제거 후) |
| 빌드 무결성 | `npm run build`(정적 export) 및 `npm run lint` 통과 여부 |
