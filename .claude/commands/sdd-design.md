---
name: sdd-design
description: "@architect 에이전트를 호출하여 TECH_SPEC을 작성. 기술스펙 작성, 기술 설계, 아키텍처 설계 요청 시 사용. 전제조건: PRD.md 필수."
category: sdd
complexity: basic
allowed-tools: [Read, Write, Edit]
---

# /sdd-design - TECH_SPEC 작성

## 동작
@architect 에이전트를 호출하여 TECH_SPEC(기술 명세서)를 작성합니다.

## 사용법
```
/sdd-design
```

## 전제조건
- **docs/PRD.md 필수**: PRD가 작성되어 있어야 함
- PRD 부재 시 → "/sdd-plan을 먼저 실행해주세요." 안내 후 중단

## 실행 순서

### Step 1: 전제조건 체크
```
docs/PRD.md 존재 확인
├── 존재 → Step 2로 진행
└── 미존재 → 안내 메시지 출력 후 중단
```

### Step 2: 에이전트 활성화
- @architect 에이전트 호출
- tech-spec-writer 스킬 자동 활성화

### Step 3: PRD 분석
- PRD.md 읽기
- 기능 개수 파악
- 수용 기준 파악
- "PRD.md 분석 중... 기능 N개 확인" 출력

### Step 4: TECH_SPEC 작성
PRD를 기반으로 `docs/TECH_SPEC.md` 작성:
- 기술 스택 선정 (근거 포함)
- 파일 구조 설계
- PRD 기능별 1:1 구현 명세
- 타입 정의, 함수 시그니처
- 검증 매트릭스

### Step 5: 결과 확인
작성된 TECH_SPEC 요약 출력

## 출력물
- `docs/TECH_SPEC.md`

## 완료 메시지

```
✅ TECH_SPEC 작성 완료

📄 docs/TECH_SPEC.md
- 기술 스택: [스택 요약]
- 파일 구조: N개 파일 설계
- PRD 매핑: 기능 N개 ↔ 구현 명세 N개

다음 단계: /sdd-build 로 코드를 구현하세요.
```
