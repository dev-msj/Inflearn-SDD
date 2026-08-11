import 'server-only';

import { paddleProvider } from './paddle/paddle.provider';
import { tossProvider } from './toss/toss.provider';
import type { PaymentProvider } from './provider.types';
import type { Currency, PaymentProviderId } from '@/types/domain';

/**
 * 통화 → 결제사 매핑 (F2-AC2).
 *
 * ★IP·접속 국가·Accept-Language·GeoIP를 **어떤 경우에도 참조하지 않는다**.
 *   통화는 오직 사용자가 결제 화면에서 명시적으로 선택한 값으로만 결정된다.
 *   (PRD Out of Scope: "IP 기반 자동 통화 판별")
 *   이 파일에 요청 객체(Request/headers)를 인자로 받는 함수가 생기면 규칙 위반이다.
 */

const REGISTRY: Readonly<Record<Currency, PaymentProvider>> = {
  KRW: tossProvider,
  USD: paddleProvider,
};

const REGISTRY_BY_ID: Readonly<Record<PaymentProviderId, PaymentProvider>> = {
  TOSS: tossProvider,
  PADDLE: paddleProvider,
};

export function getProviderForCurrency(currency: Currency): PaymentProvider {
  return REGISTRY[currency];
}

export function getProviderById(id: PaymentProviderId): PaymentProvider {
  return REGISTRY_BY_ID[id];
}

/** 통화 선택 결과로 orders.provider에 저장할 값. */
export function getProviderIdForCurrency(currency: Currency): PaymentProviderId {
  return REGISTRY[currency].id;
}
