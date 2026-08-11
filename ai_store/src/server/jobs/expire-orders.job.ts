import 'server-only';

import { findExpiredPendingOrders } from '@/server/orders/order.repository';
import { confirmOrderPaid, expireOrder } from '@/server/orders/order.service';
import { sendPurchaseConfirmationEmail } from '@/server/mail/mailer';
import { getProviderById } from '@/server/payments/provider.registry';
import { logger, orderLogger } from '@/lib/logger';

/**
 * 결제 시도 만료 배치 (F2-AC9).
 *
 * 실행 주기: 5분 (`POST /api/cron/expire-orders`)
 * 대상: `status='PENDING' AND expires_at < now()`
 *
 * ★만료 처리 전에 반드시 결제사 조회를 한 번 더 한다.
 *   "사용자가 30분 경계 직전에 결제를 끝냈지만 웹훅이 아직 안 온" 경우를 만료시키면
 *   돈은 받고 지급은 안 되는 상태가 된다(F2-AC11의 미지급 0건 위반).
 *   조회 결과가 SUCCEEDED면 만료 대신 확정한다.
 */

const BATCH_LIMIT = 200;
const JOB_NAME = 'expire-orders';

export interface ExpireOrdersResult {
  expired: number;
  /** 만료 직전에 성공이 확인되어 구제된 건수 */
  confirmed: number;
}

export async function expireOrders(now: Date = new Date()): Promise<ExpireOrdersResult> {
  const candidates = await findExpiredPendingOrders(now, BATCH_LIMIT);
  let expired = 0;
  let confirmed = 0;

  for (const order of candidates) {
    const log = orderLogger(order.orderNo, { jobName: JOB_NAME, provider: order.provider });

    try {
      const provider = getProviderById(order.provider);
      const snapshot = await provider.fetchPayment({
        providerOrderRef: order.orderNo,
        providerPaymentId: order.providerPaymentId,
        expectedAmount: order.amount,
      });

      if (snapshot?.status === 'SUCCEEDED') {
        const result = await confirmOrderPaid({ orderNo: order.orderNo, snapshot, source: 'BATCH' });
        if (!result.alreadyConfirmed) {
          await sendPurchaseConfirmationEmail(result.orderId);
          confirmed += 1;
        }
        log.info('expire_rescued_by_confirm');
        continue;
      }

      if (await expireOrder(order.orderNo)) expired += 1;
    } catch (error) {
      // 한 건의 실패가 배치 전체를 멈추지 않게 한다. 다음 주기에 다시 시도된다.
      log.error('expire_order_failed', {}, error);
    }
  }

  logger.info('job_completed', { jobName: JOB_NAME, scanned: candidates.length, expired, confirmed });
  return { expired, confirmed };
}
