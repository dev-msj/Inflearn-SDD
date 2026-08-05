---
name: code-generator
description: "PRD와 TECH_SPEC 기반으로 코드를 생성하는 스킬. 코드 생성, 코드 구현, 컴포넌트 생성, 개발, 빌드, 코딩, 프로그래밍, 함수 구현, 페이지 구현 요청 시 활성화."
---

# Code Generator Skill

## 역할
PRD와 TECH_SPEC을 기반으로 스펙에 정확히 일치하는 코드를 생성하는 도구입니다.

## 전제조건
- **docs/PRD.md 필수**: 기능 요구사항 참조
- **docs/TECH_SPEC.md 필수**: 구현 명세 참조
- 두 문서 중 하나라도 없으면 → "PRD와 TECH_SPEC을 먼저 작성해주세요." 안내

## 핵심 규칙

### 1. 스펙 준수 (최우선)
- TECH_SPEC에 명시된 **파일 경로** 그대로 생성
- TECH_SPEC에 명시된 **함수명** 그대로 사용
- TECH_SPEC에 명시된 **타입 정의** 그대로 구현
- 임의로 파일명, 함수명, 구조를 변경하지 않음

### 2. 점진적 구현
구현 순서:
1. 타입 정의 (`types/`)
2. 유틸리티/라이브러리 (`lib/`)
3. 커스텀 훅 (`hooks/`)
4. 컴포넌트 (`components/`)
5. 페이지 (`app/` 또는 `pages/`)
6. API 라우트 (`api/`)

### 3. 기능별 순차 구현
- 기능 1 완성 → 기능 2 완성 → 기능 3 완성
- 각 기능 완성 후 해당 기능의 수용 기준 확인
- 미완성 기능을 남기지 않음

### 4. 코드 품질 기준
- TypeScript strict 모드 준수
- 컴포넌트는 단일 책임 원칙
- 에러 처리 포함
- 접근성(a11y) 기본 속성 포함

## 구현 프로세스

```
[Step 1] PRD.md 읽기 → 기능 요구사항 파악
[Step 2] TECH_SPEC.md 읽기 → 구현 명세 파악
[Step 3] 타입 정의 생성
[Step 4] 기능 1 구현 (hooks → components → pages)
[Step 5] 기능 2 구현
[Step 6] 기능 3 구현
[Step 7] 통합 확인
```

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
[1/N] src/types/[type].ts 생성... ✅
[2/N] src/hooks/[hook].ts 생성... ✅
[3/N] src/components/[comp].tsx 생성... ✅
...
[N/N] src/app/page.tsx 수정... ✅

✅ 구현 완료 - 기능 3개, 파일 N개 생성
```

## 주의사항
- TECH_SPEC의 파일 경로/함수명을 절대 임의 변경하지 않음
- 스펙에 없는 추가 기능을 구현하지 않음
- TODO 주석을 남기지 않음 (모든 기능 완성)
- console.log 디버깅 코드를 남기지 않음
- 하드코딩된 문자열은 상수로 분리
