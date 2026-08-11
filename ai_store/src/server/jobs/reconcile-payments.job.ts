import 'server-only';

import {
  findIncidentOrders,
  findReconcileCandidates,
  recordReconcileAttempt,
  type ReconcileCandidate,
} from '@/server/orders/order.repository';
import {
  confirmOrderPaid,
  expireOrder,
  markOrderConfirming,
  markOrderFailed,
  markOrderIncident,
} from '@/server/orders/order.service';
import { sendPurchaseConfirmationEmail, sendReconciliationReportEmail } from '@/server/mail/mailer';
import { getProviderById } from '@/server/payments/provider.registry';
import type { ProviderPaymentSnapshot } from '@/server/payments/provider.types';
import { getServerEnv } from '@/lib/env';
import { logger, orderLogger } from '@/lib/logger';

/**
 * 자동 재조회 배치 (D5, F2-AC3/5/9/11).
 *
 * 실행 주기: 2분 (`POST /api/cron/reconcile-payments`)
 * 대상: `status IN ('PENDING','CONFIRMING') AND created_at > now() - RECONCILE_LOOKBACK_HOURS`
 *       `ORDER BY last_reconciled_at NULLS FIRST LIMIT 100`
 *
 * ★이 배치가 "결제는 됐는데 미지급"을 0건으로 만드는 장치다.
 *   웹훅이 유실되거나 사용자가 리디렉션 전에 브라우저를 닫아도, 결제사 조회 API가
 *   SUCCEEDED를 돌려주면 웹훅과 **동일한 확정 함수**(confirmOrderPaid)를 호출한다.
 *   경로가 달라도 결과가 갈리지 않는 이유가 여기에 있다.
 *
 * ★24시간을 넘겨도 확정되지 않은 CONFIRMING 건은 **상태를 바꾸지 않고** INCIDENT로만 표시한다.
 *   자동 실패 처리하면 결제된 돈에 대한 지급 의무가 사라진 것처럼 보이기 때문이다.
 */

const JOB_NAME = 'reconcile-payments';
const BATCH_LIMIT = 100;
const INCIDENT_REPORT_LIMIT = 100;
/** 백오프 상한(분). 오래된 건도 최소 30분에 한 번은 재확인한다. */
const MAX_BACKOFF_MINUTES = 30;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export interface ReconcileResult {
  scanned: number;
  confirmed: number;
  failed: number;
  expired: number;
  /** 24시간 초과 미확정 건수 (F2-AC11) */
  incidents: number;
}

/** 재시도 간격 = min(2^attempts, 30)분. 결제사 API 호출 폭주를 막는다. */
function nextAttemptAllowed(candidate: ReconcileCandidate, now: Date): boolean {
  if (!candidate.lastReconciledAt) return true;

  const backoffMinutes = Math.min(2 ** candidate.reconcileAttempts, MAX_BACKOFF_MINUTES);
  return now.getTime() - candidate.lastReconciledAt.getTime() >= backoffMinutes * MINUTE_MS;
}

interface HandleResult {
  confirmed: boolean;
  failed: boolean;
  expired: boolean;
  incident: boolean;
}

const NO_CHANGE: HandleResult = { confirmed: false, failed: false, expired: false, incident: false };

async function handleCandidate(
  candidate: ReconcileCandidate,
  snapshot: ProviderPaymentSnapshot | null,
  now: Date,
  incidentAfterMs: number,
): Promise<HandleResult> {
  const log = orderLogger(candidate.orderNo, { jobName: JOB_NAME, provider: candidate.provider });

  // 1) 성공 확인 → 웹훅과 동일한 확정 경로.
  if (snapshot?.status === 'SUCCEEDED') {
    const result = await confirmOrderPaid({ orderNo: candidate.orderNo, snapshot, source: 'BATCH' });
    if (!result.alreadyConfirmed) {
      await sendPurchaseConfirmationEmail(result.orderId);
    }
    log.info('reconcile_confirmed');
    return { ...NO_CHANGE, confirmed: !result.alreadyConfirmed };
  }

  // 2) 실패·취소·만료 확인 → 실패 확정. 지급 코드가 실행되지 않는 경로다.
  if (snapshot && ['FAILED', 'CANCELED', 'EXPIRED'].includes(snapshot.status)) {
    await markOrderFailed({
      orderNo: candidate.orderNo,
      code: snapshot.failureCode ?? `PROVIDER_${snapshot.status}`,
      message: snapshot.failureMessage ?? `Provider reported ${snapshot.status}`,
      source: 'BATCH',
    });
    log.info('reconcile_failed_marked', { providerStatus: snapshot.status });
    return { ...NO_CHANGE, failed: true };
  }

  // 3) 결제사가 "처리 중"이라고 답한 PENDING 주문은 "결제 확인 중"으로 올려 사용자에게 진행 상황을 보여 준다.
  if (snapshot?.status === 'PENDING' && candidate.status === 'PENDING') {
    await markOrderConfirming(candidate.orderNo, 'BATCH', snapshot.providerPaymentId);
    return NO_CHANGE;
  }

  // 4) 성공이 아닌 상태로 만료 시각을 넘긴 PENDING 주문 → 만료 (F2-AC9).
  if (candidate.status === 'PENDING' && candidate.expiresAt.getTime() < now.getTime()) {
    const expired = await expireOrder(candidate.orderNo);
    return { ...NO_CHANGE, expired };
  }

  // 5) CONFIRMING인데 기준 시간을 넘겼다면 INCIDENT로 표시한다. 상태는 그대로 둔다.
  const elapsedMs = now.getTime() - candidate.createdAt.getTime();
  if (candidate.status === 'CONFIRMING' && elapsedMs > incidentAfterMs) {
    if (candidate.reconcileState !== 'INCIDENT') {
      await markOrderIncident(candidate.id);
      log.warn('reconcile_incident_marked', { elapsedHours: Math.floor(elapsedMs / HOUR_MS) });
      return { ...NO_CHANGE, incident: true };
    }
    return NO_CHANGE;
  }

  return NO_CHANGE;
}

export async function reconcilePayments(now: Date = new Date()): Promise<ReconcileResult> {
  const env = getServerEnv();
  const since = new Date(now.getTime() - env.RECONCILE_LOOKBACK_HOURS * HOUR_MS);
  const incidentAfterMs = env.RECONCILE_INCIDENT_AFTER_HOURS * HOUR_MS;

  const candidates = await findReconcileCandidates({ since, limit: BATCH_LIMIT });

  const result: ReconcileResult = { scanned: 0, confirmed: 0, failed: 0, expired: 0, incidents: 0 };

  for (const candidate of candidates) {
    if (!nextAttemptAllowed(candidate, now)) continue;

    result.scanned += 1;
    const log = orderLogger(candidate.orderNo, { jobName: JOB_NAME, provider: candidate.provider });

    try {
      await recordReconcileAttempt(candidate.id, now);

      const provider = getProviderById(candidate.provider);
      const snapshot = await provider.fetchPayment({
        providerOrderRef: candidate.orderNo,
        providerPaymentId: candidate.providerPaymentId,
        expectedAmount: candidate.amount,
      });

      const handled = await handleCandidate(candidate, snapshot, now, incidentAfterMs);
      if (handled.confirmed) result.confirmed += 1;
      if (handled.failed) result.failed += 1;
      if (handled.expired) result.expired += 1;
      if (handled.incident) result.incidents += 1;
    } catch (error) {
      // 개별 주문 실패는 삼키고 계속 진행한다. 다음 주기에 백오프 간격만큼 뒤에 재시도된다.
      log.error('reconcile_order_failed', {}, error);
    }
  }

  // 새로 발생한 INCIDENT가 있으면 운영자에게 현재 미확정 목록 전체를 통지한다(F2-AC11).
  if (result.incidents > 0) {
    const incidents = await findIncidentOrders(INCIDENT_REPORT_LIMIT);
    await sendReconciliationReportEmail(
      incidents.map((incident) => ({
        orderNo: incident.orderNo,
        status: incident.status,
        provider: incident.provider,
        currency: incident.currency,
        amount: incident.amount,
        createdAt: incident.createdAt.toISOString(),
        reconcileAttempts: incident.reconcileAttempts,
      })),
    );
  }

  logger.info('job_completed', { jobName: JOB_NAME, ...result });
  return result;
}
