---
name: sdd-init
description: "SDD 프로젝트 초기화 및 폴더 구조 생성. 프로젝트 시작, 초기 세팅, sdd init 요청 시 사용."
category: sdd
complexity: basic
allowed-tools: [Bash, Write]
---

# /sdd-init - SDD 프로젝트 초기화

## 동작
SDD 워크플로우에 필요한 기본 폴더 구조와 파일을 생성합니다.

## 🔴 기존 파일 보호 규칙 (CRITICAL)

**이미 존재하는 파일/폴더는 절대 덮어쓰거나 삭제하지 않는다.**

```bash
# 디렉토리: 없을 때만 생성
[ ! -d claudedocs ] && mkdir -p claudedocs
[ ! -d src ] && mkdir -p src

# 파일: 없을 때만 생성
[ ! -f claudedocs/PRD.md ] && echo "..." > claudedocs/PRD.md
[ ! -f claudedocs/TECH_SPEC.md ] && echo "..." > claudedocs/TECH_SPEC.md
```

**금지 행위:**
- `rm -rf` 로 기존 디렉토리 삭제 후 재생성
- `cp -R source/* dest/` 로 전체 디렉토리 덮어쓰기
- 기존 PRD.md, TECH_SPEC.md, HANDOFF_*.md 내용 초기화
- `.claude/` 디렉토리 내 파일 변경

---

## 실행 순서

### Step 1: 기존 구조 확인
이미 존재하는 파일과 폴더를 먼저 확인하고, 없는 것만 생성한다.

```bash
# 현재 상태 확인
ls -la claudedocs/ 2>/dev/null
ls -la src/ 2>/dev/null
```

### Step 2: 폴더 구조 생성 (없는 것만)
```bash
[ ! -d claudedocs ] && mkdir -p claudedocs
[ ! -d src ] && mkdir -p src
```

### Step 3: 빈 문서 파일 생성 (없는 것만)
- `claudedocs/PRD.md` - 빈 PRD 템플릿 (헤더만) — **이미 있으면 스킵**
- `claudedocs/TECH_SPEC.md` - 빈 TECH_SPEC 템플릿 (헤더만) — **이미 있으면 스킵**

### Step 4: 결과 확인

---

## 생성할 구조

```
[프로젝트명]/
├── claudedocs/
│   ├── PRD.md            # → /sdd-plan에서 작성
│   └── TECH_SPEC.md      # → /sdd-design에서 작성
└── src/                  # → /sdd-build에서 코드 생성
```

## PRD.md 초기 내용 (파일이 없을 때만 생성)

```markdown
# PRD: [프로젝트명]

> 이 문서는 /sdd-plan 명령으로 작성됩니다.
> 아직 작성되지 않았습니다.
```

## TECH_SPEC.md 초기 내용 (파일이 없을 때만 생성)

```markdown
# TECH_SPEC: [프로젝트명]

> 이 문서는 /sdd-design 명령으로 작성됩니다.
> PRD.md가 먼저 작성되어야 합니다.
```

## 완료 메시지

```
✅ SDD 프로젝트 초기화 완료

[프로젝트명]/
├── claudedocs/
│   ├── PRD.md          (빈 템플릿 | 기존 유지)
│   └── TECH_SPEC.md    (빈 템플릿 | 기존 유지)
└── src/                (생성됨 | 기존 유지)

🛡️ 기존 파일 보호: [보호된 파일 목록]

다음 단계: /sdd-plan [아이디어] 로 PRD를 작성하세요.
```
