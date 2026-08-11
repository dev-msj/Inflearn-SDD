import 'server-only';

import { render } from '@react-email/components';
import { createElement } from 'react';
import { Resend } from 'resend';

import {
  PurchaseConfirmationEmail,
  purchaseConfirmationSubject,
} from './templates/purchase-confirmation';
import {
  ReconciliationReportEmail,
  reconciliationReportSubject,
  type ReconciliationIncident,
} from './templates/reconciliation-report';
import { findOrderForMail, isUniqueViolation } from '@/server/orders/order.repository';
import { db } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { logger, orderLogger } from '@/lib/logger';
import { DEFAULT_LOCALE, isAppLocale } from '@/i18n/routing';

/**
 * 메일 발송 (F2-AC4, F2-AC11).
 *
 * ★멱등 발송의 근거는 애플리케이션 플래그가 아니라 DB 제약이다.
 *   `outbound_emails UNIQUE(type, order_id)`에 먼저 INSERT를 시도하고,
 *   유니크 위반이 나면 "이미 발송(또는 발송 시도)된 주문"이므로 조용히 건너뛴다.
 *   중복 웹훅과 재조회 배치가 같은 주문을 동시에 확정해도 구매 확인 메일은 1통만 나간다.
 *
 * 발송 실패는 예외로 전파하지 않는다. 메일 실패 때문에 이미 커밋된 주문 확정이 롤백되면
 * "결제됐는데 미지급" 상태가 되기 때문이다(F2-AC11의 미지급 0건 요구).
 */

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) resendClient = new Resend(getServerEnv().RESEND_API_KEY);
  return resendClient;
}

export interface SendResult {
  sent: boolean;
  /** 이미 같은 주문으로 발송 기록이 있어 건너뛴 경우 true (F2-AC4의 "1회만 발송"). */
  deduped: boolean;
}

interface DeliverArgs {
  outboundEmailId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function deliver(args: DeliverArgs): Promise<boolean> {
  const env = getServerEnv();

  try {
    const response = await getResend().emails.send({
      from: env.MAIL_FROM,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });

    if (response.error) {
      await db.outboundEmail.update({
        where: { id: args.outboundEmailId },
        data: { status: 'FAILED', error: response.error.message },
      });
      return false;
    }

    await db.outboundEmail.update({
      where: { id: args.outboundEmailId },
      data: {
        status: 'SENT',
        providerMessageId: response.data?.id ?? null,
        sentAt: new Date(),
      },
    });
    return true;
  } catch (error) {
    await db.outboundEmail.update({
      where: { id: args.outboundEmailId },
      data: { status: 'FAILED', error: error instanceof Error ? error.message : 'unknown' },
    });
    return false;
  }
}

/** HTML 대체용 평문. 메일 클라이언트가 HTML을 막아도 4개 항목이 전달되어야 한다(F2-AC4). */
function buildPurchaseText(args: {
  locale: 'ko' | 'en';
  orderNo: string;
  templateTitle: string;
  currency: string;
  amount: string;
  libraryUrl: string;
}): string {
  return args.locale === 'ko'
    ? [
        '구매가 완료되었습니다.',
        `주문 번호: ${args.orderNo}`,
        `템플릿: ${args.templateTitle}`,
        `결제 금액: ${args.amount} ${args.currency}`,
        `내 라이브러리: ${args.libraryUrl}`,
      ].join('\n')
    : [
        'Your purchase is complete.',
        `Order number: ${args.orderNo}`,
        `Template: ${args.templateTitle}`,
        `Amount paid: ${args.amount} ${args.currency}`,
        `Your library: ${args.libraryUrl}`,
      ].join('\n');
}

/**
 * 구매 확인 메일 (F2-AC4).
 * confirmOrderPaid()가 alreadyConfirmed=false를 반환한 경우에만 호출한다.
 * 그럼에도 DB 유니크로 한 번 더 방어한다(웹훅과 배치가 동시에 확정을 시도하는 경우).
 */
export async function sendPurchaseConfirmationEmail(orderId: string): Promise<SendResult> {
  const order = await findOrderForMail(orderId);
  if (!order) {
    logger.warn('purchase_email_order_missing', { orderId });
    return { sent: false, deduped: false };
  }

  const log = orderLogger(order.orderNo);
  const env = getServerEnv();
  const locale = isAppLocale(order.userLocale) ? order.userLocale : DEFAULT_LOCALE;
  const libraryUrl = `${env.APP_BASE_URL.replace(/\/$/, '')}/${locale}/library`;

  let outboundEmailId: string;
  try {
    const created = await db.outboundEmail.create({
      data: {
        type: 'PURCHASE_CONFIRMATION',
        toEmail: order.userEmail,
        orderId: order.orderId,
        status: 'QUEUED',
      },
      select: { id: true },
    });
    outboundEmailId = created.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      log.info('purchase_email_deduped');
      return { sent: false, deduped: true };
    }
    throw error;
  }

  const element = createElement(PurchaseConfirmationEmail, {
    locale,
    orderNo: order.orderNo,
    templateTitle: order.templateTitle,
    currency: order.currency,
    amount: order.amount,
    libraryUrl,
    supportEmail: env.OPERATOR_ALERT_EMAIL,
  });

  const html = await render(element);
  const text = buildPurchaseText({
    locale,
    orderNo: order.orderNo,
    templateTitle: order.templateTitle,
    currency: order.currency,
    amount: order.amount,
    libraryUrl,
  });

  const sent = await deliver({
    outboundEmailId,
    to: order.userEmail,
    subject: purchaseConfirmationSubject(locale, order.orderNo),
    html,
    text,
  });

  log.info('purchase_email_processed', { sent });
  return { sent, deduped: false };
}

/**
 * 미확정 결제 운영자 리포트 (F2-AC11).
 * order_id가 NULL이라 유니크 제약이 걸리지 않으므로(Postgres NULL 비교 규칙) 주기적으로 여러 번 보낼 수 있다.
 */
export async function sendReconciliationReportEmail(
  incidents: ReconciliationIncident[],
): Promise<SendResult> {
  if (incidents.length === 0) return { sent: false, deduped: false };

  const env = getServerEnv();

  const created = await db.outboundEmail.create({
    data: {
      type: 'RECONCILE_REPORT',
      toEmail: env.OPERATOR_ALERT_EMAIL,
      status: 'QUEUED',
    },
    select: { id: true },
  });

  const generatedAt = new Date().toISOString();
  const element = createElement(ReconciliationReportEmail, {
    generatedAt,
    incidents,
    incidentAfterHours: env.RECONCILE_INCIDENT_AFTER_HOURS,
  });

  const html = await render(element);
  const text = [
    `미확정 결제 ${incidents.length}건 (생성: ${generatedAt})`,
    ...incidents.map(
      (incident) =>
        `${incident.orderNo} / ${incident.status} / ${incident.provider} / ${incident.amount} ${incident.currency} / ${incident.createdAt}`,
    ),
  ].join('\n');

  const sent = await deliver({
    outboundEmailId: created.id,
    to: env.OPERATOR_ALERT_EMAIL,
    subject: reconciliationReportSubject(incidents.length),
    html,
    text,
  });

  logger.info('reconcile_report_processed', { jobName: 'reconcile-payments', sent });
  return { sent, deduped: false };
}

export type { ReconciliationIncident };
