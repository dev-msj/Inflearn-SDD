/**
 * 도메인 타입 단일 소스 (TECH_SPEC 5장).
 *
 * ★이 파일은 클라이언트 번들에 포함될 수 있다. 따라서
 *  - `import 'server-only'`를 선언하지 않으며
 *  - Prisma 생성 타입이나 server/** 모듈을 절대 import 하지 않는다.
 * Prisma enum과 값이 동일하지만 의도적으로 별도 선언한다. Prisma 타입을 클라이언트 컴포넌트가
 * import 하면 `@prisma/client`가 번들에 딸려 들어오기 때문이다.
 */

export type Currency = 'KRW' | 'USD';
export type PaymentProviderId = 'TOSS' | 'PADDLE';

export type OrderStatus =
  | 'PENDING' // 결제창 진입, 30분 만료 대기
  | 'CONFIRMING' // 결제사 성공 신호 수신, 웹훅 확정 대기 = "결제 확인 중"
  | 'PAID'
  | 'FAILED'
  | 'EXPIRED'
  | 'REFUND_REQUESTED'
  | 'REFUNDED';

export type OrderEventSource = 'WEBHOOK' | 'BATCH' | 'REDIRECT' | 'USER' | 'SYSTEM';
export type ReconcileState = 'NONE' | 'WATCHING' | 'INCIDENT' | 'RESOLVED';
export type LibraryItemStatus = 'ACTIVE' | 'REVOKED';
export type TemplateStatus = 'DRAFT' | 'ON_SALE' | 'SUSPENDED';
export type RefundStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED';

/** 주문 상태 중 더 이상 어떤 전이도 허용되지 않는 종료 상태. 재시도는 새 주문으로만 가능하다. */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ['FAILED', 'EXPIRED', 'REFUNDED'];

/**
 * 미구매자에게 전달 가능한 템플릿 뷰.
 * ★body 필드가 타입에 존재하지 않는다(F1-AC6). 레포지토리가 실수로 전문을 담아 반환하면
 *   반환 타입 불일치로 컴파일 단계에서 걸린다.
 */
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
  priceKrw: number; // 통화별 개별 고정가 (D4)
  priceUsd: string; // Decimal 직렬화 문자열
  status: TemplateStatus;
  previewText: string; // 전문의 앞 30% 이하
  maskedCharCount: number;
  bodyUpdatedAt: string;
}

/**
 * 구매 확정자에게만 전달되는 뷰. 소유권 검증(assertTemplateAccess) 통과 후에만 생성 가능.
 * 이 타입을 반환하는 함수는 library.service.ts의 getPurchasedTemplate() 하나뿐이어야 한다.
 */
export interface TemplateFullView extends TemplatePreviewView {
  body: string;
}

/** 목록 카드용 축약 뷰. 목록에는 description·usageGuide·previewText를 싣지 않는다. */
export interface TemplateCardView {
  id: string;
  slug: string;
  title: string;
  summary: string;
  categorySlug: string;
  categoryName: string;
  thumbnailUrl: string;
  priceKrw: number;
  priceUsd: string;
  status: TemplateStatus;
}

/** 카테고리 필터 UI용 뷰. name은 요청 로케일에 맞춰 이미 선택된 값이다. */
export interface CategoryView {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
}

/** 라이브러리 목록 항목 (F3-AC1). body는 포함하지 않는다. */
export interface LibraryListItem {
  templateId: string;
  slug: string;
  title: string;
  thumbnailUrl: string;
  categoryName: string;
  grantedAt: string;
  orderNo: string;
  bodyUpdatedAt: string;
  status: LibraryItemStatus;
}

/**
 * 주문 상태 폴링 응답용 뷰 (F2-AC5).
 * 본인 주문이 아니면 이 뷰를 만들지 않고 NotFoundError를 던진다(주문 존재 여부 노출 금지).
 */
export interface OrderStatusView {
  orderNo: string;
  status: OrderStatus;
  currency: Currency;
  amount: string;
  templateId: string;
  templateSlug: string;
  failureCode?: string | null;
  failureMessage?: string | null;
  /** 확정 지연(CONFIRMING + reconcileState=INCIDENT) 시 "최대 24시간" 안내를 띄우기 위한 플래그 */
  delayed: boolean;
  /** 클라이언트 폴링 간격(ms). 서버가 부하에 따라 조절할 수 있도록 응답에 포함한다. */
  pollAfterMs: number;
}

/**
 * 결제창을 여는 데 필요한 클라이언트 페이로드.
 *
 * ★TECH_SPEC은 이 타입을 server/payments/provider.types.ts에 두지만,
 *   값 자체가 클라이언트 컴포넌트(CheckoutButton / PaddleCheckoutLauncher)까지 전달되어야 하므로
 *   server-only 모듈에 두면 클라이언트가 타입을 import 할 수 없다.
 *   따라서 선언은 여기(client-safe)에 두고 provider.types.ts가 re-export 한다.
 *   시크릿이 아닌 값(clientKey / clientToken)만 담긴다는 점을 타입으로 고정하는 효과도 있다.
 */
export type ClientCheckoutPayload =
  | {
      kind: 'TOSS_WIDGET';
      clientKey: string;
      orderId: string;
      orderName: string;
      amount: number;
      customerEmail: string;
      successUrl: string;
      failUrl: string;
    }
  | {
      kind: 'PADDLE_OVERLAY';
      clientToken: string;
      transactionId: string;
      environment: 'sandbox' | 'production';
    };

/** 환불 요청 사유 코드. 메시지 카탈로그의 refundRequest.reasonCodes.* 키와 1:1 대응한다. */
export type RefundReasonCode = 'NOT_AS_DESCRIBED' | 'MISTAKEN_PURCHASE' | 'OTHER';

/** 환불 접수 불가 사유 (F2-AC12). 메시지 키 refundRequest.ineligible.* 와 1:1 대응한다. */
export type RefundIneligibleReason =
  | 'ORDER_NOT_PAID'
  | 'WINDOW_EXPIRED'
  | 'ALREADY_VIEWED'
  | 'ALREADY_DOWNLOADED'
  | 'ALREADY_REQUESTED';

/** 전문 접근 거부 사유 (F3-AC5, F3-AC9). */
export type AccessDenialReason = 'NOT_AUTHENTICATED' | 'NOT_OWNED' | 'REFUNDED';
