---
name: code-generator
description: "PRD와 TECH_SPEC 기반으로 코드를 생성하는 스킬. 코드 생성, 코드 구현, 컴포넌트 생성, 개발, 빌드, 코딩, 프로그래밍, 함수 구현, 페이지 구현 요청 시 활성화."
---

# Code Generator Skill

## 역할
PRD와 TECH_SPEC을 기반으로 스펙에 정확히 일치하는 코드를 생성하는 도구입니다.

## 전제조건
- **담당 슬라이스 문서 필수**: `docs/tasks/[슬라이스].md` — 작업 범위이자 상한
- **docs/TECH_SPEC.md 필수**: 담당 슬라이스 파일들의 구현 명세 참조
- **docs/PRD.md**: 담당 슬라이스의 대응 AC 확인용
- 슬라이스 문서가 없으면 → "`/sdd-build`를 먼저 실행해주세요." 안내

## 핵심 규칙

### 1. 스펙 준수 (최우선)
- TECH_SPEC에 명시된 **파일 경로** 그대로 생성
- TECH_SPEC에 명시된 **함수명** 그대로 사용
- TECH_SPEC에 명시된 **타입 정의** 그대로 구현
- 임의로 파일명, 함수명, 구조를 변경하지 않음

### 2. 슬라이스 범위 준수
- 담당 슬라이스 체크리스트에 있는 파일만 생성/수정
- 다른 슬라이스 소유 파일은 **import해서 쓰기만** 하고 손대지 않음
- 체크리스트 밖의 파일이 필요하면 → 임의 생성하지 말고 호출자에게 보고

### 3. 슬라이스 내부 순차 구현
- 체크리스트에 적힌 항목 순서 그대로 (이미 의존 관계 순으로 정렬됨)
- `⚙️` 접두 항목은 파일 생성이 아니라 **명령 실행** — 순서가 온 시점에 실제로 실행하고 체크
- 참고 기준: 도메인/서버 → 액션 → 훅 → 컴포넌트 → 페이지 → API → 테스트
- 마지막 항목 완료 후 **완료 게이트 명령 실행**
- 미완성 항목을 남기지 않음

### 4. 코드 품질 기준
- TypeScript strict 모드 준수
- 컴포넌트는 단일 책임 원칙
- 에러 처리 포함
- 접근성(a11y) 기본 속성 포함

## 구현 프로세스

```
[Step 1] docs/tasks/[슬라이스].md 읽기 → 체크리스트·미완료 항목·완료 게이트 파악
[Step 2] TECH_SPEC에서 체크리스트에 등장하는 파일의 명세만 읽기 (전문 통독 금지)
[Step 3] PRD에서 대응 AC만 확인
[Step 4] 체크리스트 순서대로 파일 구현 (완성 즉시 개별 체크)
[Step 5] 완료 게이트 명령 실행
[Step 6] 대응 AC 자체 확인 후 결과 보고
```

각 파일 생성 직후 `docs/tasks/[슬라이스].md`의 해당 체크박스를 `- [x]`로 갱신합니다.

## 코드 생성 규칙

### 컴포넌트 작성 규칙
```typescript
// 1. 'use client' 디렉티브 (필요시)
'use client';

// 2. Import 순서: 외부 → 내부 → 타입
import { useState } from 'react';
import { ComponentName } from '@/components/ComponentName';
import type { TypeName } from '@/types/typeName';

// 3. Props 인터페이스 (TECH_SPEC 그대로)
interface ComponentProps {
  // TECH_SPEC에 정의된 Props
}

// 4. 컴포넌트 구현
export function Component({ prop1, prop2 }: ComponentProps) {
  // 구현
}
```

### 훅 작성 규칙
```typescript
// 1. Import
import { useState, useCallback } from 'react';
import type { TypeName } from '@/types/typeName';

// 2. 반환 타입 정의
interface UseHookReturn {
  // TECH_SPEC에 정의된 인터페이스
}

// 3. 훅 구현
export function useHookName(): UseHookReturn {
  // 구현
}
```

### API 라우트 작성 규칙
```typescript
import { NextRequest, NextResponse } from 'next/server';

// TECH_SPEC의 API 명세에 따라 구현
export async function METHOD(request: NextRequest) {
  try {
    // 구현
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
```

## 진행 상황 표시

각 파일 생성 시 진행률 표시:
```
▶ 슬라이스 F1 [이름] — 7항목

[1/7] src/server/[service].ts 생성... ✅
[2/7] src/components/[comp].tsx 생성... ✅
...
[7/7] tests/unit/[test].test.ts 생성... ✅

🔍 게이트: [게이트 명령] ✅

✅ 슬라이스 F1 완료 - 파일 7개, 대응 AC 9개 확인
```

## 주의사항
- TECH_SPEC의 파일 경로/함수명을 절대 임의 변경하지 않음
- 담당 슬라이스 체크리스트 밖의 파일을 생성/수정하지 않음
- 스펙에 없는 추가 기능을 구현하지 않음
- TODO 주석을 남기지 않음 (모든 기능 완성)
- console.log 디버깅 코드를 남기지 않음
- 하드코딩된 문자열은 상수로 분리
- 종료 전 완료 게이트를 반드시 실행
