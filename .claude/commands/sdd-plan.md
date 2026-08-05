---
name: sdd-plan
description: "@planner 에이전트를 호출하여 PRD를 작성. 기획, 요구사항 정의, PRD 작성, 기획서 작성 요청 시 사용."
category: sdd
complexity: basic
allowed-tools: [Read, Write, Edit]
---

# /sdd-plan - PRD 작성

## 동작
@planner 에이전트를 호출하여 PRD(Product Requirements Document)를 작성합니다.

## 사용법
```
/sdd-plan [아이디어 설명]
```

## 실행 순서

### Step 1: 에이전트 활성화
- @planner 에이전트 호출
- prd-writer 스킬 자동 활성화

### Step 2: 명확화 질문
@planner가 사용자에게 3개 이상의 질문을 던짐:
- 타겟 사용자
- 핵심 기능 우선순위
- 데이터 저장 방식
- 성공 기준
- 참고 서비스

### Step 3: PRD 작성
사용자 답변을 바탕으로 `docs/PRD.md` 작성:
- 기능 최대 3개 (MVP 원칙)
- 사용자 스토리 형식
- 수용 기준 포함

### Step 4: 결과 확인
작성된 PRD 요약 출력

## 전제조건
- 없음 (첫 단계)
- docs/ 폴더가 없으면 자동 생성

## 출력물
- `docs/PRD.md`

## 완료 메시지

```
✅ PRD 작성 완료

📄 docs/PRD.md
- 기능 N개 정의
- 수용 기준 N개 정의

다음 단계: /sdd-design 로 기술 스펙을 작성하세요.
```

## 예시
```
> /sdd-plan 할일 관리 앱 만들고 싶어

@planner가 활성화됩니다...
"할일 관리 앱에 대해 몇 가지 질문이 있습니다..."
```
