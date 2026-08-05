# TECH_SPEC: todolist

> PRD 참조: `claudedocs/PRD.md`
> 대상 범위: MVP 기능 3개 (할 일 등록·삭제 / 완료 체크 / 마감일 설정·정렬)
> PRD에 정의되지 않은 기능은 본 명세에 포함하지 않는다.

---

## 1. 기술 스택

| 구분 | 기술 | 버전 | 선정 근거 |
|------|------|------|----------|
| Framework | Next.js (App Router) | 15+ | `create-next-app` 한 번으로 TypeScript·번들러·개발 서버 셋업 완료. 서버가 필요 없으므로 `output: 'export'` 정적 빌드로 산출물을 정적 호스팅에 그대로 올린다. |
| Language | TypeScript | 5.x | `Todo` 모델과 정렬·검증 함수의 계약을 컴파일 타임에 고정. 수용 기준의 상태 불일치(예: 토글 어긋남)를 타입 단계에서 예방. |
| Runtime | React | 19+ | Next.js 15 기본 동봉. 상태 3종(목록/정렬/오류)만 다루므로 추가 런타임 불필요. |
| Styling | Tailwind CSS | 4.x | 유틸리티 클래스로 반응형(360~1920px)과 명도 대비 팔레트를 마크업에서 즉시 통제. 별도 CSS 파일 관리 비용 없음. |
| State | React hooks (`useState` / `useMemo` / `useEffect`) + 커스텀 훅 | - | 단일 화면·단일 사용자·전역 공유 없음. Redux/Zustand 등 상태 라이브러리는 오버엔지니어링. |
| Storage | Web Storage API (`localStorage`) | - | PRD 제약 "서버·DB 없이 기기 내부 저장만". 동기 API라 1초 이내 반영 요건 충족이 쉽고, 새로고침 후에도 데이터가 유지된다. |
| ID 생성 | `crypto.randomUUID()` | 브라우저 내장 | 동일 내용 항목을 별개로 식별해야 하는 수용 기준(A1-4) 충족. 외부 라이브러리 불필요. |
| Lint | ESLint (`eslint-config-next`) | 9.x | 프로젝트 생성 시 기본 포함. 추가 설정 없음. |

### 도입하지 않는 기술과 이유

| 미도입 항목 | 이유 |
|------------|------|
| API Routes / 서버 액션 | 데이터가 브라우저 밖으로 나가지 않는다(PRD 보안 요구). 서버 왕복 경로 자체를 만들지 않는다. |
| 데이터베이스 / ORM | 저장소는 `localStorage` 단일. 스키마 마이그레이션 도구 불필요. |
| 인증 라이브러리 | 계정·로그인 없음(PRD 보안 요구). |
| 상태 관리 라이브러리 | 상태 트리 깊이 1단계. 커스텀 훅 2개로 충분. |
| UI 컴포넌트 라이브러리(shadcn/ui 등) | 필요한 UI가 입력창·체크박스·버튼·셀렉트 4종. 네이티브 요소가 키보드 접근성을 기본 제공하므로 의존성을 늘리지 않는다. |
| 날짜 라이브러리(date-fns, dayjs) | 다루는 형식이 `YYYY-MM-DD` 단일. 표준 `Date`로 검증·비교 가능. |
| i18n 라이브러리 | 한국어 단일 언어(PRD 비즈니스 제약). |

---

## 2. 프로젝트 구조

```
todolist/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # 루트 레이아웃, lang="ko", 전역 폰트/색상 토큰
│   │   ├── page.tsx                # 메인 페이지(서버 컴포넌트). TodoApp만 렌더
│   │   └── globals.css             # Tailwind 진입점 + 명도 대비 색상 토큰
│   ├── components/
│   │   ├── TodoApp.tsx             # 'use client'. 훅 연결 및 하위 컴포넌트 조립
│   │   ├── TodoForm.tsx            # 할 일 내용 + 마감일 입력, 등록 (기능 1, 3)
│   │   ├── TodoSummary.tsx         # "완료 N / 전체 M" 카운트 (기능 2)
│   │   ├── SortControl.tsx         # 정렬 기준 선택 UI (기능 3)
│   │   ├── TodoList.tsx            # 목록 렌더, 빈 상태 안내 문구 (기능 1)
│   │   └── TodoItem.tsx            # 개별 항목: 완료 토글 / 마감일 / 삭제 (기능 1, 2, 3)
│   ├── hooks/
│   │   ├── useTodos.ts             # 할 일 CRUD + 저장 + 실패 롤백
│   │   └── useSortOrder.ts         # 정렬 기준 상태 + 저장/복원
│   ├── lib/
│   │   ├── storage.ts              # localStorage 읽기/쓰기 래퍼, 실패를 결과값으로 반환
│   │   ├── todoValidation.ts       # 내용/마감일 검증 및 오류 메시지 상수
│   │   ├── todoSort.ts             # 마감일 기준 정렬 규칙
│   │   └── date.ts                 # YYYY-MM-DD 검증, 오늘 날짜, 기한 초과 판정, 표시 포맷
│   └── types/
│       └── todo.ts                 # Todo, SortOrder, 저장 스키마 타입
├── public/                         # 정적 자산(현재 파일 없음)
├── next.config.ts                  # output: 'export' 정적 빌드 설정
├── postcss.config.mjs              # @tailwindcss/postcss
├── tsconfig.json                   # strict: true, paths: { "@/*": ["./src/*"] }
├── eslint.config.mjs
└── package.json
```

**소스 파일 16개 + 설정 파일 5개 = 21개**

### 렌더링 방침
- `src/app/page.tsx`는 서버 컴포넌트로 두고, `localStorage`에 접근하는 `TodoApp` 이하만 `'use client'`로 지정한다.
- 서버 렌더 시점에는 `localStorage`가 없으므로 초기 상태는 빈 목록이며, `useEffect`에서 1회 로드한 뒤 `isLoaded`를 `true`로 전환한다. 로드 전에는 목록 영역에 스켈레톤을 표시해 하이드레이션 불일치를 방지한다.

---

## 3. 구현 명세

### 기능 1: 할 일 등록 및 삭제 → 구현 명세

> PRD 매핑: 기능 1 — "떠오른 할 일을 목록에 등록하고 더 이상 필요 없는 항목을 삭제하고 싶다"

**파일**
- `src/components/TodoForm.tsx` — 등록 입력 폼
- `src/components/TodoList.tsx` — 목록 및 빈 상태 안내
- `src/components/TodoItem.tsx` — 삭제 버튼
- `src/hooks/useTodos.ts` — `addTodo` / `removeTodo`
- `src/lib/todoValidation.ts` — 내용 검증
- `src/lib/storage.ts` — 영속화

**Props 인터페이스**

```typescript
// src/components/TodoForm.tsx
export interface TodoFormProps {
  /** 등록 성공 시 true, 검증 실패 시 false를 반환한다. */
  onSubmit: (input: { title: string; dueDate: string | null }) => boolean;
  disabled: boolean;
}

// src/components/TodoList.tsx
export interface TodoListProps {
  todos: Todo[];          // 이미 정렬이 끝난 배열
  isLoaded: boolean;
  today: string;          // 'YYYY-MM-DD'
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onChangeDueDate: (id: string, dueDate: string | null) => boolean;
}

// src/components/TodoItem.tsx
export interface TodoItemProps {
  todo: Todo;
  today: string;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onChangeDueDate: (id: string, dueDate: string | null) => boolean;
}
```

**핵심 함수**

```typescript
// src/lib/todoValidation.ts
export const TITLE_MAX_LENGTH = 100;

export const VALIDATION_MESSAGES = {
  emptyTitle: '할 일 내용을 입력해 주세요',
  tooLongTitle: '최대 100자까지 입력할 수 있습니다',
  invalidDueDate: '올바른 날짜를 입력해 주세요',
  saveFailed: '상태를 저장하지 못했습니다',
} as const;

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

/** 앞뒤 공백 제거 후 1~100자인지 검사한다. 통과 시 trim된 문자열을 반환. */
export function validateTitle(raw: string): ValidationResult<string>;

// src/hooks/useTodos.ts
/** 검증 통과 시 목록 맨 뒤에 추가하고 저장한 뒤 true, 실패 시 errorMessage를 세팅하고 false. */
function addTodo(input: { title: string; dueDate: string | null }): boolean;

/** id가 일치하는 항목 1건만 제거하고 저장한다. 나머지 항목의 필드는 재생성하지 않는다. */
function removeTodo(id: string): void;

// src/lib/storage.ts
export function readTodos(): StorageResult<Todo[]>;
export function writeTodos(todos: Todo[]): StorageResult<Todo[]>;
```

**동작 규칙**
- `addTodo`는 `crypto.randomUUID()`로 `id`를, `Math.max(...todos.map(t => t.seq), 0) + 1`로 `seq`를 부여한다. 동일 내용이어도 `id`가 다르므로 개별 항목으로 존재한다.
- `removeTodo`는 `todos.filter(t => t.id !== id)`로만 처리해 다른 항목의 `title`·`completed`·`dueDate`를 건드리지 않는다.
- `TodoForm`은 `onSubmit`이 `true`를 반환할 때만 내용·마감일 입력값을 초기화한다.
- 오류 메시지는 입력란 하단 `<p role="alert">`에 렌더하고, 입력란에 `aria-invalid` / `aria-describedby`를 연결한다.
- 100자 초과는 `maxLength`로 막지 않고 `validateTitle`에서 검사한다. 붙여넣기로 초과 입력된 경우에도 안내 문구가 뜨도록 하기 위함이다.

**수용 기준 매핑**

| PRD 수용 기준 | 구현 방법 |
|--------------|----------|
| A1-1 1~100자 등록 시 목록 즉시 추가 + 입력란 초기화 | `TodoForm.handleSubmit` → `validateTitle` 통과 → `addTodo` → `true` 반환 시 `setTitle('')`, `setDueDate('')`. 상태 갱신은 동기이므로 즉시 리렌더 |
| A1-2 특정 항목만 삭제, 나머지 불변 | `useTodos.removeTodo`의 `filter` 처리. 항목 객체 참조를 그대로 유지 |
| A1-3 0개일 때 안내 문구 | `TodoList`에서 `todos.length === 0 && isLoaded` 시 `<p>등록된 할 일이 없습니다</p>` 렌더 |
| A1-4 동일 내용 중복 등록 허용, 개별 삭제 | `id`를 `crypto.randomUUID()`로 생성하고 `key={todo.id}`로 렌더. 내용 기반 중복 제거 로직 없음 |
| A1-5 새로고침·재방문 후에도 결과 유지 | 모든 변경 함수가 `writeTodos`로 `todolist.todos.v1`에 저장, 최초 마운트 시 `readTodos`로 복원 |
| A1-6 빈 값/공백만 입력 시 오류 안내 | `validateTitle`이 `raw.trim().length === 0`이면 `VALIDATION_MESSAGES.emptyTitle` 반환 |
| A1-7 100자 초과 시 오류 안내 | `validateTitle`이 `trimmed.length > TITLE_MAX_LENGTH`이면 `VALIDATION_MESSAGES.tooLongTitle` 반환 |

---

### 기능 2: 완료 체크 및 상태 변경 → 구현 명세

> PRD 매핑: 기능 2 — "끝낸 할 일을 완료로 표시하고 필요하면 다시 미완료로 되돌리고 싶다"

**파일**
- `src/components/TodoItem.tsx` — 완료 체크박스, 취소선 표시
- `src/components/TodoSummary.tsx` — "완료 N / 전체 M"
- `src/hooks/useTodos.ts` — `toggleTodo`, 카운트 파생값, 저장 실패 롤백

**Props 인터페이스**

```typescript
// src/components/TodoSummary.tsx
export interface TodoSummaryProps {
  completedCount: number;
  totalCount: number;
}
```

**핵심 함수**

```typescript
// src/hooks/useTodos.ts
/**
 * id 항목의 completed를 반전하고 즉시 저장한다.
 * 저장 실패 시 이전 배열(prev)로 상태를 되돌리고 errorMessage에 saveFailed를 세팅한다.
 */
function toggleTodo(id: string): void {
  setTodos((prev) => {
    const next = prev.map((todo) =>
      todo.id === id
        ? { ...todo, completed: !todo.completed, updatedAt: new Date().toISOString() }
        : todo
    );
    const saved = writeTodos(next);
    if (!saved.ok) {
      setErrorMessage(VALIDATION_MESSAGES.saveFailed);
      return prev; // 변경 직전 상태로 롤백
    }
    setErrorMessage(null);
    return next;
  });
}

// 카운트는 별도 상태로 두지 않고 파생값으로 계산해 목록과 항상 일치시킨다.
const totalCount = todos.length;
const completedCount = useMemo(
  () => todos.filter((todo) => todo.completed).length,
  [todos]
);
```

**동작 규칙**
- 체크박스는 네이티브 `<input type="checkbox">`를 사용하고 `checked={todo.completed}` + `onChange={() => onToggle(todo.id)}`로 제어 컴포넌트로 둔다. Tab 이동 및 Space 토글이 기본 지원된다.
- 완료 표시는 3중으로 한다: (1) 체크박스 `checked` 상태, (2) 제목에 `line-through` 클래스, (3) `<span className="sr-only">완료됨</span>` 텍스트. 색상 변화는 보조 수단이며 단독 근거로 쓰지 않는다.
- 카운트를 별도 `useState`로 두지 않으므로 연속 토글 시에도 목록과 카운트가 어긋날 수 없다.
- 저장 실패 안내는 목록 상단 `<div role="alert" aria-live="assertive">`에 렌더한다.

**수용 기준 매핑**

| PRD 수용 기준 | 구현 방법 |
|--------------|----------|
| A2-1 완료 선택 시 상태 변경 + 취소선 등 시각 구분 | `toggleTodo` 호출 후 `TodoItem`이 `todo.completed`에 따라 `line-through text-slate-500` 적용 |
| A2-2 다시 선택 시 미완료 복귀 | `!todo.completed` 반전 로직. 별도 분기 없음 |
| A2-3 "완료 N / 전체 M" 표시 및 실시간 갱신 | `TodoSummary`가 `completedCount`/`totalCount` 파생값을 렌더. `aria-live="polite"`로 변경 사항 안내 |
| A2-4 5회 이상 연속 전환에도 상태 정합 | `setTodos`의 함수형 업데이트로 최신 상태 기준 반전 + 카운트 파생 계산 |
| A2-5 완료 항목 삭제 시 두 카운트 각각 1 감소 | `removeTodo`가 완료 여부와 무관하게 동일 처리, 카운트는 파생값이므로 자동 반영 |
| A2-6 저장 실패 시 직전 상태 롤백 + 오류 안내 | `writeTodos` 결과가 `ok: false`이면 `return prev` + `saveFailed` 메시지 |

---

### 기능 3: 마감일 설정 및 정렬 → 구현 명세

> PRD 매핑: 기능 3 — "할 일에 마감일을 지정하고 마감일 순서로 목록을 정렬해서 보고 싶다"

**파일**
- `src/components/TodoForm.tsx` — 등록 시 마감일 입력
- `src/components/TodoItem.tsx` — 등록 후 마감일 변경, 마감일 표시, "기한 지남" 배지
- `src/components/SortControl.tsx` — 정렬 기준 선택
- `src/hooks/useSortOrder.ts` — 정렬 기준 상태/영속화
- `src/lib/todoSort.ts` — 정렬 규칙
- `src/lib/date.ts` — 날짜 검증·비교·표시

**Props 인터페이스**

```typescript
// src/components/SortControl.tsx
export interface SortControlProps {
  value: SortOrder;
  onChange: (value: SortOrder) => void;
}

export const SORT_OPTIONS: ReadonlyArray<{ value: SortOrder; label: string }> = [
  { value: 'dueAsc', label: '마감일 빠른 순' },
  { value: 'dueDesc', label: '마감일 늦은 순' },
];
```

**핵심 함수**

```typescript
// src/lib/date.ts
/** 'YYYY-MM-DD' 형식이며 실제 존재하는 날짜인지 검사한다. 2026-02-30은 false. */
export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  ); // Date의 자동 롤오버(2/30 → 3/2)를 역검증으로 차단
}

/** 로컬 타임존 기준 오늘 날짜를 'YYYY-MM-DD'로 반환한다. */
export function todayString(date?: Date): string;

/** 미완료 + 마감일이 오늘보다 이전이면 true. */
export function isOverdue(todo: Todo, today: string): boolean {
  return !todo.completed && todo.dueDate !== null && todo.dueDate < today;
} // 'YYYY-MM-DD'는 사전순 비교가 날짜순 비교와 일치

/** '2026-08-06' → '2026년 8월 6일' */
export function formatDueDate(dueDate: string): string;

// src/lib/todoValidation.ts
/** 빈 문자열은 '마감일 없음'(null)으로 허용, 형식/실재하지 않는 날짜는 오류. */
export function validateDueDate(raw: string): ValidationResult<string | null> {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: null };
  if (!isValidDateString(trimmed)) {
    return { ok: false, message: VALIDATION_MESSAGES.invalidDueDate };
  }
  return { ok: true, value: trimmed };
}

// src/lib/todoSort.ts
/**
 * 정렬 규칙
 *  1) 마감일이 있는 항목이 없는 항목보다 항상 앞
 *  2) 마감일 있는 항목끼리: dueAsc는 오름차순, dueDesc는 내림차순
 *  3) 마감일이 같으면 seq 오름차순(먼저 등록된 항목이 앞)
 *  4) 마감일이 없는 항목끼리: 정렬 기준과 무관하게 seq 오름차순
 * 원본 배열을 변형하지 않고 새 배열을 반환한다.
 */
export function sortTodos(todos: readonly Todo[], order: SortOrder): Todo[] {
  return [...todos].sort((a, b) => {
    if (a.dueDate === null && b.dueDate === null) return a.seq - b.seq;
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    if (a.dueDate !== b.dueDate) {
      return order === 'dueAsc'
        ? a.dueDate.localeCompare(b.dueDate)
        : b.dueDate.localeCompare(a.dueDate);
    }
    return a.seq - b.seq;
  });
}

// src/hooks/useSortOrder.ts
export interface UseSortOrderResult {
  sortOrder: SortOrder;
  setSortOrder: (order: SortOrder) => void;
  isLoaded: boolean;
}
export function useSortOrder(): UseSortOrderResult;

// src/hooks/useTodos.ts
/** 등록 후 마감일 변경. 검증 실패 시 false와 함께 errorMessage 세팅. */
function setDueDate(id: string, rawDueDate: string): boolean;
```

**동작 규칙**
- 마감일 입력은 `<input type="date">`를 사용한다. 값 형식이 `YYYY-MM-DD`로 고정되고, 브라우저 기본 날짜 피커가 키보드로 조작 가능하다. 타입 미지원 브라우저에서 텍스트로 폴백되어도 `validateDueDate`가 동일하게 검증한다.
- 정렬은 `TodoApp`에서 `useMemo(() => sortTodos(todos, sortOrder), [todos, sortOrder])`로 계산한다. 100건 정렬은 단일 `Array.prototype.sort` 1회로 끝난다.
- "기한 지남" 배지는 `isOverdue`가 true일 때 `<span>기한 지남</span>` 텍스트 배지 + 좌측 경계선으로 표시한다. 색상 단독 구분이 아니다.
- `today`는 `TodoApp`에서 마운트 시 1회 계산해 props로 내려보내, 항목마다 `new Date()`를 만들지 않는다.

**수용 기준 매핑**

| PRD 수용 기준 | 구현 방법 |
|--------------|----------|
| A3-1 등록 시/등록 후 마감일 지정 및 표시 | `TodoForm`의 `<input type="date">`로 등록 시 지정, `TodoItem`의 `<input type="date">` + `setDueDate(id, value)`로 등록 후 변경. 표시는 `formatDueDate` |
| A3-2 빠른 순/늦은 순 정렬 | `SortControl`에서 `dueAsc`/`dueDesc` 선택 → `sortTodos`의 2번 규칙 |
| A3-3 오늘 이전 마감 + 미완료 항목 "기한 지남" 구분 | `isOverdue(todo, today)` → 텍스트 배지 렌더 |
| A3-4 마감일 없는 항목은 뒤 배치 + 등록 순서 유지 | `sortTodos`의 1번, 4번 규칙 (`dueDate === null` → 뒤, `seq` 오름차순) |
| A3-5 마감일 동일 시 먼저 등록된 항목이 앞 | `sortTodos`의 3번 규칙 (`a.seq - b.seq`, 정렬 방향과 무관) |
| A3-6 정렬 기준이 새로고침 후에도 유지 | `useSortOrder`가 `todolist.sortOrder.v1` 키로 저장/복원 |
| A3-7 존재하지 않는/형식 오류 날짜 거부 + 오류 안내 | `validateDueDate` → `isValidDateString`의 롤오버 역검증. 실패 시 `invalidDueDate` 메시지, 저장 미실행 |

---

## 4. 데이터 모델

```typescript
// src/types/todo.ts

/** 정렬 기준 */
export type SortOrder = 'dueAsc' | 'dueDesc';

/** 할 일 단일 항목 */
export interface Todo {
  /** crypto.randomUUID()로 생성한 고유 식별자 */
  id: string;
  /** 할 일 내용. trim 결과 1~100자 */
  title: string;
  /** 완료 여부 */
  completed: boolean;
  /** 마감일. 'YYYY-MM-DD' 또는 미지정 시 null */
  dueDate: string | null;
  /** 등록 순서. 정렬 동점 처리 기준. 1부터 단조 증가 */
  seq: number;
  /** 등록 시각 (ISO 8601) */
  createdAt: string;
  /** 최종 수정 시각 (ISO 8601) */
  updatedAt: string;
}

/** localStorage 저장 스키마 */
export interface TodoStorePayload {
  version: 1;
  todos: Todo[];
}
```

**저장소 키**

| 키 | 값 | 용도 |
|----|----|------|
| `todolist.todos.v1` | `JSON.stringify(TodoStorePayload)` | 할 일 목록 (A1-5) |
| `todolist.sortOrder.v1` | `'dueAsc' \| 'dueDesc'` | 정렬 기준 (A3-6) |

**저장소 접근 계약**

```typescript
// src/lib/storage.ts
export const STORAGE_KEYS = {
  todos: 'todolist.todos.v1',
  sortOrder: 'todolist.sortOrder.v1',
} as const;

export type StorageErrorCode = 'UNAVAILABLE' | 'PARSE_FAILED' | 'WRITE_FAILED';

export type StorageResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: StorageErrorCode };

/** SSR·프라이빗 모드 등에서 localStorage 사용 가능 여부를 확인한다. */
export function isStorageAvailable(): boolean;

/** 파싱 실패 시 예외를 던지지 않고 PARSE_FAILED를 반환한다. */
export function readTodos(): StorageResult<Todo[]>;

/** 용량 초과(QuotaExceededError) 등 쓰기 실패를 WRITE_FAILED로 변환한다. */
export function writeTodos(todos: Todo[]): StorageResult<Todo[]>;

export function readSortOrder(): StorageResult<SortOrder>;
export function writeSortOrder(order: SortOrder): StorageResult<SortOrder>;
```

- 모든 저장소 접근은 `try/catch`로 감싸 예외를 결과값으로 변환한다. 저장 실패가 화면 크래시로 이어지지 않으며, A2-6의 롤백 처리가 이 계약 위에서 동작한다.
- `readTodos`는 파싱된 배열의 각 항목이 `Todo` 필수 필드를 갖추었는지 검사하고, 손상된 항목은 제외한 뒤 반환한다.

---

## 5. API 명세

**해당 없음.** 서버·API Routes·외부 통신을 사용하지 않는다. 모든 데이터 흐름은 브라우저 내부에서 완결된다.

| 계층 | 인터페이스 | 대체 근거 |
|------|-----------|----------|
| 데이터 조회 | `readTodos()` / `readSortOrder()` | GET 엔드포인트 대체 |
| 데이터 변경 | `writeTodos()` / `writeSortOrder()` | POST/PATCH/DELETE 엔드포인트 대체 |

---

## 6. 비기능 요구사항 구현 방침

### 성능

| PRD 요구 | 구현 방침 |
|---------|----------|
| 등록/삭제/완료 변경 반영 1초 이내 | 상태 변경이 동기 `setState` + 동기 `localStorage.setItem`. 네트워크 왕복 없음. React 리렌더 1회로 완결 |
| 100건 정렬 변경 1초 이내 | `useMemo(() => sortTodos(todos, sortOrder), [todos, sortOrder])`. 비교 연산은 문자열/숫자 비교뿐이며 `sort` 1회(O(n log n), n=100) |
| 최초 진입 3초 이내 목록 표시 | `output: 'export'` 정적 HTML 서빙 + 클라이언트 마운트 직후 `useEffect`에서 동기 읽기 1회. 로딩 중에는 스켈레톤 표시 |

### 접근성

| PRD 요구 | 구현 방침 |
|---------|----------|
| 키보드만으로 등록/완료/삭제/정렬 수행 | 모든 조작을 네이티브 요소로 구성: 등록 `<form>` + `<input type="text">` + `<button type="submit">`(Enter 제출), 마감일 `<input type="date">`, 완료 `<input type="checkbox">`(Space), 삭제 `<button type="button">`(Enter/Space), 정렬 `<select>`(방향키). 커스텀 div 클릭 핸들러를 쓰지 않으므로 Tab 순서가 DOM 순서와 일치. 포커스 링은 `focus-visible:ring-2`로 유지 |
| 본문 명도 대비 4.5:1 이상 | 본문 `text-slate-900`(#0F172A) on `bg-white` ≈ 17.9:1, 보조 텍스트 `text-slate-600`(#475569) on white ≈ 7.5:1, 완료 항목 `text-slate-500`(#64748B) on white ≈ 4.8:1, 오류 `text-red-700`(#B91C1C) on white ≈ 6.5:1. 4.5:1 미만 조합은 사용 금지 |
| 360~1920px 가로 스크롤 없음 | 단일 컬럼 레이아웃 + `w-full max-w-2xl mx-auto px-4`. 항목 내부는 360px에서 세로 스택(`flex-col sm:flex-row`), 긴 제목은 `break-words`로 줄바꿈. 고정 픽셀 폭 요소 없음 |
| 완료 여부를 색상 외 수단으로도 구분 | 체크박스 `checked` 상태 + 제목 `line-through` + `sr-only` "완료됨" 텍스트. "기한 지남"도 색상이 아닌 텍스트 배지로 표기 |

### 보안 / 제약

| PRD 요구 | 구현 방침 |
|---------|----------|
| 개인 식별 정보 미수집 | 입력 필드는 `title`, `dueDate` 2개뿐. 이름/이메일/연락처 필드 없음 |
| 데이터 외부 미전송 | `fetch`/`XMLHttpRequest`/외부 분석 스크립트를 코드에 포함하지 않음. 서버 컴포넌트에서 데이터 접근 없음 |
| 공유 경로 미제공 | 라우트는 `/` 단일. 항목 식별자를 URL에 노출하지 않음 |
| 최신 브라우저 2개 세대 지원 | `crypto.randomUUID`, `<input type="date">`, `localStorage`, ES2020 문법 사용. 모두 대상 범위에서 지원됨 |

---

## 7. 검증 매트릭스

### 7-1. PRD 기능 ↔ 구현 매핑

| PRD 기능 | TECH_SPEC 구현 명세 | 주요 파일 | 테스트 기준 |
|----------|-------------------|----------|-----------|
| 기능 1: 할 일 등록 및 삭제 | 3장 기능 1 (`addTodo` / `removeTodo` / `validateTitle`) | `src/components/TodoForm.tsx`, `src/components/TodoList.tsx`, `src/components/TodoItem.tsx`, `src/hooks/useTodos.ts`, `src/lib/todoValidation.ts` | 등록 → 목록 반영 → 새로고침 → 유지, 중복 등록 후 1건 삭제, 빈 값/101자 입력 시 오류 문구 확인 |
| 기능 2: 완료 체크 및 상태 변경 | 3장 기능 2 (`toggleTodo` / 파생 카운트 / 저장 실패 롤백) | `src/components/TodoItem.tsx`, `src/components/TodoSummary.tsx`, `src/hooks/useTodos.ts` | 토글 5회 연속 후 목록·카운트 일치, 완료 항목 삭제 후 카운트 각 1 감소, 저장 실패 주입 시 롤백 |
| 기능 3: 마감일 설정 및 정렬 | 3장 기능 3 (`sortTodos` / `validateDueDate` / `useSortOrder`) | `src/components/SortControl.tsx`, `src/components/TodoForm.tsx`, `src/components/TodoItem.tsx`, `src/hooks/useSortOrder.ts`, `src/lib/todoSort.ts`, `src/lib/date.ts` | 오름/내림 정렬 결과, 마감일 없는 항목 후미 배치, 동일 마감일 등록순, 2월 30일 입력 거부, 새로고침 후 정렬 기준 유지 |

### 7-2. 수용 기준 ↔ 구현 위치 (20/20)

| # | PRD 수용 기준 | 구현 위치 | 검증 방법 |
|---|--------------|----------|----------|
| A1-1 | 1~100자 등록 시 즉시 추가 + 입력란 초기화 | `TodoForm.handleSubmit`, `useTodos.addTodo` | "보고서 작성" 등록 → 목록 1건 + 입력란 공백 |
| A1-2 | 특정 항목만 삭제, 나머지 불변 | `useTodos.removeTodo` | 3건 중 2번째 삭제 → 1·3번 내용/완료 상태 동일 |
| A1-3 | 항목 0개 시 "등록된 할 일이 없습니다" | `TodoList` 빈 상태 분기 | 전체 삭제 후 안내 문구 노출 |
| A1-4 | 동일 내용 중복 등록, 개별 삭제 가능 | `useTodos.addTodo`의 `crypto.randomUUID()` | 같은 문구 2건 등록 → 1건 삭제 → 1건 잔존 |
| A1-5 | 새로고침·재방문 후 결과 유지 | `storage.writeTodos` / `readTodos` | 등록·삭제 후 F5 → 동일 목록 |
| A1-6 | 빈 값/공백만 입력 시 오류 안내 | `validateTitle` → `emptyTitle` | 공백 3칸 등록 시도 → "할 일 내용을 입력해 주세요" |
| A1-7 | 100자 초과 시 오류 안내 | `validateTitle` → `tooLongTitle` | 101자 붙여넣기 → "최대 100자까지 입력할 수 있습니다" |
| A2-1 | 완료 선택 시 상태 변경 + 시각 구분 | `useTodos.toggleTodo`, `TodoItem` 취소선 | 체크 → `line-through` 적용 확인 |
| A2-2 | 재선택 시 미완료 복귀 | `useTodos.toggleTodo` | 체크 해제 → 취소선 제거, 체크박스 해제 |
| A2-3 | "완료 N / 전체 M" 표시 및 갱신 | `TodoSummary`, `completedCount`/`totalCount` | 3건 중 1건 완료 → "완료 1 / 전체 3" |
| A2-4 | 5회 이상 연속 전환 시 정합 유지 | `setTodos` 함수형 업데이트 + 파생 카운트 | 7회 토글 후 최종 상태와 카운트 일치 |
| A2-5 | 완료 항목 삭제 시 두 카운트 각 1 감소 | `useTodos.removeTodo` + 파생 카운트 | "완료 2 / 전체 5" → 완료 1건 삭제 → "완료 1 / 전체 4" |
| A2-6 | 저장 실패 시 직전 상태 롤백 + 오류 안내 | `toggleTodo`의 `writeTodos` 실패 분기 | `setItem` 예외 주입 → 상태 원복 + "상태를 저장하지 못했습니다" |
| A3-1 | 등록 시/등록 후 마감일 지정 및 표시 | `TodoForm` date 입력, `TodoItem` + `useTodos.setDueDate` | 등록 시 지정 / 등록 후 변경 → 항목에 날짜 표시 |
| A3-2 | 빠른 순 / 늦은 순 정렬 | `SortControl`, `sortTodos` | 마감일 3종 항목의 순서가 기준에 따라 정·역순 |
| A3-3 | 기한 지난 미완료 항목 구분 표시 | `date.isOverdue`, `TodoItem` 배지 | 어제 마감 미완료 → "기한 지남" 배지, 완료 항목엔 미표시 |
| A3-4 | 마감일 없는 항목은 뒤 + 등록순 | `sortTodos` 규칙 1·4 | 마감일 유/무 혼합 목록에서 두 정렬 기준 모두 확인 |
| A3-5 | 마감일 동일 시 먼저 등록된 항목이 앞 | `sortTodos` 규칙 3 (`a.seq - b.seq`) | 같은 마감일 2건 → 등록 순서대로 표시 |
| A3-6 | 정렬 기준이 새로고침 후 유지 | `useSortOrder`, `todolist.sortOrder.v1` | "늦은 순" 선택 → F5 → "늦은 순" 유지 |
| A3-7 | 잘못된 날짜 거부 + 오류 안내 | `validateDueDate`, `isValidDateString` | `2026-02-30` 입력 → 저장 안 됨 + "올바른 날짜를 입력해 주세요" |

**커버리지: 20 / 20 (100%)** — PRD 성공 지표 "수용 기준 20개 중 20개 검증 통과" 요건과 일치.

### 7-3. 비기능 요구사항 커버리지

| 구분 | 항목 수 | 대응 위치 |
|------|--------|----------|
| 성능 | 3 | 6장 성능 표 |
| 보안 | 3 | 6장 보안/제약 표 |
| 접근성 | 4 | 6장 접근성 표 |
| 기술적 제약 | 4 | 1장 기술 스택 + 6장 보안/제약 표 |

---

## 8. 구현 순서 제안

| 단계 | 작업 | 산출 파일 |
|------|------|----------|
| 1 | 프로젝트 초기화 및 정적 빌드 설정 | `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx` |
| 2 | 타입 및 저장소 계층 | `src/types/todo.ts`, `src/lib/storage.ts` |
| 3 | 순수 함수 계층 (검증·날짜·정렬) | `src/lib/todoValidation.ts`, `src/lib/date.ts`, `src/lib/todoSort.ts` |
| 4 | 상태 훅 | `src/hooks/useTodos.ts`, `src/hooks/useSortOrder.ts` |
| 5 | 기능 1 UI | `src/components/TodoForm.tsx`, `src/components/TodoList.tsx`, `src/components/TodoItem.tsx`, `src/components/TodoApp.tsx` |
| 6 | 기능 2 UI | `src/components/TodoItem.tsx`(완료 토글), `src/components/TodoSummary.tsx` |
| 7 | 기능 3 UI | `src/components/SortControl.tsx`, `src/components/TodoItem.tsx`(마감일) |
| 8 | 비기능 요구사항 점검 | 전 컴포넌트 (키보드 순회, 대비, 360/1920px 확인) |
