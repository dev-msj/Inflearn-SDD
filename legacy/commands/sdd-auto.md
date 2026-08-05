---
name: sdd-auto
description: "자연어 입력을 분석하여 적절한 SDD 워크플로우 단계로 자동 라우팅하는 핵심 커맨드. 자동 라우팅, 자연어 명령, 자동 실행, 스마트 라우팅, 워크플로우 자동화 요청 시 사용."
category: sdd
complexity: enhanced
allowed-tools: [Read, Write, Edit, Bash]
---

# /sdd-auto - 자동 라우팅 (핵심)

## 동작
사용자의 자연어 입력을 분석하여 적절한 SDD 워크플로우 단계로 자동 라우팅합니다.

## 사용법
```
/sdd-auto [자연어 입력]
```

## 핵심 원칙
**"커맨드 6개를 외울 필요 없습니다. 자연어로 말하면 /sdd-auto가 알아서 해줍니다."**

## ⚠️ 실행 모드: 풀 체인 자동 실행 (기본값)

**절대 규칙: 사용자에게 다음 단계를 물어보지 않는다.**

- 의도가 감지되면 해당 단계부터 review까지 **모든 단계를 자동으로 연속 실행**한다.
- 중간에 멈추거나 "어떻게 진행할까요?" 같은 질문을 하지 않는다.
- AskUserQuestion 도구를 사용하여 진행 방향을 묻지 않는다.
- 각 단계 완료 후 바로 다음 단계로 진행한다.

```
감지된 의도 → 해당 단계부터 끝까지 자동 풀 체인 실행
init   → init → plan → design → build → review
plan   → init(스킵 가능) → plan → design → build → review
design → design → build → review
build  → build → review
review → review
```

---

## 🔴 파일/폴더 보호 규칙 (CRITICAL)

**기존 파일과 폴더를 절대 삭제하거나 덮어쓰지 않는다.**

### 보호 대상
- `claudedocs/` 디렉토리 및 하위 파일 (PRD.md, TECH_SPEC.md, HANDOFF_*.md 등)
- `.claude/` 디렉토리 및 하위 파일 (agents, commands, skills)
- `src/` 디렉토리 및 기존 소스 코드
- `.env.local`, `.gitignore` 등 설정 파일

### 보호 규칙
1. **프로젝트 초기화(create-next-app 등) 시**: 임시 디렉토리에서 생성 후, 기존 파일을 **보존하면서** 병합한다. `cp -R`로 전체 덮어쓰기 금지.
2. **파일 복사 시**: 대상 경로에 이미 파일이 있으면 **스킵**하거나 사용자에게 확인한다.
3. **디렉토리 삭제 금지**: `rm -rf`로 프로젝트 루트나 주요 디렉토리를 삭제하지 않는다.
4. **init 단계에서**: `claudedocs/`, `src/` 등이 이미 존재하면 해당 디렉토리 생성을 스킵한다.
5. **build 단계에서**: 프레임워크 초기화(`create-next-app` 등)는 반드시 빈 임시 디렉토리에서 실행 후, 필요한 파일만 개별적으로 복사한다. 복사 전 기존 파일 존재 여부를 확인하고, 존재하는 파일은 건너뛴다.

```bash
# ❌ 금지: 전체 덮어쓰기
cp -R temp-dir/* project-dir/

# ✅ 허용: 개별 파일 복사 (존재 여부 확인 후)
[ ! -f project-dir/package.json ] && cp temp-dir/package.json project-dir/
[ ! -d project-dir/node_modules ] && cp -R temp-dir/node_modules project-dir/
```

---

## 라우팅 로직 (3단계)

### 1단계: 명시적 커맨드 우선
사용자가 `/sdd-build` 등 명시적 커맨드를 입력하면 그대로 실행.
명시적 커맨드가 항상 최우선입니다.

### 2단계: 키워드 분석
자연어 입력에서 의도를 파악합니다.

#### 키워드 매핑 테이블

| 타겟 커맨드 | 인식 키워드 |
|-----------|-----------|
| `/sdd-init` | "초기화", "init", "세팅", "셋업", "시작", "프로젝트 생성" |
| `/sdd-plan` | "기획", "요구사항", "PRD", "MVP", "만들고 싶어", "아이디어", "기획서", "요구사항 정리" |
| `/sdd-design` | "기술스펙", "아키텍처", "DB", "API 설계", "구조", "설계", "기술 설계", "스택" |
| `/sdd-build` | "구현", "코드", "컴포넌트", "개발", "만들어", "빌드", "코딩", "프로그래밍" |
| `/sdd-review` | "검증", "리뷰", "QA", "체크", "확인", "제대로", "테스트", "품질" |

#### 분석 규칙
- 여러 키워드가 매칭되면 가장 많이 매칭된 타겟 선택
- 동률일 경우 워크플로우 순서상 앞 단계 선택
- "만들어줘"는 build 의도지만, 전제조건 미충족 시 init부터 시작
- 키워드 매칭이 없어도 입력이 있으면 plan 의도로 간주하여 풀 체인 실행

### 3단계: 전제조건 체크 → 자동 체인 시작점 결정
감지된 의도의 전제조건을 확인하고, 미충족 시 앞 단계부터 자동으로 시작합니다.
**사용자에게 확인을 묻지 않고 즉시 실행합니다.**

```
의도: build
├── claudedocs/ 디렉토리 확인
│   ├── 없음 → init부터 풀 체인 자동 실행
│   └── 있음 → PRD.md 확인
│       ├── 없음 → plan부터 풀 체인 자동 실행
│       └── 있음 → TECH_SPEC.md 확인
│           ├── 없음 → design부터 풀 체인 자동 실행
│           └── 있음 → build부터 풀 체인 자동 실행
```

| 의도 | 필요 파일/폴더 | 미충족 시 |
|------|--------------|----------|
| init | 없음 | 바로 실행 → 이후 plan → design → build → review 자동 체인 |
| plan | claudedocs/ | → init부터 풀 체인 자동 실행 |
| design | claudedocs/PRD.md | → 없는 단계부터 풀 체인 자동 실행 |
| build | claudedocs/PRD.md + claudedocs/TECH_SPEC.md | → 없는 단계부터 풀 체인 자동 실행 |
| review | claudedocs/PRD.md + claudedocs/TECH_SPEC.md + src/ | → 없는 단계부터 풀 체인 자동 실행 |

---

## 자동 체인 실행 흐름

**모든 경우에 감지된 시작점부터 review까지 끊김 없이 자동 실행됩니다.**

```
입력: "템플릿 스토어 만들어줘"

분석:
- 키워드 "만들어줘" → build 의도
- 전제조건 체크: claudedocs/ 없음
- 결정: init부터 풀 체인 자동 실행 (질문 없이 즉시)

자동 실행 (중단 없이 연속):
[1/5] /sdd-init → 폴더 구조 생성 (claudedocs/, src/)
[2/5] /sdd-plan → @planner → PRD 작성
[3/5] /sdd-design → @architect → TECH_SPEC 작성
[4/5] /sdd-build → @developer → 코드 구현 (Phase 1~N)
[5/5] /sdd-review → @reviewer → 빌드/타입체크/린트 검증
```

### init 스킵 조건
`claudedocs/` 디렉토리와 필요한 하위 구조가 이미 존재하면 init을 건너뛰고 다음 단계부터 실행한다.

```
입력: "대시보드 만들어줘"

분석:
- claudedocs/ 존재 확인 → 이미 있음 → init 스킵
- PRD.md 확인 → 없음 → plan부터 시작

자동 실행:
[1/4] /sdd-plan → @planner → PRD 작성
[2/4] /sdd-design → @architect → TECH_SPEC 작성
[3/4] /sdd-build → @developer → 코드 구현
[4/4] /sdd-review → @reviewer → 검증
```

---

## 라우팅 결과 표시

체인 시작 시 한 번만 표시하고 즉시 실행에 들어갑니다:

```
🔀 /sdd-auto 라우팅 결과

📝 입력: "[사용자 입력]"
🔍 키워드: "[매칭된 키워드]"
🎯 의도: [init/plan/design/build/review]
📋 전제조건: [상태]
🛡️ 기존 파일 보호: [보호 대상 목록]
▶️ 실행 체인: [시작 단계] → ... → review (자동 풀 체인)

---
[즉시 실행 시작 - 사용자 확인 불필요]
```

---

## 예시

### 예시 1: 완전 새 프로젝트 시작
```
입력: "할일 관리 앱 만들어줘"
→ build 의도 감지
→ claudedocs/ 없음 → init부터 풀 체인 자동 실행
→ init → plan → design → build → review (중단 없이 연속)
```

### 예시 2: 이미 초기화된 프로젝트
```
입력: "쇼핑몰 만들어줘"
→ build 의도 감지
→ claudedocs/ 있음, PRD 없음 → plan부터 풀 체인 자동 실행
→ plan → design → build → review (init 스킵)
```

### 예시 3: 설계부터 요청
```
입력: "기술 설계해줘"
→ design 의도 감지
→ PRD 있음 → design부터 풀 체인 자동 실행
→ design → build → review (중단 없이 연속)
```

### 예시 4: 검증만 요청
```
입력: "코드 제대로 됐는지 확인해줘"
→ review 의도 감지
→ PRD + TECH_SPEC + src/ 있음 → review 실행
```

### 예시 5: 입력 없이 실행
```
입력: (없음)
→ 프로젝트 상태 확인
→ 다음 필요한 단계 자동 감지
→ 해당 단계부터 review까지 풀 체인 자동 실행
```
