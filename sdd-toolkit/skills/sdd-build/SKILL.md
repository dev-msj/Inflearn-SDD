---
name: sdd-build
description: "구현 계획을 수립·검토해 TASK.md를 작성하고, @developer 에이전트를 호출하여 스펙 기반 코드를 구현. 코드 구현, 코드 생성, 빌드, 개발, 코딩 요청 시 사용. 전제조건: PRD.md + TECH_SPEC.md 필수."
---

# /sdd-build - 코드 구현

## 동작
Plan 에이전트로 구현 계획을 수립하고, 검토를 거쳐 `docs/TASK.md` 체크리스트를 작성한 뒤,
@developer 에이전트를 호출하여 PRD와 TECH_SPEC에 기반한 코드를 구현합니다.

> 오케스트레이션(에이전트 호출·계획 검토)은 이 스킬에서만 수행합니다.
> @developer는 서브 에이전트를 호출하지 않습니다.

## 사용법
```
/sdd-build
```

## 전제조건
- **docs/PRD.md 필수**: 기능 요구사항 참조
- **docs/TECH_SPEC.md 필수**: 구현 명세 참조
- 둘 중 하나라도 없으면 → 해당 단계 안내 후 중단

## 실행 순서

### Step 1: 전제조건 체크
```
docs/PRD.md 존재 확인
├── 미존재 → "/sdd-plan을 먼저 실행해주세요." 중단
└── 존재 → docs/TECH_SPEC.md 확인
    ├── 미존재 → "/sdd-design을 먼저 실행해주세요." 중단
    └── 존재 → Step 2로 진행
```

### Step 2: 스펙 확인
- PRD.md 읽기 → 기능 요구사항 파악
- TECH_SPEC.md 읽기 → 구현 명세 파악
- "PRD 기능 N개, TECH_SPEC 파일 N개 확인" 출력

### Step 3: 구현 계획 수립

**3-1. Plan 에이전트 호출** (계획만 반환, 파일 쓰기 없음)
```
프롬프트:
- docs/PRD.md와 docs/TECH_SPEC.md를 읽고 구현 계획을 수립하라
- TECH_SPEC의 모든 파일에 대해 [파일 경로 / 목적 / 의존하는 파일 / 대응 PRD 기능]을 산출하라
- 의존 관계에 따른 구현 순서를 제시하라
- 코드를 작성하지 말고 계획만 반환하라
```

**3-2. 반환된 계획 검토** (통과 기준)
- TECH_SPEC에 명시된 파일이 **빠짐없이** 포함되어 있는가
- PRD의 각 수용 기준이 최소 하나의 파일에 매핑되어 있는가
- 구현 순서가 `타입 → 유틸 → 훅 → 컴포넌트 → 페이지 → API`를 위반하지 않는가
- TECH_SPEC에 없는 파일이 임의로 추가되지 않았는가

→ 미충족 시: **부족한 항목만 명시**하여 재요청 (최대 1회)
→ 재요청 후에도 미충족 시: 호출자가 직접 보완하고 보완 내역을 사용자에게 보고

**3-3. `docs/TASK.md` 작성**
- 기존 TASK.md가 있으면 → 덮어쓰지 말고 사용자에게 이어서 진행할지 확인
- 아래 템플릿 형식 준수

### Step 4: 프로젝트 초기화
- 신규 프로젝트인 경우에만 수행 (기존 프로젝트면 건너뜀)
- package.json 생성 / 의존성 설치 / 설정 파일 생성 (tsconfig, tailwind 등)
- 완료 후 TASK.md의 `0. 프로젝트 초기화` 항목 체크

### Step 5: 에이전트 활성화 및 코드 구현
- @developer 에이전트 호출
- code-generator 스킬 자동 활성화
- @developer가 `docs/TASK.md` 체크리스트 순서대로 구현하고, 파일 완성 즉시 체크박스 갱신

### Step 6: 진행 상황 보고
```
[1/N] src/types/... 생성... ✅
[2/N] src/hooks/... 생성... ✅
...
[N/N] src/app/page.tsx 수정... ✅
```

### Step 7: 완료 확인
- `docs/TASK.md`에 미완료(`- [ ]`) 항목이 남아 있으면 → 중단하지 말고 해당 항목 마저 구현
- 전부 완료된 경우에만 완료 메시지 출력

## TASK.md 템플릿

```markdown
# 구현 작업 목록

> 출처: docs/PRD.md, docs/TECH_SPEC.md
> 파일 완성 시 즉시 체크. 일괄 체크 금지.

## 체크리스트

### 0. 프로젝트 초기화 (해당 시)
- [ ] `package.json` / `tsconfig.json` / 설정 파일 — 신규 프로젝트일 때만

### 1. 타입 정의
- [ ] `src/types/todo.ts` — Todo 인터페이스 정의 (PRD 기능 1,2,3)

### 2. 커스텀 훅
- [ ] `src/hooks/useTodos.ts` — 할일 CRUD 상태 관리 (의존: types/todo.ts)

### 3. 컴포넌트
- [ ] `src/components/TodoInput.tsx` — 할일 입력 (PRD 기능 1)

### 4. 페이지
- [ ] `src/app/page.tsx` — 메인 화면 조립 (의존: 위 컴포넌트 전체)

## 수용 기준 매핑
| PRD 수용 기준 | 담당 파일 |
|---|---|
| 할일을 추가할 수 있다 | TodoInput.tsx, useTodos.ts |
```

## 출력물
- `docs/TASK.md` (구현 체크리스트)
- `src/` 폴더 내 코드 파일들
- 프로젝트 설정 파일들

## 완료 메시지

```
✅ 코드 구현 완료

📋 TASK.md: N/N 완료

📁 생성된 파일: N개
- src/types/... ✅
- src/hooks/... ✅
- src/components/... ✅
- src/app/... ✅

🚀 실행 방법: npm run dev

다음 단계: /sdd-review 로 스펙 검증을 수행하세요.
```
