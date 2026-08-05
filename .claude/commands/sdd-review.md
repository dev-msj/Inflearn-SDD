---
name: sdd-review
description: "@reviewer 에이전트를 호출하여 PRD/TECH_SPEC 대비 코드를 3단계 검증. 스펙 검증, 코드 리뷰, QA, 테스트, 품질 확인 요청 시 사용. 전제조건: PRD.md + TECH_SPEC.md + src/ 필수."
category: sdd
complexity: enhanced
allowed-tools: [Read, Write, Glob, Grep]
---

# /sdd-review - 스펙 검증

## 동작
@reviewer 에이전트를 호출하여 PRD, TECH_SPEC, 코드 간의 일치를 3단계로 검증합니다.

## 사용법
```
/sdd-review
```

## 전제조건
- **docs/PRD.md 필수**
- **docs/TECH_SPEC.md 필수**
- **src/ 폴더 필수**: 검증할 코드 존재
- 하나라도 없으면 → 해당 단계 안내 후 중단

## 실행 순서

### Step 1: 전제조건 체크
```
docs/PRD.md 존재 확인
docs/TECH_SPEC.md 존재 확인
src/ 폴더 존재 확인
├── 모두 존재 → Step 2로 진행
└── 하나라도 미존재 → 안내 메시지 출력 후 중단
```

### Step 2: 에이전트 활성화
- @reviewer 에이전트 호출
- spec-validator 스킬 자동 활성화

### Step 3: 3단계 검증

**Stage 1: PRD ↔ 코드**
- PRD의 각 수용 기준을 코드에서 확인
- 수용 기준별 PASS/FAIL 판정

**Stage 2: TECH_SPEC ↔ 코드**
- 파일 구조 일치 확인
- 함수명/타입명 일치 확인
- API 엔드포인트 일치 확인

**Stage 3: 코드 품질**
- TypeScript 타입 안전성
- 에러 처리
- 접근성
- 코드 스타일

### Step 4: 리포트 생성
종합 리포트 출력:
- 단계별 PASS/FAIL 결과
- 종합 점수
- 불일치 항목 상세
- 개선 권고사항

## 출력물
- 검증 리포트 (콘솔 출력)
- 선택적: `docs/REVIEW_REPORT.md`

## 완료 메시지 (예시)

```
✅ 스펙 검증 완료

📊 종합 결과
| 단계 | 결과 | 점수 |
|------|------|------|
| PRD 일치 | ✅ | 9/9 |
| TECH_SPEC 일치 | ✅ | 7/7 |
| 코드 품질 | ✅ | 5/5 |
| 종합 | ✅ PERFECT | 100% |

🎉 모든 스펙이 정확히 구현되었습니다!
```
