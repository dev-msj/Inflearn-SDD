-- ════════════════════════════════════════════════════════════════════════════
-- 0001_init — TECH_SPEC 3장 데이터 모델 초기 마이그레이션
--
-- 구성
--   1) 확장 생성 (citext / pg_trgm / pgcrypto)
--   2) Prisma 스키마에서 생성된 표준 DDL (enum · table · index · FK)
--   3) Prisma가 표현할 수 없는 raw 객체
--      - CHECK 제약 (가격 음수 금지)
--      - 부분 인덱스 (판매 목록 · 배치 스캔)
--      - 부분 UNIQUE 인덱스 (중복 지급/중복 환불 차단)
--      - pg_trgm GIN 인덱스 (제목·설명 부분 일치 검색 1초 기준, F1-AC3)
--
-- ※ 3)의 객체는 prisma/schema.prisma에 선언되어 있지 않다. 스키마를 변경해
--    새 마이그레이션을 만들 때는 이 블록을 반드시 다시 포함시킬 것.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) 확장 ──────────────────────────────────────────────────────────────────
-- citext  : users.email 대소문자 무관 유일
-- pg_trgm : 제목·설명 ILIKE 부분 일치 검색 인덱스
-- pgcrypto: gen_random_uuid() 기본값
-- docker/postgres/init/001-extensions.sql과 중복되지만, 운영 DB처럼 init 스크립트가
-- 실행되지 않는 환경에서도 마이그레이션만으로 스키마가 완성되도록 여기서도 보장한다.
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 2) Prisma 표준 DDL ───────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'ON_SALE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('KRW', 'USD');

-- CreateEnum
CREATE TYPE "PaymentProviderId" AS ENUM ('TOSS', 'PADDLE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMING', 'PAID', 'FAILED', 'EXPIRED', 'REFUND_REQUESTED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ReconcileState" AS ENUM ('NONE', 'WATCHING', 'INCIDENT', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ProviderPaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'EXPIRED', 'REFUNDED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "LibraryItemStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "OrderEventSource" AS ENUM ('WEBHOOK', 'BATCH', 'REDIRECT', 'USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "OutboundEmailType" AS ENUM ('PURCHASE_CONFIRMATION', 'RECONCILE_REPORT');

-- CreateEnum
CREATE TYPE "OutboundEmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'ko',
    "email_verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMPTZ(6) NOT NULL
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name_ko" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "category_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "usage_guide" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "preview_text" TEXT NOT NULL,
    "preview_char_count" INTEGER NOT NULL,
    "masked_char_count" INTEGER NOT NULL,
    "thumbnail_url" TEXT NOT NULL,
    "price_krw" INTEGER NOT NULL,
    "price_usd" DECIMAL(10,2) NOT NULL,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ(6),
    "body_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_no" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "currency" "Currency" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "provider" "PaymentProviderId" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "provider_order_ref" TEXT NOT NULL,
    "provider_payment_id" TEXT,
    "refund_policy_agreed_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "paid_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "expired_at" TIMESTAMPTZ(6),
    "refunded_at" TIMESTAMPTZ(6),
    "failure_code" TEXT,
    "failure_message" TEXT,
    "reconcile_state" "ReconcileState" NOT NULL DEFAULT 'NONE',
    "reconcile_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_reconciled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "provider" "PaymentProviderId" NOT NULL,
    "provider_payment_id" TEXT NOT NULL,
    "status" "ProviderPaymentStatus" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "method" TEXT,
    "approved_at" TIMESTAMPTZ(6),
    "raw_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "status" "LibraryItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "first_viewed_at" TIMESTAMPTZ(6),
    "first_downloaded_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "library_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" "PaymentProviderId" NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "signature_verified" BOOLEAN NOT NULL,
    "order_id" UUID,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB NOT NULL,
    "error" TEXT,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason_code" TEXT NOT NULL,
    "reason_text" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "provider_refund_id" TEXT,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "source" "OrderEventSource" NOT NULL,
    "actor" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_emails" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "OutboundEmailType" NOT NULL,
    "to_email" TEXT NOT NULL,
    "order_id" UUID,
    "status" "OutboundEmailStatus" NOT NULL DEFAULT 'QUEUED',
    "provider_message_id" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbound_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "templates_slug_key" ON "templates"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "uq_orders_no" ON "orders"("order_no");

-- CreateIndex
CREATE INDEX "idx_orders_user" ON "orders"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_payments_provider_ref" ON "payments"("provider", "provider_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_library_order" ON "library_items"("order_id");

-- CreateIndex
CREATE INDEX "idx_library_user" ON "library_items"("user_id", "granted_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_library_owner" ON "library_items"("user_id", "template_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_webhook_event" ON "webhook_events"("provider", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_outbound_email_order" ON "outbound_emails"("type", "order_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── 3) Prisma 미지원 raw 객체 ────────────────────────────────────────────────

-- 가격은 통화별 개별 고정가(D4)이며 음수가 될 수 없다.
ALTER TABLE "templates" ADD CONSTRAINT "templates_price_krw_check" CHECK ("price_krw" >= 0);
ALTER TABLE "templates" ADD CONSTRAINT "templates_price_usd_check" CHECK ("price_usd" >= 0);

-- 목록 조회: 판매 중 + 최신순 + 20개 페이지네이션.
-- soft delete 건은 목록에서 제외되므로 부분 인덱스로 인덱스 크기를 줄인다.
CREATE INDEX "idx_templates_onsale" ON "templates" ("status", "published_at" DESC)
  WHERE "deleted_at" IS NULL;
CREATE INDEX "idx_templates_category" ON "templates" ("category_id", "status", "published_at" DESC)
  WHERE "deleted_at" IS NULL;

-- 검색(F1-AC3): 제목·설명 부분 일치. ILIKE '%키워드%'는 B-tree로 가속되지 않으므로 trigram GIN 사용.
CREATE INDEX "idx_templates_title_trgm" ON "templates" USING gin ("title" gin_trgm_ops);
CREATE INDEX "idx_templates_desc_trgm"  ON "templates" USING gin ("description" gin_trgm_ops);

-- ★중복 구매·중복 지급 차단(F2-AC6, F2-AC7)의 DB 레벨 최종 방어선.
--   애플리케이션 검사(startCheckout의 보유 여부 확인)와 이중으로 방어한다.
--   PAID·REFUND_REQUESTED만 대상으로 하는 부분 유니크이므로,
--   FAILED/EXPIRED/REFUNDED 이후의 재시도 주문은 정상적으로 다시 생성할 수 있다.
--   서로 다른 통화의 주문이 동시에 확정되면 후속 건이 여기서 롤백된다 →
--   TECH_SPEC 11장 N8 가정에 따라 후속 건은 자동 환불 대상으로 표시한다(order.service 책임).
CREATE UNIQUE INDEX "uq_orders_paid_owner" ON "orders" ("user_id", "template_id")
  WHERE "status" IN ('PAID', 'REFUND_REQUESTED');

-- 진행 중이거나 완료된 환불이 주문당 1건을 넘지 못하게 한다(REJECTED는 재요청 허용).
CREATE UNIQUE INDEX "uq_refunds_active" ON "refunds" ("order_id")
  WHERE "status" IN ('REQUESTED', 'APPROVED', 'COMPLETED');

-- 재조회 배치(D5) 스캔 대상: 미확정 주문을 last_reconciled_at 오래된 순으로 집는다.
CREATE INDEX "idx_orders_reconcile" ON "orders" ("status", "last_reconciled_at" NULLS FIRST)
  WHERE "status" IN ('PENDING', 'CONFIRMING');

-- 만료 배치(F2-AC9) 스캔 대상: expires_at 경과한 PENDING 주문.
CREATE INDEX "idx_orders_expiring" ON "orders" ("expires_at")
  WHERE "status" = 'PENDING';
