# TECH_SPEC: ai_store (AI 프롬프트 템플릿 스토어)

> PRD 참조: `docs/PRD.md` (기능 3개 / 수용 기준 30개)
> 작성일: 2026-08-10
> 대상 범위: MVP (PRD 기능 1·2·3만. Out of Scope 항목은 설계에서도 제외)

## 확정된 상위 기술 결정 (PRD Open Question 해소분)

| # | 결정 사항 | 내용 | 관련 PRD Open Question |
|---|---|---|---|
| D1 | 아키텍처 | Next.js(App Router) + TypeScript 단일 풀스택 앱. 별도 백엔드 서버 없음 | - |
| D2 | 데이터베이스 | PostgreSQL 16, 로컬/개발은 `docker-compose`로 구동 | - |
| D3 | 인증 | 이메일 회원가입 기반 자체 계정 (소셜 로그인 없음) | PRD 비기능 요구사항 |
| D4 | 가격 정책 | **통화별 개별 고정가**. 템플릿마다 `price_krw`, `price_usd`를 각각 저장. 환율 API·환산·반올림 규칙 없음 | Q9 해결 |
| D5 | 웹훅 미도착 구제 | **자동 재조회 배치**. 미확정 결제 건을 주기적으로 결제사 조회 API로 확인해 자동 확정. 운영자 수동 확정 화면 없음 | Q5 해결 |
| D6 | 주문 확정 기준 | 리디렉션 확정 금지. 웹훅 수신 + 결제사 조회 API 재확인을 통과한 건만 `PAID` 전이 | PRD F2-AC5 |

---

## 1. 기술 스택

| 구분 | 기술 | 버전 | 선정 근거 |
|------|------|------|----------|
| Framework | Next.js (App Router) | 15.x | 서버 컴포넌트/서버 액션/Route Handler가 한 앱에 통합되어, 웹훅 수신·프롬프트 마스킹·소유권 검증을 모두 서버 경계 안에서 처리 가능. 별도 백엔드 없이 MVP 범위를 커버 |
| Language | TypeScript | 5.6+ | 결제 상태 머신·Provider 추상화를 타입으로 강제. 상태 전이 누락을 컴파일 타임에 검출 |
| Runtime | Node.js | 22 LTS | 웹훅 서명 검증에 `node:crypto`(HMAC, `timingSafeEqual`) 필요. Edge 런타임은 raw body/crypto 제약이 있어 결제 라우트는 `runtime = 'nodejs'` 고정 |
| DB | PostgreSQL | 16 | 주문 확정에 트랜잭션·행 잠금(`FOR UPDATE`)·부분 유니크 인덱스가 필수. 중복 지급 방지를 애플리케이션이 아닌 DB 제약으로 보장 |
| ORM | Prisma | 5.20+ | 스키마 단일 소스 → 타입 생성 → 마이그레이션까지 일관. `$transaction`으로 웹훅 처리 원자성 확보, `select`로 `body` 컬럼 제외를 타입 수준에서 강제(마스킹 누출 방지에 직접 기여). Drizzle 대비 마이그레이션/시드 도구가 성숙해 1인 운영 MVP에 적합 |
| 검색 | PostgreSQL `pg_trgm` + GIN | (확장) | 제목·설명 부분 일치(ILIKE) 검색이 요구 범위 전부. 한국어 형태소 분석이 필요 없고 별도 검색 엔진 도입은 오버엔지니어링. PRD 성능 기준(1초 이내) 충족 |
| Auth | Auth.js (NextAuth) v5 + Credentials Provider + Prisma Adapter | 5.x | 이메일/비밀번호 자체 계정을 지원하면서 세션을 DB에 저장. `callbackUrl` 기본 지원으로 "로그인 후 원래 화면 복귀"(F3-AC8)를 표준 기능으로 해결 |
| 비밀번호 해시 | argon2id (`@node-rs/argon2`) | 2.x | PRD 보안 요구("복구 불가능한 형태 저장"). bcrypt 대비 메모리 하드, 72바이트 입력 제한 없음 |
| Styling | Tailwind CSS | 3.4+ | 360px 이상 반응형과 명도 대비 토큰을 유틸리티로 일괄 관리 |
| UI | shadcn/ui (Radix 기반) | latest | 컴포넌트 소스가 저장소에 복사되어 커스터마이즈 자유. Radix가 키보드 조작·포커스 트랩을 기본 제공해 접근성 요구 충족 |
| i18n | next-intl | 3.x | App Router 라우트 세그먼트(`/[locale]`) 기반 ko/en 2개 언어. 서버 컴포넌트에서 번역 접근 가능 |
| 결제 (KRW) | 토스페이먼츠 결제창 SDK + Payments API v1 | `@tosspayments/tosspayments-sdk` 2.x | PRD 기술 제약으로 고정 |
| 결제 (USD) | Paddle Billing (Paddle.js + API v1) | `@paddle/paddle-js`, `@paddle/paddle-node-sdk` | PRD 기술 제약으로 고정. Merchant of Record 구조 전제 |
| 메일 | Resend + React Email | 4.x / 3.x | 구매 확인 메일 1종 + 운영자 리포트 1종이 전부. SMTP 서버 운영 없이 발송 상태(messageId) 추적 가능 |
| 스케줄러 | Route Handler + cron 컨테이너(`docker-compose`의 `ofelia`) / 운영은 플랫폼 Cron | - | 재조회 배치를 위해 큐·워커 인프라를 도입하지 않음. HTTP 엔드포인트를 `CRON_SECRET`으로 보호하고 주기 호출. 배치 로직은 서비스 계층 재사용 |
| 검증 | Zod | 3.23+ | 요청 바디·환경 변수·웹훅 페이로드 파싱을 런타임에서 검증 |
| 테스트 | Vitest + Playwright | 2.x / 1.4x | 마스킹·상태 머신·서명 검증은 단위 테스트, 3개 기능의 사용자 흐름은 E2E |

### 채택하지 않은 선택지

| 후보 | 미채택 사유 |
|---|---|
| Supabase / 관리형 DB | 로컬 Docker Postgres로 결정됨(D2). 웹훅 처리에 필요한 트랜잭션 제어를 직접 다루는 편이 명확 |
| BullMQ + Redis 워커 | 배치가 2종(재조회, 만료)뿐. Redis 추가 운영 비용 대비 이득 없음 |
| Elasticsearch / Meilisearch | 검색 요구가 제목·설명 부분 일치 수준 |
| Stripe 등 제3의 PG | PRD 기술 제약이 토스페이먼츠·Paddle로 한정 |
| 상태 관리 라이브러리(Redux/Zustand) | 서버 컴포넌트 + URL 쿼리스트링(검색·카테고리·페이지) + 로컬 `useState`로 충분 |

---

## 2. 시스템 아키텍처

### 2.1 구성 개요

```
                 ┌──────────────────────────────────────────────┐
  브라우저 ─────▶ │  Next.js App (App Router, Node.js runtime)    │
                 │                                              │
                 │  [RSC 페이지]   목록/상세/결제/라이브러리       │
                 │  [Server Action] 회원가입, 결제 시작, 열람 기록 │
                 │  [Route Handler] /api/*, /api/webhooks/*      │
                 │  [Service 계층]  templates / orders / payments │
                 │                  library / refunds / jobs      │
                 └───────┬───────────────────┬──────────────────┘
                         │ Prisma            │ HTTPS
                         ▼                   ▼
                 ┌───────────────┐   ┌──────────────────────────┐
                 │ PostgreSQL 16 │   │ 토스페이먼츠 API (KRW)    │
                 │ (Docker)      │   │ Paddle API (USD)         │
                 └───────────────┘   │ Resend (메일)             │
                         ▲           └───────────┬──────────────┘
                         │                       │ 웹훅(POST)
                         │           ┌───────────▼──────────────┐
                         └───────────┤ /api/webhooks/{toss,paddle}│
                                     └──────────────────────────┘
                 ┌──────────────────────────────────────────────┐
   cron 컨테이너 ─▶ POST /api/cron/reconcile-payments (2분)       │
                 └▶ POST /api/cron/expire-orders     (5분)       │
                 └──────────────────────────────────────────────┘
```

### 2.2 계층 규칙

- **페이지/컴포넌트 계층**: 데이터 접근 금지. 서버 컴포넌트가 서비스 계층만 호출.
- **서비스 계층(`src/server/**`)**: 도메인 규칙(상태 전이, 소유권, 환불 정책, 마스킹)을 전담. Route Handler·Server Action·배치가 모두 **동일한 서비스 함수**를 호출한다. → 웹훅 경로와 배치 경로가 같은 확정 로직을 공유해 결과가 갈리지 않음.
- **`server-only` 패키지**: `src/server/**`, `src/lib/db.ts`, 마스킹 모듈 상단에 `import 'server-only'`를 선언해 클라이언트 번들 유입 시 빌드 실패를 유발한다(F1-AC6의 번들 유출 방지 장치).

### 2.3 결제 확정 시퀀스 (KRW / USD 공통)

```
1. [구매자] 상세 → "구매하기" → /checkout/{slug}
2. [구매자] 통화 선택(KRW|USD) + 환불 정책 동의 → "결제 진행"
3. [서버] createCheckout()
     ├ 소유 여부 검사(이미 보유 시 409 ALREADY_OWNED)
     ├ orders INSERT (status=PENDING, amount=현재가 스냅샷, expires_at=now+30m)
     └ provider.createCheckout() → 결제창 payload 반환
4. [구매자] 결제사 화면에서 결제 (카드 정보는 스토어 미경유)
5. [결제사] ──리디렉션──▶ /api/checkout/{provider}/return
     └ 주문을 CONFIRMING으로 전이("결제 확인 중"). ★확정 아님★
        (Toss는 이 단계에서 승인(confirm) API 호출 = 매입 확정, 주문 확정과는 분리)
6. [결제사] ──웹훅──▶ /api/webhooks/{provider}
     ├ 서명 검증 (실패 시 401, 처리 안 함)
     ├ webhook_events UPSERT (provider, event_id) 유니크 → 중복이면 SKIPPED 후 200
     ├ ★provider.fetchPayment()로 결제사 원본 재조회★ (웹훅 본문 신뢰 금지)
     ├ 금액·통화 일치 검증 (불일치 → AMOUNT_MISMATCH 인시던트, 확정 보류)
     └ 트랜잭션: order FOR UPDATE → PAID 전이 → library_items 지급 → order_events 기록
7. [서버] 커밋 후 구매 확인 메일 발송 (outbound_emails 유니크로 중복 방지)
8. [구매자] 대기 화면이 3초 폴링으로 PAID 감지 → 라이브러리로 자동 이동
※ 6이 오지 않으면 5분 후부터 재조회 배치가 동일한 확정 로직을 수행 (D5)
```

### 2.4 주문 상태 머신

```
                        ┌───────────────┐
        createCheckout  │   PENDING     │  결제창 진입, expires_at = now + 30분
        ───────────────▶└──┬───┬────┬───┘
                           │   │    │
      리디렉션 복귀 /       │   │    │ 배치: expires_at 경과 & 결제사 조회 결과 미성공
      결제사 "승인됨" 감지  │   │    └──────────────▶ ┌──────────┐
                           │   │                     │ EXPIRED  │(종료)
                           ▼   │                     └──────────┘
                  ┌───────────────┐  결제사 실패/취소   ┌──────────┐
                  │  CONFIRMING   │──────────────────▶│  FAILED  │(종료, 재시도 가능)
                  │ "결제 확인 중" │                    └──────────┘
                  └───────┬───────┘                        ▲
                          │ 웹훅 또는 배치가 결제사 조회로   │
                          │ SUCCEEDED + 금액 일치 확인       │
                          ▼                                 │
                  ┌───────────────┐   결제 실패 웹훅 ────────┘
                  │     PAID      │   (PENDING에서도 직접 FAILED 전이 가능)
                  └───┬───────────┘
                      │ 환불 요청(구매 7일 이내 & 미열람·미다운로드)
                      ▼
              ┌───────────────────┐  운영자/결제사 환불 완료 웹훅
              │ REFUND_REQUESTED  │───────────────────────────▶ ┌───────────┐
              └───────┬───────────┘                             │ REFUNDED  │
                      │ 반려                                     └───────────┘
                      └──────────────────▶ PAID (복귀)            └─ library_items.status = REVOKED
```

**전이 규칙 표**

| From | To | 전이 조건 | 트리거 소스 |
|---|---|---|---|
| PENDING | CONFIRMING | 결제사 리디렉션 복귀 또는 조회 결과가 "승인/처리중" | REDIRECT, BATCH |
| PENDING | PAID | 웹훅 수신 + 조회 재확인 SUCCEEDED + 금액·통화 일치 | WEBHOOK, BATCH |
| PENDING | FAILED | 결제 실패·취소 웹훅 또는 조회 결과 FAILED/CANCELED | WEBHOOK, BATCH, REDIRECT(fail URL) |
| PENDING | EXPIRED | `expires_at < now()` **AND** 조회 결과가 성공 아님 | BATCH |
| CONFIRMING | PAID | 위와 동일 | WEBHOOK, BATCH |
| CONFIRMING | FAILED | 조회 결과 FAILED/CANCELED/EXPIRED | WEBHOOK, BATCH |
| CONFIRMING | (유지) | 24시간 초과 시 `reconcile_state=INCIDENT` 표시 + 운영자 리포트 메일. **상태는 CONFIRMING 유지(자동 실패 처리 금지)** | BATCH |
| PAID | REFUND_REQUESTED | 환불 정책 통과한 요청 접수 | USER |
| REFUND_REQUESTED | REFUNDED | 결제사 환불 완료 | WEBHOOK, SYSTEM |
| REFUND_REQUESTED | PAID | 환불 반려 | SYSTEM |
| FAILED / EXPIRED / REFUNDED | - | 종료 상태. 어떤 전이도 불가(재시도는 **새 주문** 생성) | - |

- 정의되지 않은 전이는 `assertTransition()`이 `InvalidOrderTransitionError`를 던지고 웹훅은 200 + `SKIPPED`로 기록(결제사 무한 재시도 방지).
- 모든 전이는 `order_events`에 `from/to/source/actor/meta`로 감사 기록된다.

---

## 3. 데이터 모델

### 3.1 ERD 요약

```
users 1─* orders *─1 templates *─1 categories
users 1─* library_items *─1 templates
orders 1─1 library_items      orders 1─* payments
orders 1─* refunds            orders 1─* order_events
webhook_events *─0..1 orders  outbound_emails *─0..1 orders
users 1─* sessions (Auth.js)
```

### 3.2 테이블 명세

#### users
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| email | citext | UNIQUE, NOT NULL | 대소문자 무관 유일 |
| password_hash | text | NOT NULL | argon2id |
| name | text | NULL | |
| locale | text | NOT NULL, default 'ko' | 'ko' \| 'en' (메일 언어 결정) |
| email_verified_at | timestamptz | NULL | 컬럼만 확보. MVP는 미인증 결제 허용(미결 사항 참조) |
| created_at / updated_at | timestamptz | NOT NULL | |

#### categories
| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | uuid | PK |
| slug | text | UNIQUE NOT NULL |
| name_ko / name_en | text | NOT NULL |
| sort_order | int | NOT NULL default 0 |

#### templates
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| slug | text | UNIQUE NOT NULL | 상세 URL 키 |
| category_id | uuid | FK → categories, NOT NULL | |
| title | text | NOT NULL | |
| summary | text | NOT NULL | 목록 카드용 |
| description | text | NOT NULL | 상세 설명(검색 대상) |
| usage_guide | text | NOT NULL | 사용 예시 안내 |
| body | text | NOT NULL | **프롬프트 전문. 구매자 외 어떤 응답에도 포함 금지** |
| preview_text | text | NOT NULL | `buildPreview(body)` 결과. 저장 시점에 생성 |
| preview_char_count / masked_char_count | int | NOT NULL | 마스킹 UI 표시용 |
| thumbnail_url | text | NOT NULL | |
| price_krw | integer | NOT NULL, CHECK (price_krw >= 0) | **KRW 고정가 (D4)** |
| price_usd | numeric(10,2) | NOT NULL, CHECK (price_usd >= 0) | **USD 고정가 (D4)** |
| status | enum TemplateStatus | NOT NULL default 'DRAFT' | DRAFT / ON_SALE / SUSPENDED |
| published_at | timestamptz | NULL | 목록 정렬 기준 |
| body_updated_at | timestamptz | NOT NULL | **body 변경 시에만 갱신**. 열람 화면 "마지막 수정일"(F3-AC6) 표시용. 가격 수정으로 값이 흔들리지 않게 `updated_at`과 분리 |
| created_at / updated_at / deleted_at | timestamptz | deleted_at NULL 허용 | soft delete(구매자 열람 보존) |

#### orders
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| order_no | text | UNIQUE NOT NULL | `AS-20260810-XXXXXXXX` (사용자 노출·메일 표기) |
| user_id | uuid | FK → users, NOT NULL | |
| template_id | uuid | FK → templates, NOT NULL | |
| currency | enum Currency | NOT NULL | KRW / USD |
| amount | numeric(12,2) | NOT NULL | **결제 화면 표시 금액 스냅샷** (F2-AC8) |
| provider | enum PaymentProviderId | NOT NULL | TOSS / PADDLE |
| status | enum OrderStatus | NOT NULL default 'PENDING' | 2.4 상태 머신 |
| provider_order_ref | text | NOT NULL | 결제사에 넘긴 주문 식별자(= order_no) |
| provider_payment_id | text | NULL | Toss paymentKey / Paddle transaction id |
| refund_policy_agreed_at | timestamptz | NOT NULL | 결제 전 정책 동의 시각 (F2-AC12) |
| expires_at | timestamptz | NOT NULL | created_at + 30분 |
| paid_at / failed_at / expired_at / refunded_at | timestamptz | NULL | |
| failure_code / failure_message | text | NULL | 실패 사유 안내용 |
| reconcile_state | enum ReconcileState | NOT NULL default 'NONE' | NONE / WATCHING / INCIDENT / RESOLVED |
| reconcile_attempts | int | NOT NULL default 0 | |
| last_reconciled_at | timestamptz | NULL | |
| created_at / updated_at | timestamptz | NOT NULL | |

#### payments (결제사 원본 스냅샷)
| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | uuid | PK |
| order_id | uuid | FK → orders, NOT NULL |
| provider | enum | NOT NULL |
| provider_payment_id | text | NOT NULL |
| status | enum ProviderPaymentStatus | NOT NULL |
| amount / currency | numeric(12,2) / enum | NOT NULL |
| method | text | NULL |
| approved_at | timestamptz | NULL |
| raw_snapshot | jsonb | NOT NULL (조회 API 응답 원본) |
| created_at | timestamptz | NOT NULL |
| | | **UNIQUE (provider, provider_payment_id)** |

#### library_items
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK → users, NOT NULL | |
| template_id | uuid | FK → templates, NOT NULL | |
| order_id | uuid | FK → orders, **UNIQUE** NOT NULL | 주문 1건당 지급 1건 (중복 지급 차단) |
| status | enum LibraryItemStatus | NOT NULL default 'ACTIVE' | ACTIVE / REVOKED(환불) |
| granted_at | timestamptz | NOT NULL | 구매일 = 정렬 기준 |
| first_viewed_at | timestamptz | NULL | 최초 전문 열람 (환불 자격 판정) |
| first_downloaded_at | timestamptz | NULL | 최초 다운로드 (환불 자격 판정) |
| revoked_at | timestamptz | NULL | |
| | | **UNIQUE (user_id, template_id)** | 계정당 템플릿 1개 보유 |

#### webhook_events (멱등성 저장소)
| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | uuid | PK |
| provider | enum | NOT NULL |
| event_id | text | NOT NULL |
| event_type | text | NOT NULL |
| signature_verified | boolean | NOT NULL |
| order_id | uuid | FK → orders, NULL |
| status | enum WebhookStatus | RECEIVED / PROCESSED / SKIPPED / FAILED |
| payload | jsonb | NOT NULL (raw body 파싱본) |
| error | text | NULL |
| received_at / processed_at | timestamptz | |
| | | **UNIQUE (provider, event_id)** ← 중복 지급 방지의 1차 방어선 |

#### refunds
| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | uuid | PK |
| order_id | uuid | FK → orders, NOT NULL |
| status | enum RefundStatus | REQUESTED / APPROVED / REJECTED / COMPLETED |
| reason_code / reason_text | text | |
| amount / currency | numeric(12,2) / enum | 전액 환불만 지원 |
| provider_refund_id | text | NULL |
| requested_at / completed_at | timestamptz | |
| | | **UNIQUE (order_id) WHERE status IN ('REQUESTED','APPROVED','COMPLETED')** |

#### order_events (감사 로그)
`id, order_id(FK), from_status, to_status, source(WEBHOOK|BATCH|REDIRECT|USER|SYSTEM), actor, meta jsonb, created_at`

#### outbound_emails (메일 중복 발송 방지)
`id, type(PURCHASE_CONFIRMATION|RECONCILE_REPORT), to_email, order_id(FK, NULL), status(QUEUED|SENT|FAILED), provider_message_id, error, created_at, sent_at`
**UNIQUE (type, order_id)**

#### sessions / verification_tokens
Auth.js Prisma Adapter 표준 스키마 사용(`sessions`: id, session_token UNIQUE, user_id, expires).

### 3.3 인덱스 및 핵심 제약

```sql
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 목록 조회 (판매 중 + 최신순 + 20개 페이지네이션)
CREATE INDEX idx_templates_onsale ON templates (status, published_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_templates_category ON templates (category_id, status, published_at DESC)
  WHERE deleted_at IS NULL;

-- 검색 (제목·설명 부분 일치, 1초 이내)
CREATE INDEX idx_templates_title_trgm ON templates USING gin (title gin_trgm_ops);
CREATE INDEX idx_templates_desc_trgm  ON templates USING gin (description gin_trgm_ops);

-- ★중복 구매/중복 지급 차단 (애플리케이션 검사 + DB 이중 방어)
CREATE UNIQUE INDEX uq_orders_paid_owner ON orders (user_id, template_id)
  WHERE status IN ('PAID','REFUND_REQUESTED');
CREATE UNIQUE INDEX uq_library_owner ON library_items (user_id, template_id);
CREATE UNIQUE INDEX uq_library_order ON library_items (order_id);
CREATE UNIQUE INDEX uq_webhook_event ON webhook_events (provider, event_id);

-- 배치 스캔 대상 (미확정 주문)
CREATE INDEX idx_orders_reconcile ON orders (status, last_reconciled_at NULLS FIRST)
  WHERE status IN ('PENDING','CONFIRMING');
CREATE INDEX idx_orders_expiring ON orders (expires_at)
  WHERE status = 'PENDING';

-- 라이브러리 목록 (구매일 최신순)
CREATE INDEX idx_library_user ON library_items (user_id, granted_at DESC);
-- 주문 조회
CREATE INDEX idx_orders_user ON orders (user_id, created_at DESC);
CREATE UNIQUE INDEX uq_orders_no ON orders (order_no);
```

> 주의: `uq_orders_paid_owner`는 **재구매 차단이 DB 레벨에서도 보장**됨을 의미한다. 웹훅이 동시에 2건 처리되더라도 두 번째는 유니크 위반으로 롤백되고 `SKIPPED`로 기록된다.

---

## 4. 프로젝트 구조

```
ai_store/
├── docker-compose.yml               # postgres + cron 컨테이너
├── .env.example                     # 환경 변수 템플릿
├── package.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── vitest.config.ts
├── playwright.config.ts
├── prisma/
│   ├── schema.prisma                # 3장 데이터 모델
│   ├── migrations/0001_init/migration.sql
│   └── seed.ts                      # 카테고리 + 템플릿 초기 등록(운영자 등록 대체)
├── messages/
│   ├── ko.json                      # 한국어 문구
│   └── en.json                      # 영어 문구
├── tests/
│   ├── unit/
│   │   ├── preview.test.ts          # 마스킹 30% 경계
│   │   ├── order.state-machine.test.ts
│   │   ├── toss.signature.test.ts
│   │   ├── paddle.signature.test.ts
│   │   ├── refund.policy.test.ts
│   │   └── webhook.idempotency.test.ts
│   └── e2e/
│       ├── browse.spec.ts           # 기능 1
│       ├── checkout-krw.spec.ts     # 기능 2 (KRW)
│       ├── checkout-usd.spec.ts     # 기능 2 (USD)
│       └── library.spec.ts          # 기능 3
└── src/
    ├── middleware.ts                # next-intl 로케일 + 보호 경로 리다이렉트
    ├── i18n/
    │   ├── routing.ts
    │   └── request.ts
    ├── types/
    │   ├── domain.ts                # OrderStatus, Currency 등 도메인 타입
    │   └── api.ts                   # API 요청/응답 DTO
    ├── lib/
    │   ├── db.ts                    # PrismaClient 싱글턴 (server-only)
    │   ├── auth.ts                  # Auth.js 설정, auth()
    │   ├── auth-guard.ts            # requireUser(), requireOwner()
    │   ├── env.ts                   # Zod 환경 변수 검증
    │   ├── errors.ts                # AppError 계층
    │   ├── http.ts                  # jsonOk / jsonError
    │   └── logger.ts                # 구조화 로그(orderNo 상관관계 ID)
    ├── server/                      # ★도메인 서비스 계층 (전부 server-only)
    │   ├── templates/
    │   │   ├── template.repository.ts   # body 제외 select 강제
    │   │   ├── template.service.ts      # 목록/검색/상세
    │   │   └── preview.ts               # buildPreview() 마스킹
    │   ├── orders/
    │   │   ├── order.repository.ts
    │   │   ├── order.service.ts         # createCheckout / confirmPaid / markFailed ...
    │   │   ├── order.state-machine.ts   # 전이표 + assertTransition
    │   │   └── order-number.ts
    │   ├── payments/
    │   │   ├── provider.types.ts        # PaymentProvider 인터페이스
    │   │   ├── provider.registry.ts     # 통화 → 구현체 매핑
    │   │   ├── webhook.handler.ts       # 공통 멱등 파이프라인
    │   │   ├── webhook.repository.ts
    │   │   ├── toss/
    │   │   │   ├── toss.provider.ts
    │   │   │   ├── toss.client.ts       # Payments API 호출
    │   │   │   └── toss.signature.ts
    │   │   └── paddle/
    │   │       ├── paddle.provider.ts
    │   │       ├── paddle.client.ts
    │   │       └── paddle.signature.ts
    │   ├── library/
    │   │   ├── library.service.ts       # 목록/전문 열람/다운로드/열람 기록
    │   │   └── access.ts                # assertTemplateAccess() 소유권 게이트
    │   ├── refunds/
    │   │   ├── refund.policy.ts         # 7일 + 미열람 판정
    │   │   └── refund.service.ts
    │   ├── mail/
    │   │   ├── mailer.ts                # outbound_emails 기반 멱등 발송
    │   │   └── templates/
    │   │       ├── purchase-confirmation.tsx
    │   │       └── reconciliation-report.tsx
    │   └── jobs/
    │       ├── cron-auth.ts             # CRON_SECRET 검증
    │       ├── reconcile-payments.job.ts# ★D5 자동 재조회 배치
    │       └── expire-orders.job.ts     # 30분 만료 처리
    ├── components/
    │   ├── ui/                          # shadcn/ui: Button, Input, Badge, Dialog, Skeleton, Toast
    │   ├── layout/                      # Header, Footer, LocaleSwitcher
    │   ├── templates/
    │   │   ├── TemplateCard.tsx
    │   │   ├── TemplateGrid.tsx
    │   │   ├── CategoryFilter.tsx
    │   │   ├── SearchBar.tsx
    │   │   ├── Pagination.tsx
    │   │   ├── PreviewPanel.tsx         # 마스킹 미리보기 표시
    │   │   ├── EmptyResult.tsx
    │   │   └── RetryError.tsx
    │   ├── checkout/
    │   │   ├── CurrencySelector.tsx
    │   │   ├── PriceSummary.tsx
    │   │   ├── RefundPolicyConsent.tsx
    │   │   ├── CheckoutButton.tsx
    │   │   ├── PaddleCheckoutLauncher.tsx
    │   │   └── OrderStatusPoller.tsx    # "결제 확인 중" 자동 갱신
    │   ├── library/
    │   │   ├── LibraryList.tsx
    │   │   ├── LibraryEmpty.tsx
    │   │   ├── PromptViewer.tsx
    │   │   ├── CopyButton.tsx
    │   │   └── DownloadButton.tsx
    │   └── orders/
    │       ├── OrderSummary.tsx
    │       └── RefundRequestForm.tsx
    └── app/
        ├── actions/
        │   ├── auth.actions.ts
        │   ├── checkout.actions.ts      # startCheckout()
        │   ├── library.actions.ts       # markFirstView()
        │   └── refund.actions.ts
        ├── [locale]/
        │   ├── layout.tsx
        │   ├── page.tsx                 # 템플릿 목록 (기능 1)
        │   ├── loading.tsx
        │   ├── error.tsx
        │   ├── not-found.tsx
        │   ├── templates/[slug]/page.tsx    # 상세 + 미리보기 (기능 1)
        │   ├── templates/[slug]/error.tsx
        │   ├── login/page.tsx
        │   ├── signup/page.tsx
        │   ├── checkout/[slug]/page.tsx         # 통화 선택 결제 화면 (기능 2)
        │   ├── checkout/status/[orderNo]/page.tsx # 결제 확인 중 (기능 2)
        │   ├── library/page.tsx                  # 내 라이브러리 (기능 3)
        │   ├── library/[templateId]/page.tsx     # 전문 열람 (기능 3)
        │   └── orders/[orderNo]/page.tsx         # 주문 상세 + 환불 요청
        └── api/
            ├── auth/[...nextauth]/route.ts
            ├── auth/signup/route.ts
            ├── templates/route.ts
            ├── templates/[slug]/route.ts
            ├── checkout/route.ts
            ├── checkout/toss/return/route.ts
            ├── checkout/toss/fail/route.ts
            ├── checkout/paddle/return/route.ts
            ├── webhooks/toss/route.ts
            ├── webhooks/paddle/route.ts
            ├── orders/[orderNo]/route.ts
            ├── orders/[orderNo]/refund/route.ts
            ├── library/route.ts
            ├── library/[templateId]/download/route.ts
            ├── cron/reconcile-payments/route.ts
            └── cron/expire-orders/route.ts
```

**총 파일 수: 126개** (설정 9 · Prisma 3 · 메시지 2 · i18n 3 · 타입 2 · lib 7 · server 27 · components 30 · 페이지 15 · API 16 · 서버 액션 4 · 테스트 10 — shadcn/ui 6개 파일 포함)

---

## 5. 핵심 타입 정의

`src/types/domain.ts`

```typescript
export type Currency = 'KRW' | 'USD';
export type PaymentProviderId = 'TOSS' | 'PADDLE';

export type OrderStatus =
  | 'PENDING'          // 결제창 진입, 30분 만료 대기
  | 'CONFIRMING'       // 결제사 성공 신호 수신, 웹훅 확정 대기 = "결제 확인 중"
  | 'PAID'
  | 'FAILED'
  | 'EXPIRED'
  | 'REFUND_REQUESTED'
  | 'REFUNDED';

export type OrderEventSource = 'WEBHOOK' | 'BATCH' | 'REDIRECT' | 'USER' | 'SYSTEM';
export type ReconcileState = 'NONE' | 'WATCHING' | 'INCIDENT' | 'RESOLVED';
export type LibraryItemStatus = 'ACTIVE' | 'REVOKED';
export type TemplateStatus = 'DRAFT' | 'ON_SALE' | 'SUSPENDED';

/** 미구매자에게 전달 가능한 템플릿 뷰. body 필드가 타입에 존재하지 않는다. */
export interface TemplatePreviewView {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  usageGuide: string;
  categorySlug: string;
  categoryName: string;
  thumbnailUrl: string;
  priceKrw: number;          // 통화별 개별 고정가 (D4)
  priceUsd: string;          // Decimal 직렬화 문자열
  status: TemplateStatus;
  previewText: string;       // 전문의 앞 30% 이하
  maskedCharCount: number;
  bodyUpdatedAt: string;
}

/** 구매 확정자에게만 전달되는 뷰. 소유권 검증 통과 후에만 생성 가능. */
export interface TemplateFullView extends TemplatePreviewView {
  body: string;
}
```

`src/server/payments/provider.types.ts`

```typescript
export interface CreateCheckoutInput {
  orderNo: string;                 // provider_order_ref로 사용
  amount: string;                  // Decimal 문자열
  currency: Currency;
  templateId: string;
  templateTitle: string;
  buyer: { userId: string; email: string; locale: 'ko' | 'en' };
  successUrl: string;
  failUrl: string;
  expiresAt: Date;
}

export type ClientCheckoutPayload =
  | { kind: 'TOSS_WIDGET'; clientKey: string; orderId: string; orderName: string;
      amount: number; customerEmail: string; successUrl: string; failUrl: string }
  | { kind: 'PADDLE_OVERLAY'; clientToken: string; transactionId: string;
      environment: 'sandbox' | 'production' };

export interface CheckoutSession {
  provider: PaymentProviderId;
  providerOrderRef: string;
  providerPaymentId: string | null;
  clientPayload: ClientCheckoutPayload;
  expiresAt: Date;
}

export type ProviderPaymentStatus =
  | 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'EXPIRED' | 'REFUNDED' | 'UNKNOWN';

export interface ProviderPaymentSnapshot {
  providerPaymentId: string;
  status: ProviderPaymentStatus;
  currency: Currency;
  amount: string;                  // 결제사가 실제 승인한 금액
  method: string | null;
  approvedAt: Date | null;
  failureCode: string | null;
  failureMessage: string | null;
  raw: unknown;                    // payments.raw_snapshot에 그대로 저장
}

export type WebhookIntent =
  | 'PAYMENT_SUCCEEDED' | 'PAYMENT_FAILED' | 'PAYMENT_CANCELED'
  | 'PAYMENT_EXPIRED'   | 'REFUND_COMPLETED' | 'IGNORED';

export interface RawWebhookRequest {
  rawBody: string;                 // ★서명 검증을 위해 파싱 전 원문 필수
  headers: Headers;
}

export interface NormalizedWebhookEvent {
  eventId: string;                 // 결제사 고유 이벤트 ID (멱등 키)
  eventType: string;
  intent: WebhookIntent;
  providerOrderRef: string | null;
  providerPaymentId: string | null;
}

export interface RefundInput { orderNo: string; providerPaymentId: string;
  amount: string; currency: Currency; reason: string }
export interface RefundResult { providerRefundId: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' }

/** 토스페이먼츠·Paddle을 동일하게 다루기 위한 공통 인터페이스 */
export interface PaymentProvider {
  readonly id: PaymentProviderId;
  readonly currency: Currency;

  /** 결제 시작: 결제사에 거래를 생성하고 클라이언트 결제창 payload를 반환 */
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;

  /** 웹훅 서명·발신자 검증 후 정규화. 실패 시 WebhookSignatureError */
  verifyAndParseWebhook(req: RawWebhookRequest): Promise<NormalizedWebhookEvent>;

  /** ★확정의 유일한 근거. 웹훅/배치 모두 이 결과로만 상태를 전이한다 */
  fetchPayment(ref: { providerOrderRef: string; providerPaymentId?: string | null })
    : Promise<ProviderPaymentSnapshot | null>;

  /** 전액 환불 */
  refund(input: RefundInput): Promise<RefundResult>;
}
```

`src/server/payments/provider.registry.ts`

```typescript
const REGISTRY: Record<Currency, PaymentProvider> = {
  KRW: tossProvider,    // 토스페이먼츠
  USD: paddleProvider,  // Paddle
};

/** 통화 → 결제사. IP/국가는 절대 참조하지 않는다 (PRD F2-AC2, Out of Scope) */
export function getProviderForCurrency(currency: Currency): PaymentProvider;
export function getProviderById(id: PaymentProviderId): PaymentProvider;
```

---

## 6. 구현 명세

### 기능 1: 템플릿 탐색 및 상세 미리보기 → 구현 명세

> PRD 매핑: 기능 1 — 구매자가 카테고리·검색으로 템플릿을 찾고 상세에서 마스킹된 미리보기를 확인

**주요 파일**

| 파일 | 역할 |
|---|---|
| `src/app/[locale]/page.tsx` | 목록 페이지(RSC). `searchParams`의 `q`, `category`, `page`를 서비스에 전달 |
| `src/app/[locale]/templates/[slug]/page.tsx` | 상세 페이지(RSC) |
| `src/components/templates/SearchBar.tsx` | 검색어를 URL 쿼리로 반영(클라이언트, 300ms 디바운스) |
| `src/components/templates/CategoryFilter.tsx` | 카테고리 선택 + 현재 선택 표시 |
| `src/components/templates/PreviewPanel.tsx` | `previewText` + 마스킹 블록 + 안내 문구 렌더 |
| `src/server/templates/template.service.ts` | 목록/검색/상세 조회 |
| `src/server/templates/preview.ts` | 마스킹 생성 |

**핵심 함수 시그니처**

```typescript
// src/server/templates/preview.ts   (import 'server-only')
export const PREVIEW_RATIO = 0.3;

/**
 * 프롬프트 전문의 앞부분 최대 30%만 남긴 미리보기를 생성한다.
 * - 상한: floor(body.length * 0.3) — 절대 초과 금지
 * - 문장 중간 절단을 피하기 위해 상한 이내의 마지막 줄바꿈 → 마지막 공백 순으로 스냅
 * - 템플릿 저장 시점에 실행되어 templates.preview_text에 저장된다.
 */
export function buildPreview(body: string, ratio = PREVIEW_RATIO): {
  previewText: string;
  previewCharCount: number;
  maskedCharCount: number;
};

// src/server/templates/template.service.ts
export interface ListTemplatesParams {
  q?: string; categorySlug?: string; page?: number; pageSize?: 20; locale: 'ko' | 'en';
}
export interface ListTemplatesResult {
  items: TemplateCardView[]; total: number; page: number; pageSize: number; totalPages: number;
}
export async function listTemplates(p: ListTemplatesParams): Promise<ListTemplatesResult>;

/** 상세. 판매 중지/삭제 시에도 메타는 반환하되 isPurchasable=false */
export async function getTemplateDetail(slug: string)
  : Promise<{ template: TemplatePreviewView; isPurchasable: boolean } | null>;
```

**마스킹 유출 차단 설계 (F1-AC6 대응, 4중 방어)**

1. **레포지토리 레벨**: `template.repository.ts`의 공개 조회 함수는 Prisma `select`에 `body`를 **포함하지 않는다**. 반환 타입이 `TemplatePreviewView`라 `body`가 타입에 존재하지 않아, 실수로 넘기면 컴파일 에러.
2. **RSC 직렬화**: 상세 페이지는 서버 컴포넌트가 `previewText`만 props로 내려보낸다. RSC Flight 페이로드(=페이지 소스)에 `body`가 애초에 담기지 않음.
3. **마스킹 시점**: 마스킹은 CSS blur/클라이언트 자르기가 아니라 **DB에 저장된 `preview_text` 사용**. 원문은 서버 밖으로 나가지 않음.
4. **번들 격리**: `preview.ts`, `template.repository.ts`에 `import 'server-only'` 선언 → 클라이언트 컴포넌트가 임포트하면 빌드 실패.

**수용 기준 매핑**

| PRD 수용 기준 | 구현 방법 |
|---|---|
| F1-AC1 목록에 제목·카테고리·가격(KRW/USD 병기)·대표 이미지, 20개 단위 | `listTemplates({pageSize:20})` + `TemplateCard`가 `priceKrw`/`priceUsd` 동시 표기(D4로 두 값이 DB에 모두 존재). `Pagination.tsx`가 `?page=` 갱신 |
| F1-AC2 카테고리 필터 + 검색어 동시 적용 | `where`에 `categorySlug`와 `q` 조건을 AND 결합. 선택 카테고리는 URL(`?category=`)이 단일 진실이며 `CategoryFilter`가 활성 뱃지 표시 |
| F1-AC3 제목·설명 키워드 검색 | `OR: [{ title: contains q }, { description: contains q }]`, mode insensitive. `pg_trgm` GIN 인덱스로 1초 이내 |
| F1-AC4 상세에 제목·설명·카테고리·가격·사용 예시·미리보기 | `getTemplateDetail()`이 `usageGuide` 포함 반환, 상세 페이지가 6개 섹션 렌더 |
| F1-AC5 앞 30%만 노출 + "구매 후 전문 열람 가능" | `buildPreview(body, 0.3)` 결과를 `PreviewPanel`이 렌더, 하단에 `t('preview.lockedNotice')` 문구 + 잠금 아이콘 |
| F1-AC6 어떤 경로로도 원문 미노출 | 위 "4중 방어". `/api/templates/[slug]` 응답 스키마에도 `body` 없음. E2E에서 페이지 HTML·RSC 페이로드·API 응답에 원문 문자열 부재 단언 |
| F1-AC7 검색 0건 안내 + 전체 목록 복귀 | `items.length === 0` → `EmptyResult.tsx` (안내 문구 + "전체 목록 보기" 링크가 쿼리 초기화) |
| F1-AC8 판매 중지/삭제 시 안내 + 구매 버튼 숨김, 구매자는 라이브러리 열람 유지 | `isPurchasable = status === 'ON_SALE' && deletedAt === null`. false면 안내 배너 + 버튼 미렌더. 삭제는 soft delete라 `library_items`·`body` 보존 |
| F1-AC9 로드 실패 시 오류 안내 + 재시도 | `templates/[slug]/error.tsx`, `[locale]/error.tsx`가 `RetryError.tsx` 렌더(`reset()` 호출 버튼) |

---

### 기능 2: 통화 선택 기반 결제 및 주문 생성 → 구현 명세

> PRD 매핑: 기능 2 — 구매자가 KRW/USD를 직접 선택해 결제하고, 웹훅 기준으로 주문이 확정됨

**주요 파일**

| 파일 | 역할 |
|---|---|
| `src/app/[locale]/checkout/[slug]/page.tsx` | 통화 선택·금액 표시·환불 정책 동의 화면 |
| `src/app/[locale]/checkout/status/[orderNo]/page.tsx` | "결제 확인 중" 대기 화면 |
| `src/app/actions/checkout.actions.ts` | `startCheckout()` 서버 액션 |
| `src/app/api/checkout/route.ts` | 결제 시작 API(클라이언트 SDK 경로용) |
| `src/app/api/webhooks/toss/route.ts`, `.../paddle/route.ts` | 웹훅 수신 |
| `src/app/api/checkout/toss/return/route.ts` 등 | 리디렉션 복귀(확정 아님) |
| `src/server/orders/order.service.ts` | 주문 생성·확정·실패·만료 |
| `src/server/orders/order.state-machine.ts` | 전이 검증 |
| `src/server/payments/webhook.handler.ts` | 공통 멱등 파이프라인 |
| `src/server/jobs/reconcile-payments.job.ts` | 자동 재조회 배치 (D5) |
| `src/server/refunds/refund.policy.ts` | 7일 + 미열람 판정 |

**핵심 함수 시그니처**

```typescript
// src/server/orders/order.state-machine.ts
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING:          ['CONFIRMING', 'PAID', 'FAILED', 'EXPIRED'],
  CONFIRMING:       ['PAID', 'FAILED'],
  PAID:             ['REFUND_REQUESTED'],
  REFUND_REQUESTED: ['REFUNDED', 'PAID'],
  FAILED: [], EXPIRED: [], REFUNDED: [],
};
export function canTransition(from: OrderStatus, to: OrderStatus): boolean;
export function assertTransition(from: OrderStatus, to: OrderStatus, source: OrderEventSource): void;

// src/server/orders/order.service.ts
export interface StartCheckoutInput {
  userId: string; templateSlug: string; currency: Currency; policyAgreed: true; locale: 'ko'|'en';
}
export interface StartCheckoutResult {
  orderNo: string; provider: PaymentProviderId; amount: string; currency: Currency;
  clientPayload: ClientCheckoutPayload; expiresAt: string;
}
/**
 * 1) 템플릿 판매 상태 확인  2) 이미 보유 여부 확인(ALREADY_OWNED)
 * 3) 현재가를 amount로 스냅샷하여 orders INSERT (PENDING, expires_at=+30m)
 * 4) getProviderForCurrency(currency).createCheckout() 호출
 */
export async function startCheckout(i: StartCheckoutInput): Promise<StartCheckoutResult>;

/**
 * ★주문 확정의 단일 진입점. 웹훅·배치가 모두 이 함수만 호출한다.
 * 트랜잭션 내부에서:
 *   SELECT ... FOR UPDATE → 상태 재확인(이미 PAID면 no-op) → 금액/통화 대조
 *   → orders UPDATE(PAID) → payments UPSERT → library_items INSERT → order_events INSERT
 * 반환 alreadyConfirmed=true 이면 중복 웹훅이므로 메일 재발송하지 않는다.
 */
export async function confirmOrderPaid(args: {
  orderNo: string; snapshot: ProviderPaymentSnapshot; source: OrderEventSource;
}): Promise<{ orderId: string; alreadyConfirmed: boolean; libraryItemId: string }>;

export async function markOrderConfirming(orderNo: string, source: OrderEventSource): Promise<void>;
export async function markOrderFailed(args: {
  orderNo: string; code: string; message: string; source: OrderEventSource;
}): Promise<void>;
export async function expireOrder(orderNo: string): Promise<void>;
export async function getOrderStatusForUser(orderNo: string, userId: string)
  : Promise<OrderStatusView>;   // 본인 주문이 아니면 NotFoundError (존재 여부 노출 금지)
```

**웹훅 처리 파이프라인 (멱등성 + 발신자 검증)**

```typescript
// src/server/payments/webhook.handler.ts
export async function handleIncomingWebhook(
  providerId: PaymentProviderId, req: Request,
): Promise<Response> {
  const rawBody = await req.text();                 // ①파싱 전 원문 확보(HMAC 대상)
  const provider = getProviderById(providerId);

  let event: NormalizedWebhookEvent;
  try {
    event = await provider.verifyAndParseWebhook({ rawBody, headers: req.headers });
  } catch (e) {
    await recordWebhook({ providerId, signatureVerified: false, ... });
    return new Response('invalid signature', { status: 401 });   // ②검증 실패 → 처리 안 함
  }

  // ③멱등 키 선점: UNIQUE(provider, event_id) 위반 = 중복 웹훅
  const inserted = await tryInsertWebhookEvent({ providerId, event, payload: rawBody });
  if (!inserted) return Response.json({ ok: true, deduped: true });  // 200으로 재시도 중단

  // ④★웹훅 본문을 신뢰하지 않고 결제사 조회 API로 원본 재확인
  const snapshot = await provider.fetchPayment({
    providerOrderRef: event.providerOrderRef!, providerPaymentId: event.providerPaymentId,
  });

  switch (event.intent) {
    case 'PAYMENT_SUCCEEDED':
      if (snapshot?.status !== 'SUCCEEDED') { await markWebhook('SKIPPED'); break; }
      const r = await confirmOrderPaid({ orderNo: event.providerOrderRef!, snapshot, source: 'WEBHOOK' });
      if (!r.alreadyConfirmed) await sendPurchaseConfirmationEmail(r.orderId); // ⑤커밋 후 1회
      break;
    case 'PAYMENT_FAILED':
    case 'PAYMENT_CANCELED':
    case 'PAYMENT_EXPIRED':
      await markOrderFailed({ ... , source: 'WEBHOOK' }); break;
    case 'REFUND_COMPLETED':
      await completeRefund({ orderNo: event.providerOrderRef!, source: 'WEBHOOK' }); break;
    case 'IGNORED': break;
  }
  await markWebhook('PROCESSED');
  return Response.json({ ok: true });               // ⑥항상 200 (실패는 별도 기록 후 배치가 구제)
}
```

**중복 웹훅 1건 처리 보장 (F2-AC6) — 3중 방어**

| 계층 | 장치 |
|---|---|
| 이벤트 | `webhook_events UNIQUE(provider, event_id)` → 같은 이벤트 재전송 즉시 차단 |
| 상태 | 트랜잭션 내 `SELECT ... FOR UPDATE` 후 `status !== 'PAID'`일 때만 전이. 이미 PAID면 `alreadyConfirmed=true` 반환 |
| 지급 | `library_items UNIQUE(user_id, template_id)` + `UNIQUE(order_id)` → 어떤 경로로도 2건 생성 불가 |

**서명·발신자 검증**

```typescript
// src/server/payments/toss/toss.signature.ts
/**
 * 토스페이먼츠 웹훅 검증
 * - 헤더의 전송 ID/전송 시각/서명 값을 읽어 `${transmissionId}.${transmissionTime}.${rawBody}`에
 *   대한 HMAC-SHA256(base64)을 TOSS_WEBHOOK_SECRET으로 계산해 비교
 * - crypto.timingSafeEqual 사용, 전송 시각이 현재 기준 ±5분을 벗어나면 재전송 공격으로 간주해 거부
 * - 보조 방어: TOSS_WEBHOOK_ALLOWED_IPS(선택)로 발신 IP 화이트리스트 검사
 * - ★최종 확정은 서명 통과 여부와 무관하게 fetchPayment() 재조회 결과로만 결정
 */
export function verifyTossSignature(args: { rawBody: string; headers: Headers }): void;

// src/server/payments/paddle/paddle.signature.ts
/**
 * Paddle 웹훅 검증
 * - `Paddle-Signature: ts=<unix>;h1=<hex>` 파싱
 * - HMAC-SHA256(`${ts}:${rawBody}`, PADDLE_NOTIFICATION_SECRET) === h1 (timingSafeEqual)
 * - ts가 ±5분을 벗어나면 거부
 */
export function verifyPaddleSignature(args: { rawBody: string; headers: Headers }): void;
```

> 구현 시 각 결제사 최신 문서로 헤더명·서명 문자열 구성을 재확인한다. 재확인 리스크는 "확정은 조회 API 결과로만" 원칙 덕분에 금전적 오확정으로 이어지지 않는다.

**결제사별 구현 요약**

| 항목 | 토스페이먼츠 (KRW) | Paddle (USD) |
|---|---|---|
| 결제 시작 | 서버가 `orderNo`/금액 확정 → 클라이언트가 `@tosspayments/tosspayments-sdk`로 결제창 호출 | 서버가 `POST /transactions`로 트랜잭션 생성 → 클라이언트가 Paddle.js 오버레이 열기 |
| 승인/캡처 | 리디렉션 복귀 시 `POST /v1/payments/confirm`(paymentKey, orderId, amount) 호출 = **매입만 수행**, 주문 상태는 `CONFIRMING` | Paddle이 자체 완료 처리 |
| 확정 웹훅 | 결제 상태 변경 통지(`DONE`) | `transaction.completed` |
| 조회 API | `GET /v1/payments/orders/{orderNo}` (paymentKey 미확보 시에도 조회 가능 → 배치 핵심) | `GET /transactions/{id}` 또는 `custom_data.orderNo`로 목록 조회 |
| 환불 | `POST /v1/payments/{paymentKey}/cancel` | `POST /adjustments` (type=refund, full) |
| 금액 단위 | 정수 원 | 소수점 2자리 달러 |

**자동 재조회 배치 (D5, F2-AC11 대응)**

```typescript
// src/server/jobs/reconcile-payments.job.ts
export interface ReconcileResult {
  scanned: number; confirmed: number; failed: number; expired: number;
  incidents: number; // 24시간 초과 미확정
}
/**
 * 실행 주기: 2분 (docker-compose cron → POST /api/cron/reconcile-payments)
 * 대상: status IN ('PENDING','CONFIRMING') AND created_at > now() - 72h
 *       ORDER BY last_reconciled_at NULLS FIRST LIMIT 100
 * 백오프: attempts에 따라 최소 재조회 간격 = min(2^attempts, 30)분
 * 처리:
 *   SUCCEEDED  → confirmOrderPaid(source:'BATCH')  → 구매 확인 메일(멱등)
 *   FAILED/CANCELED → markOrderFailed(source:'BATCH')
 *   PENDING & expires_at < now() → expireOrder()
 *   SUCCEEDED 아님 & CONFIRMING 24h 초과 → reconcile_state='INCIDENT'
 *                                          + 운영자 리포트 메일(일 1회 집계)
 * ※ 운영자 수동 확정 화면은 만들지 않는다(기능 3개 유지). 확정은 전부 자동.
 */
export async function reconcilePayments(now = new Date()): Promise<ReconcileResult>;

// src/server/jobs/expire-orders.job.ts
/** 실행 주기: 5분. expires_at 경과 PENDING 주문을 조회 재확인 후 EXPIRED로 전이 */
export async function expireOrders(now = new Date()): Promise<{ expired: number }>;
```

**환불 정책 판정**

```typescript
// src/server/refunds/refund.policy.ts
export const REFUND_WINDOW_DAYS = 7;
export type RefundIneligibleReason =
  | 'ORDER_NOT_PAID' | 'WINDOW_EXPIRED' | 'ALREADY_VIEWED'
  | 'ALREADY_DOWNLOADED' | 'ALREADY_REQUESTED';

/** 구매일로부터 7일 이내 AND first_viewed_at·first_downloaded_at 모두 null 일 때만 접수 가능 */
export function evaluateRefundEligibility(args: {
  order: Pick<Order, 'status' | 'paidAt'>;
  libraryItem: Pick<LibraryItem, 'firstViewedAt' | 'firstDownloadedAt'>;
  now?: Date;
}): { eligible: true } | { eligible: false; reason: RefundIneligibleReason };
```

**수용 기준 매핑**

| PRD 수용 기준 | 구현 방법 |
|---|---|
| F2-AC1 KRW/USD 명시 선택 + 결제 전 최종 금액 표시 | `checkout/[slug]/page.tsx`에서 `CurrencySelector`(기본값 없이 미선택 상태로 시작, 미선택 시 버튼 disabled) + `PriceSummary`가 선택 통화의 `priceKrw`/`priceUsd`를 표시 |
| F2-AC2 KRW→토스, USD→Paddle, IP 자동 판별 금지 | `getProviderForCurrency(currency)` 매핑. 코드베이스 어디에서도 IP/GeoIP/`x-vercel-ip-country`를 참조하지 않음(E2E + 코드 검사) |
| F2-AC3 웹훅 확정 시 PAID + 라이브러리 지급 | `handleIncomingWebhook` → `confirmOrderPaid()` 단일 트랜잭션에서 `orders.PAID` + `library_items` INSERT |
| F2-AC4 구매 확인 메일(주문번호·템플릿명·통화/금액·라이브러리 경로) | 커밋 후 `sendPurchaseConfirmationEmail(orderId)`. `purchase-confirmation.tsx`에 4개 항목 포함, `outbound_emails UNIQUE(type, order_id)`로 1회 발송 |
| F2-AC5 웹훅으로만 확정, 리디렉션 확정 금지, "결제 확인 중" 후 자동 갱신 | 리디렉션 핸들러는 `markOrderConfirming()`만 수행(전이표상 CONFIRMING→PAID는 WEBHOOK/BATCH만 가능). `checkout/status/[orderNo]` 화면의 `OrderStatusPoller`가 3초 간격 `GET /api/orders/{orderNo}` 폴링, PAID 감지 시 라이브러리로 `router.replace` |
| F2-AC6 중복 웹훅에도 1건만 생성 | 위 "3중 방어"(webhook_events 유니크 / FOR UPDATE 상태 가드 / library_items 유니크) |
| F2-AC7 이미 보유 시 결제 전 차단 + 라이브러리 이동 | `startCheckout()` 진입 시 `library_items(user,template,ACTIVE)` 조회 → `AlreadyOwnedError` → 409 + 안내 다이얼로그. 상세 페이지에서도 보유 시 버튼이 "라이브러리에서 보기"로 대체. DB `uq_orders_paid_owner`가 최종 방어 |
| F2-AC8 결제 중 가격 변경돼도 표시 금액으로 결제 | `orders.amount`에 결제 화면 금액을 스냅샷하고 이후 결제·확정 검증은 `orders.amount` 기준. 웹훅 확정 시 `snapshot.amount === orders.amount` 대조(불일치는 확정 보류 + INCIDENT) |
| F2-AC9 30분 미완료 시 만료, 재시도는 새 금액 | `expires_at = created_at + 30m`, `expire-orders.job` 5분 주기. EXPIRED는 종료 상태이므로 재시도는 `startCheckout()`이 **새 주문**을 만들며 그 시점 가격을 다시 스냅샷 |
| F2-AC10 결제 실패 시 미확정 + 실패 사유·재시도 경로, 라이브러리 미지급 | `markOrderFailed()`가 `failure_code/message` 저장. 실패 화면이 사유 문구 + "다시 결제하기"(새 주문) 제공. 지급은 `confirmOrderPaid()`에서만 발생하므로 FAILED 경로에는 지급 코드 자체가 없음 |
| F2-AC11 결제 성공·확정 지연 시 미확정 기록·운영자 조회·"최대 24시간" 안내, 미지급 0건 | 상태 `CONFIRMING` + `reconcile_state` 컬럼으로 기록. 재조회 배치가 2분마다 자동 확정 시도(D5), 24시간 초과 건은 `INCIDENT` 표시 + `reconciliation-report` 메일로 운영자에게 목록 통지. 구매자 화면은 "확인 중, 최대 24시간 내 처리" 안내 |
| F2-AC12 7일 이내 & 미열람 환불 접수, 확정 시 즉시 접근 차단, 결제 전 정책 고지·동의 | `evaluateRefundEligibility()`로 접수 판정 → `refund.service.requestRefund()`. 환불 완료 시 `library_items.status='REVOKED'`로 전환되어 `assertTemplateAccess()`가 즉시 차단. 결제 화면의 `RefundPolicyConsent` 체크 없이는 버튼 비활성, 동의 시각을 `orders.refund_policy_agreed_at`에 저장 |

---

### 기능 3: 내 라이브러리에서 구매 프롬프트 열람·다운로드 → 구현 명세

> PRD 매핑: 기능 3 — 구매자가 구매한 프롬프트 전문을 열람·복사·다운로드

**주요 파일**

| 파일 | 역할 |
|---|---|
| `src/app/[locale]/library/page.tsx` | 라이브러리 목록(RSC) |
| `src/app/[locale]/library/[templateId]/page.tsx` | 전문 열람(RSC, 소유권 검증 후 `body` 전달) |
| `src/app/api/library/[templateId]/download/route.ts` | 텍스트 파일 다운로드 |
| `src/components/library/PromptViewer.tsx` | 전문 표시 + 마지막 수정일 |
| `src/components/library/CopyButton.tsx` | 클립보드 복사 + 완료 토스트 |
| `src/server/library/access.ts` | 소유권 게이트 |
| `src/server/library/library.service.ts` | 목록/전문/열람 기록 |

**핵심 함수 시그니처**

```typescript
// src/server/library/access.ts  (import 'server-only')
export type AccessDenialReason = 'NOT_AUTHENTICATED' | 'NOT_OWNED' | 'REFUNDED';

/**
 * 라이브러리·전문 접근의 단일 게이트. 전문(body)을 읽는 모든 경로가 반드시 통과한다.
 * - 세션 없음            → AccessDeniedError('NOT_AUTHENTICATED')
 * - ACTIVE 소유 없음      → AccessDeniedError('NOT_OWNED')
 * - status='REVOKED'     → AccessDeniedError('REFUNDED')
 */
export async function assertTemplateAccess(userId: string, templateId: string)
  : Promise<LibraryItemWithOrder>;

// src/server/library/library.service.ts
export interface LibraryListItem {
  templateId: string; slug: string; title: string; thumbnailUrl: string;
  categoryName: string; grantedAt: string; orderNo: string;
  bodyUpdatedAt: string; status: LibraryItemStatus;
}
/** 구매 확정(ACTIVE) 항목만 granted_at DESC 정렬. 계정 귀속이라 기기 무관 동일 결과 */
export async function listMyLibrary(userId: string): Promise<LibraryListItem[]>;

/** 소유권 검증 통과 후에만 body 포함 뷰 반환 + first_viewed_at 최초 1회 기록 */
export async function getPurchasedTemplate(userId: string, templateId: string)
  : Promise<TemplateFullView>;

/** 다운로드 시 first_downloaded_at 최초 1회 기록 (이미 값이 있으면 갱신하지 않음) */
export async function markFirstDownload(userId: string, templateId: string): Promise<void>;

// src/app/api/library/[templateId]/download/route.ts
export const runtime = 'nodejs';
/**
 * GET → assertTemplateAccess → markFirstDownload → 화면과 동일한 body를 그대로 전송
 * Content-Type: text/plain; charset=utf-8
 * Content-Disposition: attachment; filename*=UTF-8''<slug>.txt
 * Cache-Control: no-store  (CDN/브라우저 캐시에 전문 잔류 금지)
 */
export async function GET(req: Request, ctx: { params: { templateId: string } }): Promise<Response>;
```

**보호 경로 처리 (`src/middleware.ts`)**

```typescript
// /[locale]/library/**, /[locale]/checkout/**, /[locale]/orders/** 는 인증 필수
// 미인증 → 302 /{locale}/login?callbackUrl=<원래 경로+쿼리>
// 로그인 성공 후 Auth.js가 callbackUrl로 복귀 (F3-AC8)
```

**수용 기준 매핑**

| PRD 수용 기준 | 구현 방법 |
|---|---|
| F3-AC1 구매일 최신순 목록 + 전문 화면 이동 | `listMyLibrary()`가 `status='ACTIVE'` 필터 + `granted_at DESC`(인덱스 `idx_library_user`). 각 카드가 `/library/{templateId}` 링크 |
| F3-AC2 마스킹 없는 전문 + 전체 복사 + 복사 완료 표시 | `getPurchasedTemplate()`이 `body` 전체 반환(마스킹 미적용 경로는 이 함수뿐). `CopyButton`이 `navigator.clipboard.writeText(body)` 후 토스트 + `aria-live="polite"` 안내 |
| F3-AC3 다운로드 파일 내용 = 화면 전문 | 다운로드 라우트가 화면과 동일한 `template.body` 원문을 변환 없이 스트리밍(가공·트림 없음). E2E에서 화면 텍스트와 파일 바이트 비교 |
| F3-AC4 계정 귀속, 다른 기기 동일 목록 | 소유 정보는 `library_items(user_id)`에만 존재. 클라이언트 스토리지 미사용, DB 세션 기반 인증 |
| F3-AC5 미구매 전문 경로 직접 접근 시 거부 + 상세로 안내 | `assertTemplateAccess()` → `NOT_OWNED` → 페이지는 `/templates/{slug}`로 리다이렉트, API는 403. 페이지·다운로드 라우트 모두 동일 게이트 통과 |
| F3-AC6 수정 시 최신 버전 열람 + 마지막 수정일 표시 | 전문은 항상 `templates.body` 실시간 조회(버전 스냅샷 미보관). `PromptViewer`가 `body_updated_at`을 "마지막 수정일"로 표기(가격 수정에는 반응하지 않음) |
| F3-AC7 구매 내역 없을 때 안내 + 목록 경로 | `items.length === 0` → `LibraryEmpty.tsx` (안내 문구 + "템플릿 둘러보기" 링크) |
| F3-AC8 미로그인 시 로그인 이동 후 원래 화면 복귀 | `middleware.ts`가 `callbackUrl` 부착 후 리다이렉트, Auth.js가 로그인 성공 시 해당 URL로 복귀 |
| F3-AC9 환불 완료 건 열람 차단 안내 | `library_items.status='REVOKED'` → `assertTemplateAccess()`가 `REFUNDED` 사유 반환 → "환불 처리된 템플릿입니다" 안내 페이지 렌더, `body`는 조회조차 하지 않음 |

---

## 7. API 엔드포인트 명세

모든 오류 응답 형식: `{ "error": { "code": string, "message": string, "details"?: unknown } }`

### 공개 API

| Method | Endpoint | 설명 | Request | Response |
|---|---|---|---|---|
| GET | `/api/templates` | 목록·검색·카테고리 필터 | Query: `q?`, `category?`, `page?=1`, `pageSize?=20` | `{ items: TemplateCardView[], total, page, pageSize, totalPages }` — **body 없음** |
| GET | `/api/templates/[slug]` | 상세(미리보기) | - | `{ template: TemplatePreviewView, isPurchasable: boolean }` — **body 없음**, 404 `TEMPLATE_NOT_FOUND` |

### 인증

| Method | Endpoint | 설명 | Request | Response |
|---|---|---|---|---|
| POST | `/api/auth/signup` | 이메일 회원가입 | `{ email, password, name?, locale }` | 201 `{ userId }` / 409 `EMAIL_TAKEN` / 400 `VALIDATION_ERROR` |
| ALL | `/api/auth/[...nextauth]` | 로그인·로그아웃·세션 (Auth.js) | - | Auth.js 표준 |

### 결제·주문 (인증 필수)

| Method | Endpoint | 설명 | Request | Response |
|---|---|---|---|---|
| POST | `/api/checkout` | 결제 시작, PENDING 주문 생성 | `{ templateSlug, currency: 'KRW'\|'USD', policyAgreed: true }` | 201 `StartCheckoutResult` / 409 `ALREADY_OWNED` / 409 `TEMPLATE_NOT_PURCHASABLE` / 400 `POLICY_NOT_AGREED` |
| GET | `/api/orders/[orderNo]` | 주문 상태 폴링(본인만) | - | `{ orderNo, status, currency, amount, templateId, failureMessage?, pollAfterMs }` / 404(타인 주문도 404) |
| POST | `/api/orders/[orderNo]/refund` | 환불 요청 | `{ reasonCode, reasonText? }` | 202 `{ refundId, status }` / 422 `REFUND_INELIGIBLE` + `reason` |
| GET | `/api/checkout/toss/return` | 토스 결제 성공 리디렉션 | Query: `paymentKey`, `orderId`, `amount` | confirm API 호출 후 **CONFIRMING** 전이 → 302 `/{locale}/checkout/status/{orderNo}` |
| GET | `/api/checkout/toss/fail` | 토스 실패 리디렉션 | Query: `code`, `message`, `orderId` | `markOrderFailed()` → 302 결제 실패 안내 |
| GET | `/api/checkout/paddle/return` | Paddle 완료 리디렉션 | Query: `_ptxn` | **CONFIRMING** 전이 → 302 대기 화면 |

### 라이브러리 (인증 + 소유권 필수)

| Method | Endpoint | 설명 | Request | Response |
|---|---|---|---|---|
| GET | `/api/library` | 내 라이브러리 목록 | - | `{ items: LibraryListItem[] }` |
| GET | `/api/library/[templateId]/download` | 전문 텍스트 파일 | - | `text/plain` 첨부, `Cache-Control: no-store` / 403 `NOT_OWNED` \| `REFUNDED` |

### 웹훅 (인증 없음, 서명 검증)

| Method | Endpoint | 설명 | Request | Response |
|---|---|---|---|---|
| POST | `/api/webhooks/toss` | 토스페이먼츠 결제 상태 통지 | raw JSON + 서명 헤더 | 200 `{ ok, deduped? }` / 401 서명 실패 |
| POST | `/api/webhooks/paddle` | Paddle 이벤트 통지 | raw JSON + `Paddle-Signature` | 200 `{ ok, deduped? }` / 401 서명 실패 |

> 웹훅은 처리 중 내부 오류가 나도 200을 반환하고 `webhook_events.status='FAILED'`로 기록한다. 구제는 재조회 배치가 담당하므로 결제사 재시도 폭주를 유발하지 않는다.

### 배치 (헤더 `x-cron-secret` 필수)

| Method | Endpoint | 주기 | Response |
|---|---|---|---|
| POST | `/api/cron/reconcile-payments` | 2분 | `{ scanned, confirmed, failed, expired, incidents }` / 401 |
| POST | `/api/cron/expire-orders` | 5분 | `{ expired }` / 401 |

### 서버 액션 (폼 제출 경로)

| 액션 | 파일 | 용도 |
|---|---|---|
| `signUpAction` | `app/actions/auth.actions.ts` | 회원가입 폼 |
| `startCheckoutAction` | `app/actions/checkout.actions.ts` | 통화 선택 후 결제 시작 |
| `markFirstViewAction` | `app/actions/library.actions.ts` | 전문 화면 진입 시 최초 열람 기록 |
| `requestRefundAction` | `app/actions/refund.actions.ts` | 환불 요청 폼 |

---

## 8. 검증 매트릭스 (PRD 수용 기준 30개 ↔ 구현 요소)

### 기능 1 — 템플릿 탐색 및 상세 미리보기 (9개)

| # | 수용 기준 | 구현 요소 | 파일 | 테스트 기준 |
|---|---|---|---|---|
| F1-AC1 | 목록 20개 단위, 제목·카테고리·가격(KRW/USD)·이미지 | `listTemplates()`, `TemplateCard` | `src/server/templates/template.service.ts`, `src/components/templates/TemplateCard.tsx` | E2E: 21개 시드에서 1페이지 20개, 카드에 KRW·USD 동시 표기 |
| F1-AC2 | 카테고리 + 검색어 동시 적용 | AND 결합 where, URL 쿼리 | `template.service.ts`, `CategoryFilter.tsx` | E2E: `?category=marketing&q=이메일` 결과가 두 조건 모두 만족 |
| F1-AC3 | 제목·설명 키워드 검색 | `OR contains` + pg_trgm | `template.service.ts`, `migration.sql` | E2E: 설명에만 있는 키워드로 검색 시 노출, 1초 내 응답 |
| F1-AC4 | 상세 6개 요소 표시 | `getTemplateDetail()` | `app/[locale]/templates/[slug]/page.tsx` | E2E: 6개 섹션 존재 단언 |
| F1-AC5 | 앞 30%만 노출 + 안내 문구 | `buildPreview()`, `PreviewPanel` | `src/server/templates/preview.ts` | Unit: 길이 1000 → previewText ≤ 300, 경계 스냅. E2E: 문구 노출 |
| F1-AC6 | 원문 완전 미노출 | server-only 격리, select 제외, RSC props 제한 | `template.repository.ts`, `preview.ts` | E2E: 페이지 HTML/RSC 페이로드/`/api/templates/*` 응답에 body 문자열 부재. Build: 클라이언트 번들에 `body` 필드 없음 |
| F1-AC7 | 0건 안내 + 전체 목록 복귀 | `EmptyResult` | `src/components/templates/EmptyResult.tsx` | E2E: 무의미 키워드 → 안내 + 링크 클릭 시 전체 목록 |
| F1-AC8 | 판매 중지/삭제 안내 + 버튼 숨김, 구매자 열람 유지 | `isPurchasable`, soft delete | `template.service.ts`, `access.ts` | E2E: SUSPENDED 상세는 안내+버튼 없음, 기구매 계정은 라이브러리 열람 성공 |
| F1-AC9 | 로드 실패 시 오류 + 재시도 | `error.tsx` + `RetryError` | `app/[locale]/error.tsx` | E2E: DB 오류 주입 시 재시도 버튼 노출·동작 |

### 기능 2 — 통화 선택 기반 결제 및 주문 생성 (12개)

| # | 수용 기준 | 구현 요소 | 파일 | 테스트 기준 |
|---|---|---|---|---|
| F2-AC1 | 통화 명시 선택 + 결제 전 금액 표시 | `CurrencySelector`, `PriceSummary` | `app/[locale]/checkout/[slug]/page.tsx` | E2E: 미선택 시 버튼 비활성, 선택 시 해당 통화 금액 표시 |
| F2-AC2 | KRW→토스 / USD→Paddle, IP 자동 판별 금지 | `getProviderForCurrency()` | `src/server/payments/provider.registry.ts` | Unit: 매핑 검증. Code: GeoIP·country 헤더 참조 0건 |
| F2-AC3 | 웹훅 확정 → PAID + 라이브러리 지급 | `handleIncomingWebhook`, `confirmOrderPaid` | `webhook.handler.ts`, `order.service.ts` | Integration: 서명된 성공 웹훅 → 주문 PAID + library_items 1건 |
| F2-AC4 | 구매 확인 메일 4개 항목 | `sendPurchaseConfirmationEmail` | `src/server/mail/mailer.ts`, `templates/purchase-confirmation.tsx` | Integration: 발송 페이로드에 주문번호·템플릿명·통화/금액·라이브러리 링크 포함, 1회만 발송 |
| F2-AC5 | 웹훅 기준 확정, 리디렉션 확정 금지, 자동 갱신 | 전이표(CONFIRMING→PAID는 WEBHOOK/BATCH만), `OrderStatusPoller` | `order.state-machine.ts`, `OrderStatusPoller.tsx` | Unit: REDIRECT 소스의 PAID 전이 시도 → 예외. E2E: 리디렉션 후 "결제 확인 중" → 웹훅 후 자동 이동 |
| F2-AC6 | 중복 웹훅 1건 처리 | `webhook_events` 유니크, FOR UPDATE, `library_items` 유니크 | `webhook.repository.ts`, `migration.sql` | Integration: 동일 웹훅 5회(동시 포함) → 주문 1건·지급 1건·메일 1건 |
| F2-AC7 | 중복 구매 차단 + 라이브러리 안내 | `AlreadyOwnedError`, `uq_orders_paid_owner` | `order.service.ts`, `migration.sql` | E2E: 보유 템플릿 재구매 → 409 + 안내, 결제창 미노출 |
| F2-AC8 | 가격 변경돼도 표시 금액으로 결제 | `orders.amount` 스냅샷 + 확정 시 금액 대조 | `order.service.ts` | Integration: 결제 중 가격 변경 → 확정 금액 = 스냅샷 금액 |
| F2-AC9 | 30분 만료, 재시도 시 새 금액 | `expires_at`, `expireOrders()` | `src/server/jobs/expire-orders.job.ts` | Unit: 31분 경과 PENDING → EXPIRED. E2E: 재시도 시 새 주문·현재가 |
| F2-AC10 | 실패 시 미확정 + 사유·재시도, 미지급 | `markOrderFailed()` | `order.service.ts`, 실패 안내 화면 | Integration: 실패 웹훅 → FAILED, library_items 0건, 사유 노출 |
| F2-AC11 | 확정 지연 기록·운영자 조회·24시간 안내·미지급 0건 | `CONFIRMING` + `reconcile_state`, `reconcilePayments()`, 리포트 메일 | `src/server/jobs/reconcile-payments.job.ts` | Integration: 웹훅 미도착 상태에서 배치 1회 → 자동 PAID. 24h 초과 → INCIDENT + 리포트에 포함 |
| F2-AC12 | 7일·미열람 환불, 확정 시 즉시 차단, 결제 전 동의 | `evaluateRefundEligibility()`, `REVOKED`, `RefundPolicyConsent` | `refund.policy.ts`, `refund.service.ts` | Unit: 6일·미열람=가능 / 8일=WINDOW_EXPIRED / 열람됨=ALREADY_VIEWED. E2E: 미동의 시 결제 버튼 비활성, 환불 후 열람 차단 |

### 기능 3 — 내 라이브러리에서 구매 프롬프트 열람·다운로드 (9개)

| # | 수용 기준 | 구현 요소 | 파일 | 테스트 기준 |
|---|---|---|---|---|
| F3-AC1 | 구매일 최신순 목록 + 전문 이동 | `listMyLibrary()` | `src/server/library/library.service.ts` | E2E: 3건 구매 후 최신순 정렬, 링크 이동 |
| F3-AC2 | 마스킹 없는 전문 + 복사 + 완료 표시 | `getPurchasedTemplate()`, `CopyButton` | `library.service.ts`, `CopyButton.tsx` | E2E: 화면 텍스트 = 원문 전체, 복사 후 클립보드 일치 + 완료 토스트 |
| F3-AC3 | 다운로드 파일 = 화면 전문 | 다운로드 라우트 | `app/api/library/[templateId]/download/route.ts` | E2E: 다운로드 파일 내용 === 화면 전문 |
| F3-AC4 | 계정 귀속, 기기 무관 동일 | `library_items.user_id`, DB 세션 | `library.service.ts`, `lib/auth.ts` | E2E: 두 브라우저 컨텍스트 동일 계정 → 동일 목록 |
| F3-AC5 | 미구매 직접 접근 거부 + 상세 안내 | `assertTemplateAccess()` | `src/server/library/access.ts` | E2E: 미구매 계정이 `/library/{id}` 접근 → 상세로 이동, 다운로드 API 403 |
| F3-AC6 | 수정 시 최신 버전 + 마지막 수정일 | 실시간 body 조회, `body_updated_at` | `library.service.ts`, `PromptViewer.tsx` | E2E: body 수정 후 재열람 시 최신 내용 + 수정일 갱신. 가격만 변경 시 수정일 불변 |
| F3-AC7 | 구매 없음 안내 + 목록 경로 | `LibraryEmpty` | `src/components/library/LibraryEmpty.tsx` | E2E: 신규 계정 → 안내 + 링크 |
| F3-AC8 | 미로그인 시 로그인 후 원래 화면 복귀 | `middleware.ts` + `callbackUrl` | `src/middleware.ts` | E2E: 로그아웃 상태 `/library/{id}` → 로그인 → 동일 URL 복귀 |
| F3-AC9 | 환불 완료 건 열람 차단 안내 | `REVOKED` + `AccessDeniedError('REFUNDED')` | `access.ts` | E2E: 환불 완료 후 열람 시 안내 문구, 응답에 body 부재 |

**매핑 결과: 30 / 30 (누락 0)**

### 비기능 요구사항 대응

| 요구사항 | 구현 요소 |
|---|---|
| 목록·상세 2.5초, 검색 1초 | RSC 스트리밍 + `loading.tsx`, pg_trgm GIN, 목록 쿼리 `select`로 필요한 컬럼만, `next/image` 최적화 |
| 확정 후 60초 내 반영 | 웹훅은 즉시 반영, 미도착 시 2분 주기 배치(최악 케이스 문서화) + 3초 폴링 UI |
| 동시 100 접속 / 10 결제 | Prisma 커넥션 풀(`connection_limit=10`), 확정은 주문 단위 행 잠금이라 락 경합 없음 |
| 비밀번호 복구 불가 저장 | argon2id, 응답·로그에 해시 미포함 |
| 전문 미노출 | 기능 1 4중 방어 + 다운로드 `no-store` |
| 카드정보 미보관 | 카드 입력은 결제사 화면. `payments.raw_snapshot`은 마스킹된 값만 저장(민감 필드 제거 후 저장) |
| 발신자 검증 통과 요청만 확정 | `verifyAndParseWebhook()` 실패 시 401 + 미처리, 확정은 조회 API 재확인 필수 |
| 본인 데이터만 접근 | `requireUser()` + `assertTemplateAccess()`, 타인 주문 조회는 404 |
| 360px~데스크톱 무가로스크롤 | Tailwind 반응형, E2E 뷰포트 360/768/1280 검증 |
| 키보드 조작 + 대비 4.5:1 | Radix 기반 컴포넌트, 포커스 링 유지, 팔레트 대비 검증 |
| ko/en 2개 언어 | next-intl + `messages/{ko,en}.json`, 결제 화면·메일 모두 로케일 반영 |

---

## 9. 환경 변수

`.env.example`

```bash
# ── 애플리케이션 ─────────────────────────────
NODE_ENV=development
APP_BASE_URL=http://localhost:3000
DEFAULT_LOCALE=ko

# ── 데이터베이스 ─────────────────────────────
POSTGRES_USER=ai_store
POSTGRES_PASSWORD=ai_store_local_pw
POSTGRES_DB=ai_store
DATABASE_URL=postgresql://ai_store:ai_store_local_pw@localhost:5432/ai_store?schema=public&connection_limit=10

# ── 인증 (Auth.js) ──────────────────────────
AUTH_SECRET=            # openssl rand -base64 32
AUTH_TRUST_HOST=true

# ── 토스페이먼츠 (KRW) ───────────────────────
TOSS_CLIENT_KEY=test_ck_xxx           # 클라이언트 노출 가능(결제창)
TOSS_SECRET_KEY=test_sk_xxx           # 서버 전용(승인·조회·취소 API)
TOSS_WEBHOOK_SECRET=                  # 웹훅 서명 검증 키
TOSS_API_BASE_URL=https://api.tosspayments.com

# ── Paddle (USD) ────────────────────────────
PADDLE_ENV=sandbox                    # sandbox | production
PADDLE_CLIENT_TOKEN=                  # 클라이언트 노출 가능(Paddle.js)
PADDLE_API_KEY=                       # 서버 전용
PADDLE_NOTIFICATION_SECRET=           # 웹훅 서명 검증 키
PADDLE_PRICE_ID_MAP_JSON={}           # 템플릿 slug → Paddle price id (선택)

# ── 메일 ────────────────────────────────────
RESEND_API_KEY=
MAIL_FROM="ai_store <no-reply@example.com>"
OPERATOR_ALERT_EMAIL=operator@example.com   # 미확정 결제 리포트 수신

# ── 배치 ────────────────────────────────────
CRON_SECRET=                          # /api/cron/* 호출 인증 헤더 값
RECONCILE_LOOKBACK_HOURS=72
RECONCILE_INCIDENT_AFTER_HOURS=24
ORDER_EXPIRE_MINUTES=30
```

> `src/lib/env.ts`가 Zod로 부팅 시 검증한다. `NEXT_PUBLIC_` 접두사는 `TOSS_CLIENT_KEY`, `PADDLE_CLIENT_TOKEN`처럼 **클라이언트 노출이 허용된 값에만** 부여하며(빌드 시 `NEXT_PUBLIC_TOSS_CLIENT_KEY` 등으로 노출), 시크릿 키는 서버에서만 읽는다.

---

## 10. docker-compose 구성

`docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: ai_store_db
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      TZ: Asia/Seoul
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/postgres/init:/docker-entrypoint-initdb.d:ro   # citext, pg_trgm 확장 생성
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 10

  # 개발 환경 배치 스케줄러: 호스트의 Next.js dev 서버 엔드포인트를 주기 호출
  cron:
    image: alpine:3.20
    container_name: ai_store_cron
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      APP_BASE_URL: ${APP_BASE_URL_INTERNAL:-http://host.docker.internal:3000}
      CRON_SECRET: ${CRON_SECRET}
    entrypoint: >
      sh -c "apk add --no-cache curl >/dev/null &&
             while true; do
               curl -s -X POST -H \"x-cron-secret: $$CRON_SECRET\" $$APP_BASE_URL/api/cron/reconcile-payments > /dev/null;
               sleep 120;
             done &
             while true; do
               curl -s -X POST -H \"x-cron-secret: $$CRON_SECRET\" $$APP_BASE_URL/api/cron/expire-orders > /dev/null;
               sleep 300;
             done"
    extra_hosts:
      - "host.docker.internal:host-gateway"

volumes:
  pgdata:
```

`docker/postgres/init/001-extensions.sql`

```sql
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
```

**로컬 실행 순서**

```bash
cp .env.example .env
docker compose up -d postgres        # DB 기동
npx prisma migrate dev               # 스키마 반영
npx prisma db seed                   # 카테고리·템플릿 시드
npm run dev                          # http://localhost:3000
docker compose up -d cron            # 배치 시작
# 웹훅 로컬 수신: ngrok http 3000 → 결제사 대시보드에 웹훅 URL 등록
```

> 운영 배포 시 `cron` 컨테이너 대신 호스팅 플랫폼의 Cron 기능(예: Vercel Cron)으로 동일 엔드포인트를 호출한다. 엔드포인트와 로직은 동일하다.

---

## 11. 설계 과정에서 확인된 미결 사항

PRD 7장의 Open Question 중 Q5·Q9는 본 문서에서 해결(D5·D4)했다. 아래는 **설계 중 새로 드러난 항목**으로, 구현 착수 전 확정이 필요하다.

| # | 항목 | 설계상 임시 결정 | 확정 필요 이유 |
|---|---|---|---|
| N1 | **운영자 템플릿 등록 수단** | `prisma/seed.ts` + DB 직접 입력 | PRD는 운영자 역할을 "관리자 화면에서 상품 등록·관리"로 기술하나, 기능 요구사항 3개에는 관리자 CRUD가 없다. 기능 개수를 3개로 고정하면 등록 화면을 만들 수 없으므로 시드/직접 입력으로 처리. 실제 운영 방식 확정 필요 |
| N2 | **템플릿 콘텐츠의 다국어** | 단일 언어로 작성, UI 문구만 ko/en | PRD는 "화면 문구 2개 언어"만 요구. 해외 구매자가 보는 템플릿 제목·설명·프롬프트 본문의 언어 정책이 미정(영문 템플릿 별도 등록 여부) |
| N3 | **Toss 승인(confirm) 시점과 주문 확정 분리** | 리디렉션에서 승인 API 호출(매입), 주문 확정은 웹훅/배치 | 토스 표준 결제는 승인 API 호출이 없으면 결제가 자동 취소된다. 사용자가 리디렉션 전에 브라우저를 닫으면 승인이 누락될 수 있어, "배치가 조회 후 승인까지 대행할지" 확정 필요 |
| N4 | **Paddle 상품 등록 방식** | 템플릿↔Paddle price 매핑을 환경 변수로 유지 | Paddle은 자체 카탈로그에 상품·가격을 보유한다. 템플릿 추가 시 Paddle 상품을 수동 등록할지, API로 자동 생성할지 미정. USD 가격의 단일 진실 소스(스토어 DB vs Paddle 카탈로그)가 결정되어야 함 |
| N5 | **Paddle 환불의 주도권** | 스토어에서 요청 → Paddle adjustments 생성 | PRD Q2와 연결. Paddle에서 구매자가 직접 환불을 받은 경우 스토어가 `REFUND_REQUESTED`를 거치지 않고 `PAID → REFUNDED`로 직접 전이해야 한다. 이 전이를 전이표에 추가할지 결정 필요 |
| N6 | **웹훅 서명 헤더 스펙 확인** | HMAC-SHA256 + 타임스탬프 허용 오차 5분으로 설계 | 결제사 문서 개정 가능성이 있어 구현 시 최신 스펙 재확인 필요. 확정 판단은 조회 API가 담당하므로 영향은 인증 단계에 한정 |
| N7 | **금액 불일치 시 처리** | 확정 보류 + INCIDENT 기록 | 결제사 승인 금액과 주문 스냅샷 금액이 다를 때 자동 환불할지, 확정 후 사후 조치할지 미정. 발생 빈도는 낮으나 금전 사고 경로 |
| N8 | **결제 실패 후 다른 통화 재시도** | 새 주문 생성으로 허용(제한 없음) | PRD Q10 미해결분. 동일 사용자·템플릿에 대해 서로 다른 통화의 PENDING 주문이 동시에 존재할 수 있는데, 두 건이 모두 성공하면 `uq_orders_paid_owner` 위반으로 후속 건이 실패한다. 이때 자동 환불 정책 필요 |
| N9 | **이메일 인증 필수 여부** | 컬럼만 확보, 미인증 결제 허용 | PRD Q11 미해결분. 필수화하면 회원가입 플로우에 인증 메일 발송·확인 화면이 추가된다 |
| N10 | **미리보기 30% 경계 스냅 방향** | 상한 이내에서 뒤로 스냅(30% 초과 불가) | 문장 중간 절단 방지를 위한 규칙. "최대 30%" 해석을 초과 불가로 확정했으나 운영자 기대와 다를 수 있음 |
