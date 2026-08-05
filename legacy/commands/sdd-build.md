---
name: sdd-build
description: "@developer 에이전트를 호출하여 스펙 기반 코드를 구현. 코드 구현, 코드 생성, 빌드, 개발, 코딩 요청 시 사용. 전제조건: PRD.md + TECH_SPEC.md 필수."
category: sdd
complexity: enhanced
allowed-tools: [Read, Write, Edit, Bash]
---

# /sdd-build - 코드 구현

## 동작
@developer 에이전트를 호출하여 PRD와 TECH_SPEC에 기반한 코드를 구현합니다.

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

### Step 2: 에이전트 활성화
- @developer 에이전트 호출
- code-generator 스킬 자동 활성화

### Step 3: 스펙 확인
- PRD.md 읽기 → 기능 요구사항 파악
- TECH_SPEC.md 읽기 → 구현 명세 파악
- "PRD 기능 N개, TECH_SPEC 파일 N개 확인" 출력

### Step 4: 프로젝트 초기화
- package.json 생성 (해당 시)
- 의존성 설치 (해당 시)
- 설정 파일 생성 (tsconfig, tailwind 등)

### Step 5: 코드 구현
TECH_SPEC에 따라 순서대로 구현:
1. 타입 정의
2. 유틸리티/라이브러리
3. 커스텀 훅
4. 컴포넌트
5. 페이지
6. API 라우트 (해당 시)

### Step 6: 진행 상황 보고
```
[1/N] src/types/... 생성... ✅
[2/N] src/hooks/... 생성... ✅
...
[N/N] src/app/page.tsx 수정... ✅
```

## 출력물
- `src/` 폴더 내 코드 파일들
- 프로젝트 설정 파일들

## 완료 메시지

```
✅ 코드 구현 완료

📁 생성된 파일: N개
- src/types/... ✅
- src/hooks/... ✅
- src/components/... ✅
- src/app/... ✅

🚀 실행 방법: npm run dev

다음 단계: /sdd-review 로 스펙 검증을 수행하세요.
```
