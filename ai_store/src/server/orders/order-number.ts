import 'server-only';

import { randomInt } from 'node:crypto';

/**
 * 주문번호 생성 (F2-AC4).
 *
 * 형식: `AS-YYYYMMDD-XXXXXXXX`
 *  - 사용자에게 노출되고 구매 확인 메일에 표기되며, 결제사에 넘기는 주문 식별자(provider_order_ref)와 동일하다.
 *  - 따라서 결제사가 허용하는 문자(영문 대문자·숫자·하이픈)만 사용한다.
 *  - 순번이 아닌 난수를 쓴다. 순번을 쓰면 총 판매량이 외부에 노출되기 때문이다.
 */

/** 혼동하기 쉬운 문자(0/O, 1/I/L)를 제외한 32자 알파벳. 고객센터 구두 안내 시 오인을 줄인다. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const RANDOM_LENGTH = 8;
const PREFIX = 'AS';

/** 날짜 구간은 운영자가 보는 기준(한국 시간)으로 고정한다. 서버 TZ가 UTC여도 표기가 흔들리지 않는다. */
const DATE_TIME_ZONE = 'Asia/Seoul';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DATE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function formatDatePart(now: Date): string {
  // en-CA 로케일은 YYYY-MM-DD를 반환한다. 하이픈만 제거해 YYYYMMDD로 만든다.
  return dateFormatter.format(now).replace(/-/g, '');
}

function randomPart(): string {
  let output = '';
  for (let i = 0; i < RANDOM_LENGTH; i += 1) {
    // Math.random이 아닌 CSPRNG를 쓴다. 주문번호는 결제 상태 조회 API의 키로도 쓰여 추측 가능성이 낮아야 한다.
    output += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return output;
}

export function generateOrderNo(now: Date = new Date()): string {
  return `${PREFIX}-${formatDatePart(now)}-${randomPart()}`;
}

/** 주문번호 형식 검증. 라우트 파라미터로 들어온 값을 DB 조회 전에 걸러 낸다. */
const ORDER_NO_PATTERN = new RegExp(`^${PREFIX}-\\d{8}-[${ALPHABET}]{${RANDOM_LENGTH}}$`);

export function isOrderNo(value: string): boolean {
  return ORDER_NO_PATTERN.test(value);
}
