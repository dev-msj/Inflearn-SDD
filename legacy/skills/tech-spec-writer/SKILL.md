---
name: tech-spec-writer
description: "기술 명세서(TECH_SPEC) 작성 시 사용하는 스킬. 기술스펙 작성, 기술 설계, 아키텍처 설계, API 설계, 데이터베이스 설계, 구현 명세, 파일 구조, 컴포넌트 설계 요청 시 활성화."
---

# Tech Spec Writer Skill

## 역할
PRD를 기반으로 구체적인 기술 구현 명세서(TECH_SPEC)를 작성하는 도구입니다.

## 전제조건
- **docs/PRD.md 필수**: PRD가 없으면 작성 불가
- PRD가 없을 경우 → "PRD를 먼저 작성해주세요. `/sdd-plan`을 실행하세요." 안내

## 핵심 규칙

### 1. PRD 필수 참조
- PRD.md를 반드시 먼저 읽고 분석
- PRD의 모든 기능 요구사항을 빠짐없이 반영

### 2. PRD 기능과 1:1 매핑
- PRD에 기능 3개 → TECH_SPEC에 구현 명세 3개
- 매핑 관계를 명시적으로 표시
- 누락된 기능이 없는지 교차 검증

### 3. 구체적 구현 명세
- 파일 경로 명시 (예: `src/components/TodoInput.tsx`)
- 함수명 명시 (예: `addTodo()`, `toggleTodo()`)
- 타입/인터페이스 정의 포함
- Props, State, 훅 인터페이스 정의

### 4. 기술 스택 명시
- 사용할 프레임워크, 라이브러리 버전 포함
- 선정 근거 간략 기술

## 출력 템플릿

```markdown
# TECH_SPEC: [프로젝트명]

> PRD 참조: docs/PRD.md

## 1. 기술 스택

| 구분 | 기술 | 버전 | 선정 근거 |
|------|------|------|----------|
| Framework | [예: Next.js] | [예: 14+] | [근거] |
| Styling | [예: Tailwind CSS] | [예: 3.4+] | [근거] |
| State | [예: React hooks] | - | [근거] |
| Storage | [예: localStorage] | - | [근거] |

---

## 2. 프로젝트 구조

```
src/
├── app/
│   ├── layout.tsx          # 루트 레이아웃
│   ├── page.tsx            # 메인 페이지
│   └── globals.css         # 글로벌 스타일
├── components/
│   ├── [Component1].tsx    # [설명]
│   ├── [Component2].tsx    # [설명]
│   └── [Component3].tsx    # [설명]
├── hooks/
│   └── [useHook].ts        # [설명]
├── types/
│   └── [type].ts           # 타입 정의
└── lib/
    └── [util].ts           # 유틸리티
```

---

## 3. 구현 명세

### 기능 1: [PRD 기능명] → 구현 명세

> PRD 매핑: 기능 1 - [사용자 스토리 요약]

**파일**: `src/components/[Component].tsx`

**Props 인터페이스**:
```typescript
interface [Component]Props {
  // Props 정의
}
```

**핵심 함수**:
```typescript
// 함수 시그니처와 역할
function [functionName](params): ReturnType {
  // 구현 로직 설명
}
```

**수용 기준 매핑**:
| PRD 수용 기준 | 구현 방법 |
|--------------|----------|
| [기준 1] | [구현 방법] |
| [기준 2] | [구현 방법] |
| [기준 3] | [구현 방법] |

---

### 기능 2: [PRD 기능명] → 구현 명세

> PRD 매핑: 기능 2 - [사용자 스토리 요약]

[동일 구조 반복]

---

### 기능 3: [PRD 기능명] → 구현 명세

> PRD 매핑: 기능 3 - [사용자 스토리 요약]

[동일 구조 반복]

---

## 4. 데이터 모델

```typescript
// 핵심 타입 정의
interface [ModelName] {
  id: string;
  // 필드 정의
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 5. API 명세 (해당 시)

| Method | Endpoint | 설명 | Request | Response |
|--------|----------|------|---------|----------|
| [GET/POST] | [/api/...] | [설명] | [Body] | [Response] |

---

## 6. 검증 매트릭스

| PRD 기능 | TECH_SPEC 구현 | 파일 | 테스트 기준 |
|----------|---------------|------|-----------|
| 기능 1 | [구현 명세] | [파일 경로] | [테스트 방법] |
| 기능 2 | [구현 명세] | [파일 경로] | [테스트 방법] |
| 기능 3 | [구현 명세] | [파일 경로] | [테스트 방법] |
```

## 주의사항
- PRD 없이 작성 시도 시 중단하고 안내
- PRD의 모든 기능을 빠짐없이 매핑
- 파일 경로는 실제 생성될 경로로 명시
- 함수명은 구현 시 그대로 사용할 수 있도록 구체적으로
- 기술 스택 선정에 근거 포함
