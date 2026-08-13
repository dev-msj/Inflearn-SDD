# SDD 대시보드

진행 중인 프로젝트가 SDD를 제대로 따르고 있는지 모니터링 할 수 있는 웹 구현.

1. Github OAuth 로그인
2. Repo 선택 + 파일 트리
3. PRD, TECH-SPEC 업로드
4. SDD 준수 검증 리포트

## 구현 절차

1. `/sdd-init`으로 todolist 프로젝트를 초기화하여 필요한 파일과 디렉토리를 생성
2. `/sdd-toolkit:sdd-plan github 로그인하면 내 활동 데이터를 gemini api로 분석해줘 linkedin, x, 블로그용 콘텐츠를 자동 생성하는 대시보드 만들어줘` 요청
   1. 간단한 클로드 질문들에 답변하여 요구사항을 정의
   2. sdd-toolkit의 plannder 에이전트가 PRD 문서 산출
3. `/sdd-design` 요청
   1. sdd-toolkit의 architect 에이전트가 PRD 문서를 기반으로 TECH SPEC 문서 산출
4. `/sdd-build` 요청
   1. sdd-toolkit의 developer 에이전트가 TECH SPEC 문서를 기반으로 코드를 생성
5. `/sdd-review` 요청
   1. sdd-toolkit의 reviewer 에이전트가 PRD, TECH SPEC 문서를 기반으로 코드를 리뷰
6. 실제 코드를 실행하여 동작 확인

---

# Marketing Dashboard (산출 애플리케이션)

GitHub 공개 활동을 기간별로 모아 Gemini로 분석하고, LinkedIn·X·블로그 초안을 생성하는 1인용 로컬 대시보드.

- 사양: [`docs/PRD.md`](docs/PRD.md), [`docs/TECH_SPEC.md`](docs/TECH_SPEC.md)
- 스택: Next.js 15 (App Router) · React 19 · TypeScript 5.9 · Tailwind CSS v4 · iron-session · `@google/genai` · zod · Vitest

## 실행 방법

```bash
npm install
cp .env.example .env.local   # 값 채우기 (아래 "환경 변수" 참고)
npm run dev                  # http://localhost:3000
```

| 스크립트 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 실행 |
| `npm run build` / `npm start` | 프로덕션 빌드 / 실행 |
| `npm run lint` | ESLint 9 검사 |
| `npm test` | Vitest 단위 테스트 (`src/lib/__tests__`) |
| `npm run typecheck` | `tsc --noEmit` 타입 검사 |

## GitHub OAuth App 등록

1. GitHub → Settings → Developer settings → **OAuth Apps** → **New OAuth App**
2. 입력 값
   - **Application name**: 임의 (예: `marketing-dashboard-local`)
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/api/auth/callback`
3. 생성 후 **Client ID** 확인, **Generate a new client secret** 으로 시크릿 발급
4. 두 값을 `.env.local`의 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` 에 입력

요청 scope는 `read:user` 하나로 고정된다. 활동은 `GET /users/{login}/events/public` 으로만 수집하므로 **공개 저장소 활동만** 집계된다(비공개 저장소 접근 권한을 요구하지 않는다).

## 환경 변수

`.env.local` 에 설정한다. 모두 **서버 전용**이며 `NEXT_PUBLIC_` 접두사를 붙이면 안 된다(붙이면 클라이언트 번들에 노출된다).

| 변수 | 필수 | 설명 |
|---|---|---|
| `GITHUB_CLIENT_ID` | ✅ | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | ✅ | GitHub OAuth App Client Secret |
| `GITHUB_OAUTH_REDIRECT_URI` | ✅ | 예: `http://localhost:3000/api/auth/callback` (OAuth App 콜백 URL과 동일해야 함) |
| `SESSION_SECRET` | ✅ | iron-session 암호화 키. **32자 이상** |
| `ALLOWED_GITHUB_LOGINS` | ⭕ | 쉼표 구분 로그인 ID 화이트리스트. 비우면 전체 허용 |
| `GEMINI_API_KEY` | ✅ | [Google AI Studio](https://aistudio.google.com/apikey) 에서 발급 |
| `GEMINI_MODEL` | ⭕ | 기본값 `gemini-2.5-flash` |

`SESSION_SECRET` 생성 예시:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 접근 화이트리스트 설정

`ALLOWED_GITHUB_LOGINS` 는 OAuth 콜백에서 로그인 ID를 검사한다.

- **비워 두면 전체 허용** — 로컬 전용 모드. 로컬에서 혼자 쓸 때 권장.
- 값이 있으면 목록에 포함된 로그인 ID만 세션이 발급되고, 그 외 계정은 `/?error=forbidden` 으로 리다이렉트되어 "이 계정은 접근이 허용되지 않았습니다." 메시지를 본다.

```dotenv
# 한 명만 허용
ALLOWED_GITHUB_LOGINS=my-github-id

# 여러 명 (쉼표 구분, 공백 허용)
ALLOWED_GITHUB_LOGINS=my-github-id, teammate-id
```

## 데이터 보관

- 세션(GitHub 액세스 토큰 포함)은 AES-GCM 암호화 쿠키 `md_session`(TTL 8시간)에만 저장된다. DB는 사용하지 않는다.
- 활동·분석·초안은 브라우저 `localStorage` 에 **최근 1세션 스냅샷 1개**만 보관되며, 새 생성 시 덮어쓰고 "초기화"·로그아웃 시 삭제된다.
