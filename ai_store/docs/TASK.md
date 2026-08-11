# 구현 작업 목록

> 출처: docs/PRD.md, docs/TECH_SPEC.md
> 파일 완성 시 즉시 체크. 일괄 체크 금지.
> 총 133개 항목 (TECH_SPEC 4장 트리 127 + 스택 채택상 필수 6)

## 구현 순서 원칙
설정/인프라 → 타입 → lib → server(도메인) → 서버 액션 → 컴포넌트 → 페이지 → API 라우트 → 테스트

예외 2건 (의존 관계상 불가피, 근거 명시):
- `prisma/seed.ts`는 `preview_text` 생성을 위해 `server/templates/preview.ts`에 의존 → Step 4에 배치
- `src/app/actions/*`는 컴포넌트가 import하므로 server 직후·컴포넌트 직전에 배치

---

## 체크리스트

### 0. 프로젝트 초기화
- [x] `package.json` — 의존성·스크립트·prisma seed 훅 (인프라)
- [x] `tsconfig.json` — strict TS + `@/*` 경로 별칭
- [x] `next.config.ts` — next-intl 플러그인, 빌드 옵션
- [x] `postcss.config.mjs` — Tailwind/Autoprefixer 파이프라인
- [x] `tailwind.config.ts` — 반응형 브레이크포인트, 명도 대비 토큰 (비기능: 360px·4.5:1)
- [x] `components.json` — shadcn CLI 설정 ※스택 채택상 필수
- [x] `src/app/globals.css` — Tailwind 지시문 ※스택 채택상 필수
- [x] `src/lib/utils.ts` — `cn()` 유틸 (shadcn 6개 컴포넌트 전부가 의존) ※스택 채택상 필수
- [x] `.env.example` — TECH_SPEC 9장 환경 변수 템플릿
- [x] `docker-compose.yml` — Postgres 16 + cron 컨테이너
- [x] `docker/postgres/init/001-extensions.sql` — citext/pg_trgm/pgcrypto 확장 (TECH_SPEC 10장 명시)
- [x] `vitest.config.ts` — 단위 테스트 러너·경로 별칭
- [x] `playwright.config.ts` — E2E 러너·뷰포트(360/768/1280)

### 1. 스키마 · 메시지 · i18n
- [x] `prisma/schema.prisma` — TECH_SPEC 3장 데이터 모델 단일 소스 (F1-AC8, F2-AC3/6/7/8/11/12, F3-AC1/4/6/9)
- [x] `prisma/migrations/0001_init/migration.sql` — 확장·인덱스·부분 유니크 제약 (F1-AC3, F2-AC6, F2-AC7, F3-AC1)
- [x] `messages/ko.json` — 한국어 UI 문구 (F1-AC5/7, F2-AC1/11/12, F3-AC7/9)
- [x] `messages/en.json` — 영어 문구, ko와 키 동기화 (비기능: ko/en)
- [x] `src/i18n/routing.ts` — 로케일 목록·기본 로케일 (의존: messages/*)
- [x] `src/i18n/request.ts` — 요청별 메시지 로딩 (의존: routing.ts)

### 2. 타입 정의
- [x] `src/types/domain.ts` — OrderStatus/Currency/TemplatePreviewView (F1-AC6, F2-AC5, F3-AC2)
- [x] `src/types/api.ts` — API 요청/응답 DTO (의존: domain.ts)

### 3. 유틸 lib + middleware
- [x] `src/lib/env.ts` — Zod 환경 변수 부팅 검증
- [x] `src/lib/errors.ts` — AppError 계층 (F2-AC5/7, F3-AC5/9)
- [x] `src/lib/logger.ts` — orderNo 상관관계 ID 구조화 로그 (의존: env.ts)
- [x] `src/lib/http.ts` — `jsonOk`/`jsonError` (의존: errors.ts)
- [x] `src/lib/db.ts` — PrismaClient 싱글턴, server-only (의존: env.ts, schema.prisma)
- [x] `src/lib/auth.ts` — Auth.js v5 Credentials + argon2 + Prisma Adapter (F3-AC4, F3-AC8)
- [x] `src/lib/auth-guard.ts` — `requireUser()`/`requireOwner()` (F3-AC5, F3-AC8)
- [x] `src/middleware.ts` — next-intl 로케일 + 보호 경로 `callbackUrl` 리다이렉트 (F3-AC8)

### 4. 도메인 서비스 (server)
- [x] `src/server/templates/preview.ts` — `buildPreview()` 앞 30% 상한 마스킹 (F1-AC5, F1-AC6)
- [x] `prisma/seed.ts` — 카테고리·템플릿 초기 등록 (의존: preview.ts) (F1-AC1/2/3 검증 데이터)
- [x] `src/server/templates/template.repository.ts` — `body` 제외 select 강제 (F1-AC1/3/6)
- [x] `src/server/templates/template.service.ts` — 목록/검색/필터/상세 (F1-AC1/2/3/4/8)
- [x] `src/server/orders/order-number.ts` — 주문번호 생성 (F2-AC4)
- [x] `src/server/orders/order.state-machine.ts` — 전이표 + `assertTransition` (F2-AC5/6/9/10/12)
- [x] `src/server/orders/order.repository.ts` — 영속화 + `FOR UPDATE` (F2-AC3/6/8/11)
- [x] `src/server/payments/provider.types.ts` — `PaymentProvider` 인터페이스 (F2-AC2/3/5)
- [x] `src/server/payments/toss/toss.signature.ts` — HMAC-SHA256 + ±5분 (F2-AC3/5)
- [x] `src/server/payments/toss/toss.client.ts` — Toss API 호출 (F2-AC3/8/11/12)
- [x] `src/server/payments/toss/toss.provider.ts` — Toss PaymentProvider 구현 (F2-AC2/3/10/12)
- [x] `src/server/payments/paddle/paddle.signature.ts` — `Paddle-Signature` ts/h1 검증 (F2-AC3/5)
- [x] `src/server/payments/paddle/paddle.client.ts` — Paddle API 호출 (F2-AC3/8/12)
- [x] `src/server/payments/paddle/paddle.provider.ts` — Paddle PaymentProvider 구현 (F2-AC2/3/10/12)
- [x] `src/server/payments/provider.registry.ts` — 통화→구현체 매핑, IP 참조 금지 (F2-AC2)
- [x] `src/server/orders/order.service.ts` — startCheckout/confirmOrderPaid/markOrderFailed/expireOrder (F2-AC1/3/6/7/8/9/10/11)
- [x] `src/server/library/access.ts` — `assertTemplateAccess()` 단일 게이트 (F1-AC8, F3-AC5/9)
- [x] `src/server/library/library.service.ts` — 목록/전문 조회/열람 기록 (F3-AC1/2/3/4/6, F2-AC12)
- [x] `src/server/refunds/refund.policy.ts` — 7일 + 미열람 자격 판정 (F2-AC12)
- [x] `src/server/refunds/refund.service.ts` — 환불 접수·완료, REVOKED 전환 (F2-AC12, F3-AC9)
- [x] `src/server/mail/templates/purchase-confirmation.tsx` — 구매 확인 메일 (F2-AC4)
- [x] `src/server/mail/templates/reconciliation-report.tsx` — 미확정 결제 운영자 리포트 (F2-AC11)
- [x] `src/server/mail/mailer.ts` — `outbound_emails` 유니크 기반 멱등 발송 (F2-AC4/11)
- [x] `src/server/payments/webhook.repository.ts` — `webhook_events` 멱등 선점 (F2-AC6)
- [x] `src/server/payments/webhook.handler.ts` — 서명→선점→재조회→전이 파이프라인 (F2-AC3/5/6/10)
- [x] `src/server/jobs/cron-auth.ts` — `x-cron-secret` 검증
- [x] `src/server/jobs/expire-orders.job.ts` — 30분 경과 PENDING 만료 (F2-AC9)
- [x] `src/server/jobs/reconcile-payments.job.ts` — 자동 재조회 배치 + 리포트 (F2-AC3/5/9/11)

### 5. 서버 액션
- [x] `src/app/actions/auth.actions.ts` — `signUpAction` (F3-AC8)
- [x] `src/app/actions/checkout.actions.ts` — `startCheckoutAction` (F2-AC1/2/7/12)
- [x] `src/app/actions/library.actions.ts` — `markFirstViewAction` (F2-AC12, F3-AC2)
- [x] `src/app/actions/refund.actions.ts` — `requestRefundAction` (F2-AC12)

### 6. 컴포넌트
- [x] `src/components/ui/button.tsx` — 공통 버튼 (접근성: 포커스 링)
- [x] `src/components/ui/input.tsx` — 공통 입력
- [x] `src/components/ui/badge.tsx` — 상태·카테고리 뱃지
- [x] `src/components/ui/dialog.tsx` — 모달, 포커스 트랩
- [x] `src/components/ui/skeleton.tsx` — 로딩 플레이스홀더
- [x] `src/components/ui/toast.tsx` — 토스트 `aria-live` (F3-AC2)
- [x] `src/components/ui/toaster.tsx` + `use-toast.ts` — toast 부속 ※shadcn toast 단일 파일 미동작
- [x] `src/components/layout/LocaleSwitcher.tsx` — ko/en 전환
- [x] `src/components/layout/Header.tsx` — 헤더·세션 표시
- [x] `src/components/layout/Footer.tsx` — 약관·환불 정책 링크 (F2-AC12 보조)
- [x] `src/components/templates/TemplateCard.tsx` — KRW/USD 병기 카드 (F1-AC1)
- [x] `src/components/templates/TemplateGrid.tsx` — 반응형 그리드 (F1-AC1)
- [x] `src/components/templates/CategoryFilter.tsx` — 카테고리 선택·현재 표시 (F1-AC2)
- [x] `src/components/templates/SearchBar.tsx` — 디바운스 검색 → URL (F1-AC3)
- [x] `src/components/templates/Pagination.tsx` — 20개 단위 (F1-AC1)
- [x] `src/components/templates/PreviewPanel.tsx` — 마스킹 미리보기 + 잠금 문구 (F1-AC5/6)
- [x] `src/components/templates/EmptyResult.tsx` — 0건 안내 (F1-AC7)
- [x] `src/components/templates/RetryError.tsx` — 오류 + 재시도 (F1-AC9)
- [x] `src/components/checkout/CurrencySelector.tsx` — KRW/USD 명시 선택 (F2-AC1/2)
- [x] `src/components/checkout/PriceSummary.tsx` — 최종 결제 금액 (F2-AC1/8)
- [x] `src/components/checkout/RefundPolicyConsent.tsx` — 정책 고지 + 동의 (F2-AC12)
- [x] `src/components/checkout/CheckoutButton.tsx` — 결제 트리거 (F2-AC1/2/7)
- [x] `src/components/checkout/PaddleCheckoutLauncher.tsx` — Paddle.js 오버레이 (F2-AC2)
- [x] `src/components/checkout/OrderStatusPoller.tsx` — 폴링 → PAID 자동 이동 (F2-AC5/11)
- [x] `src/components/library/LibraryList.tsx` — 구매일 최신순 (F3-AC1/4)
- [x] `src/components/library/LibraryEmpty.tsx` — 구매 없음 안내 (F3-AC7)
- [x] `src/components/library/PromptViewer.tsx` — 전문 + 마지막 수정일 (F3-AC2/6/9)
- [x] `src/components/library/CopyButton.tsx` — 클립보드 복사 + 토스트 (F3-AC2)
- [x] `src/components/library/DownloadButton.tsx` — 다운로드 호출 (F3-AC3)
- [x] `src/components/orders/OrderSummary.tsx` — 상태·금액·실패 사유 (F2-AC10/11)
- [x] `src/components/orders/RefundRequestForm.tsx` — 환불 요청 폼 (F2-AC12)

### 7. 페이지
- [x] `src/app/layout.tsx` — 루트 레이아웃 ※next-intl 구성상 필수
- [x] `src/app/[locale]/layout.tsx` — NextIntlClientProvider + Header/Footer
- [x] `src/app/[locale]/loading.tsx` — 스트리밍 로딩
- [x] `src/app/[locale]/error.tsx` — 목록 오류 경계 (F1-AC9)
- [x] `src/app/[locale]/not-found.tsx` — 404 안내 (F1-AC8 보조)
- [x] `src/app/[locale]/page.tsx` — 템플릿 목록 (F1-AC1/2/3/7)
- [x] `src/app/[locale]/templates/[slug]/page.tsx` — 상세 + 미리보기 (F1-AC4/5/6/8, F2-AC7)
- [x] `src/app/[locale]/templates/[slug]/error.tsx` — 상세 오류 경계 (F1-AC9)
- [x] `src/app/[locale]/login/page.tsx` — 로그인 + callbackUrl (F3-AC8)
- [x] `src/app/[locale]/signup/page.tsx` — 이메일 회원가입
- [x] `src/app/[locale]/checkout/[slug]/page.tsx` — 통화 선택 결제 (F2-AC1/2/7/8/12)
- [x] `src/app/[locale]/checkout/status/[orderNo]/page.tsx` — 결제 확인 중 (F2-AC5/10/11)
- [x] `src/app/[locale]/library/page.tsx` — 내 라이브러리 (F3-AC1/4/7)
- [x] `src/app/[locale]/library/[templateId]/page.tsx` — 전문 열람 (F3-AC2/3/5/6/9)
- [x] `src/app/[locale]/orders/[orderNo]/page.tsx` — 주문 상세 + 환불 (F2-AC4/10/12)

### 8. API 라우트
- [x] `src/app/api/auth/[...nextauth]/route.ts` — Auth.js 핸들러 (F3-AC4/8)
- [x] `src/app/api/auth/signup/route.ts` — 회원가입 API (409 EMAIL_TAKEN)
- [x] `src/app/api/templates/route.ts` — 목록·검색 API, body 미포함 (F1-AC1/2/3/6)
- [x] `src/app/api/templates/[slug]/route.ts` — 상세 API, body 미포함 (F1-AC4/6/8)
- [x] `src/app/api/checkout/route.ts` — 결제 시작 (409 ALREADY_OWNED) (F2-AC1/2/7/8/12)
- [x] `src/app/api/checkout/toss/return/route.ts` — Toss 리디렉션 → CONFIRMING (F2-AC5/11)
- [x] `src/app/api/checkout/toss/fail/route.ts` — Toss 실패 처리 (F2-AC10)
- [x] `src/app/api/checkout/paddle/return/route.ts` — Paddle 리디렉션 → CONFIRMING (F2-AC5/11)
- [x] `src/app/api/webhooks/toss/route.ts` — 토스 웹훅 (nodejs runtime, raw body) (F2-AC3/5/6/10)
- [x] `src/app/api/webhooks/paddle/route.ts` — Paddle 웹훅 (F2-AC3/5/6/10/12)
- [x] `src/app/api/orders/[orderNo]/route.ts` — 주문 폴링, 타인 404 (F2-AC5/10/11)
- [x] `src/app/api/orders/[orderNo]/refund/route.ts` — 환불 접수 (422) (F2-AC12)
- [x] `src/app/api/library/route.ts` — 라이브러리 목록 (F3-AC1/4)
- [x] `src/app/api/library/[templateId]/download/route.ts` — 파일 다운로드 (F3-AC3/5/9)
- [x] `src/app/api/cron/reconcile-payments/route.ts` — 재조회 배치 (F2-AC3/11)
- [x] `src/app/api/cron/expire-orders/route.ts` — 만료 배치 (F2-AC9)
- [x] `src/server/auth/user.service.ts` — 회원 생성 공용 로직(해싱·중복 이메일 판정) ※서버 액션과 signup API의 보안 로직 이중 구현 방지, 호출자 승인

### 9. 테스트
- [x] `tests/unit/preview.test.ts` — 마스킹 30% 경계 (F1-AC5/6)
- [x] `tests/unit/order.state-machine.test.ts` — 전이표·금지 전이 (F2-AC5/9/10)
- [x] `tests/unit/toss.signature.test.ts` — 서명·타임스탬프 (F2-AC3/5)
- [x] `tests/unit/paddle.signature.test.ts` — Paddle 서명 (F2-AC3/5)
- [x] `tests/unit/refund.policy.test.ts` — 자격 판정 (F2-AC12)
- [x] `tests/unit/webhook.idempotency.test.ts` — 반복 웹훅 1건 처리 (F2-AC6)
- [x] `tests/e2e/browse.spec.ts` — 기능 1 + 원문 부재 단언 (F1-AC1~9)
- [x] `tests/e2e/checkout-krw.spec.ts` — KRW 결제·중복 차단 (F2-AC1~12)
- [x] `tests/e2e/checkout-usd.spec.ts` — USD 결제 (F2-AC1/2/3/5)
- [x] `tests/e2e/library.spec.ts` — 목록·복사·다운로드·접근 거부 (F3-AC1~9)

---

## 수용 기준 매핑 (30/30)

| PRD 수용 기준 | 담당 파일 |
|---|---|
| F1-AC1 목록 20개 단위 표시 | template.service.ts, TemplateCard.tsx, TemplateGrid.tsx, Pagination.tsx, [locale]/page.tsx, api/templates/route.ts |
| F1-AC2 카테고리 필터 | template.service.ts, CategoryFilter.tsx, [locale]/page.tsx |
| F1-AC3 키워드 검색 | migration.sql(pg_trgm), template.service.ts, SearchBar.tsx |
| F1-AC4 상세 표시 항목 | template.service.ts, templates/[slug]/page.tsx |
| F1-AC5 30% 마스킹 미리보기 | preview.ts, PreviewPanel.tsx |
| F1-AC6 원문 미노출 | domain.ts, preview.ts, template.repository.ts, api/templates/* |
| F1-AC7 검색 0건 안내 | EmptyResult.tsx, [locale]/page.tsx |
| F1-AC8 판매 중지 처리 | schema.prisma, template.service.ts, access.ts, templates/[slug]/page.tsx |
| F1-AC9 로드 실패 재시도 | RetryError.tsx, error.tsx (2종) |
| F2-AC1 통화 명시 선택·금액 표시 | order.service.ts, checkout.actions.ts, CurrencySelector.tsx, PriceSummary.tsx |
| F2-AC2 KRW→Toss / USD→Paddle | provider.registry.ts, CurrencySelector.tsx, PaddleCheckoutLauncher.tsx |
| F2-AC3 웹훅 확정 | order.service.ts, webhook.handler.ts, api/webhooks/* |
| F2-AC4 구매 확인 메일 | order-number.ts, purchase-confirmation.tsx, mailer.ts |
| F2-AC5 리디렉션 확정 금지 | order.state-machine.ts, webhook.handler.ts, OrderStatusPoller.tsx, checkout/*/return |
| F2-AC6 웹훅 멱등 | migration.sql, webhook.repository.ts, webhook.handler.ts |
| F2-AC7 중복 구매 차단 | schema.prisma, order.service.ts, CheckoutButton.tsx, api/checkout/route.ts |
| F2-AC8 표시 금액 고정 | order.repository.ts, order.service.ts, PriceSummary.tsx |
| F2-AC9 30분 만료 | order.service.ts, expire-orders.job.ts, api/cron/expire-orders |
| F2-AC10 결제 실패 처리 | order.service.ts, OrderSummary.tsx, checkout/toss/fail |
| F2-AC11 확정 지연 구제 | reconcile-payments.job.ts, reconciliation-report.tsx, mailer.ts, api/cron/reconcile-payments |
| F2-AC12 환불 정책 | refund.policy.ts, refund.service.ts, RefundPolicyConsent.tsx, RefundRequestForm.tsx |
| F3-AC1 구매일 최신순 목록 | library.service.ts, LibraryList.tsx, library/page.tsx |
| F3-AC2 전문 표시·복사 | library.service.ts, PromptViewer.tsx, CopyButton.tsx |
| F3-AC3 다운로드 | library.service.ts, DownloadButton.tsx, api/library/[templateId]/download |
| F3-AC4 계정 귀속 | auth.ts, library.service.ts, library/page.tsx |
| F3-AC5 미구매 접근 거부 | access.ts, library/[templateId]/page.tsx, download route |
| F3-AC6 최신 버전·수정일 | schema.prisma, library.service.ts, PromptViewer.tsx |
| F3-AC7 구매 없음 안내 | LibraryEmpty.tsx, library/page.tsx |
| F3-AC8 로그인 후 원위치 복귀 | auth.ts, middleware.ts, login/page.tsx |
| F3-AC9 환불건 열람 차단 | access.ts, refund.service.ts, PromptViewer.tsx |

---

## 보류 (이번 범위 밖)

TECH_SPEC 4장 트리에 없어 구현하지 않음. 채택 여부는 별도 결정 필요.

- `tests/integration/` — TECH_SPEC 8장이 F2-AC3/4/6/8/10/11에 Integration 테스트를 요구하지만 4장에 대응 파일이 없음. 미구현 시 해당 6개 AC는 unit + E2E로만 간접 검증됨
- F2-AC12 환불 전용 E2E 스펙 — 4장에 없어 checkout 스펙 내부에 포함

## 구현 전 확정 필요 (TECH_SPEC 11장)

- **N3 Toss 승인(confirm) 시점** — 사용자가 리디렉션 전 브라우저를 닫으면 승인 누락. 재조회 배치가 승인까지 대행하는 것으로 가정하고 구현
- **N7 금액 불일치 시 자동 환불 여부** — 불일치 시 확정 보류 + INCIDENT 기록으로 가정
- **N8 통화 변경 재시도 충돌** — 서로 다른 통화 PENDING 동시 성공 시 후속 건 실패. 후속 건 자동 환불 대상 표시로 가정
