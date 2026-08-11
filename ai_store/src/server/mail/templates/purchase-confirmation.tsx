import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

/**
 * 구매 확인 메일 (F2-AC4).
 *
 * PRD가 요구하는 4개 항목을 반드시 포함한다.
 *   1) 주문 번호  2) 템플릿명  3) 결제 통화·금액  4) 라이브러리 접근 경로
 *
 * ★프롬프트 전문(body)은 메일에 절대 싣지 않는다. 메일은 평문으로 저장·전달되는 경로라
 *   전문이 실리면 F1-AC6의 격리가 메일 채널에서 무너진다.
 * ★next-intl은 요청 컨텍스트가 필요해 배치·웹훅 경로에서 쓸 수 없으므로,
 *   메일 문구만 로케일별 상수로 직접 관리한다(문구 키는 messages/*.json과 중복되지 않는다).
 */

export interface PurchaseConfirmationProps {
  locale: 'ko' | 'en';
  orderNo: string;
  templateTitle: string;
  currency: 'KRW' | 'USD';
  /** Decimal 문자열 */
  amount: string;
  libraryUrl: string;
  supportEmail: string;
}

const COPY = {
  ko: {
    preview: '결제가 완료되었습니다. 지금 바로 프롬프트 전문을 열람하세요.',
    heading: '구매가 완료되었습니다',
    intro: '결제가 정상적으로 확인되어 템플릿이 내 라이브러리에 추가되었습니다.',
    orderNoLabel: '주문 번호',
    templateLabel: '템플릿',
    amountLabel: '결제 금액',
    cta: '내 라이브러리에서 전문 열람하기',
    ctaHint: '아래 주소로도 접속할 수 있습니다.',
    support: '문의는 이 메일 주소로 회신해 주세요:',
    refundNotice: '디지털 콘텐츠 특성상 전문을 열람·다운로드하면 환불이 제한됩니다.',
  },
  en: {
    preview: 'Your payment is confirmed. Your prompt is ready to read.',
    heading: 'Your purchase is complete',
    intro: 'We confirmed your payment and added the template to your library.',
    orderNoLabel: 'Order number',
    templateLabel: 'Template',
    amountLabel: 'Amount paid',
    cta: 'Open the full prompt in your library',
    ctaHint: 'You can also open this address directly:',
    support: 'Reply to this address if you need help:',
    refundNotice: 'As a digital product, refunds are limited once the full prompt is viewed or downloaded.',
  },
} as const;

/** 통화별 표기. KRW는 정수 원, USD는 소수 2자리. */
function formatAmount(currency: 'KRW' | 'USD', amount: string): string {
  if (currency === 'KRW') {
    const won = Math.round(Number(amount));
    return `${won.toLocaleString('ko-KR')} KRW`;
  }
  return `$${Number(amount).toFixed(2)} USD`;
}

const bodyStyle = { backgroundColor: '#f6f7f9', fontFamily: 'system-ui, -apple-system, sans-serif' };
const containerStyle = { backgroundColor: '#ffffff', margin: '0 auto', padding: '32px', maxWidth: '560px' };
// 본문 텍스트 대비 4.5:1 이상을 만족하는 색상 조합을 사용한다.
const textStyle = { color: '#1f2933', fontSize: '15px', lineHeight: '24px' };
const labelStyle = { color: '#52606d', fontSize: '13px', margin: '0' };
const valueStyle = { color: '#1f2933', fontSize: '15px', fontWeight: 600, margin: '0 0 12px' };
const linkStyle = { color: '#1d4ed8', fontSize: '15px', fontWeight: 600 };

export function PurchaseConfirmationEmail(props: PurchaseConfirmationProps) {
  const copy = COPY[props.locale];

  return (
    <Html lang={props.locale}>
      <Head />
      <Preview>{copy.preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading style={{ ...textStyle, fontSize: '22px', margin: '0 0 16px' }}>{copy.heading}</Heading>
          <Text style={textStyle}>{copy.intro}</Text>

          <Section style={{ margin: '24px 0' }}>
            <Text style={labelStyle}>{copy.orderNoLabel}</Text>
            <Text style={valueStyle}>{props.orderNo}</Text>

            <Text style={labelStyle}>{copy.templateLabel}</Text>
            <Text style={valueStyle}>{props.templateTitle}</Text>

            <Text style={labelStyle}>{copy.amountLabel}</Text>
            <Text style={valueStyle}>{formatAmount(props.currency, props.amount)}</Text>
          </Section>

          <Section style={{ margin: '24px 0' }}>
            <Link href={props.libraryUrl} style={linkStyle}>
              {copy.cta}
            </Link>
            <Text style={{ ...textStyle, fontSize: '13px', color: '#52606d' }}>
              {copy.ctaHint} {props.libraryUrl}
            </Text>
          </Section>

          <Hr style={{ borderColor: '#e4e7eb', margin: '24px 0' }} />

          <Text style={{ ...textStyle, fontSize: '13px', color: '#52606d' }}>{copy.refundNotice}</Text>
          <Text style={{ ...textStyle, fontSize: '13px', color: '#52606d' }}>
            {copy.support} {props.supportEmail}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

/** 메일 제목. 주문번호를 포함해 수신함에서 바로 식별되게 한다. */
export function purchaseConfirmationSubject(locale: 'ko' | 'en', orderNo: string): string {
  return locale === 'ko'
    ? `[ai_store] 구매가 완료되었습니다 (${orderNo})`
    : `[ai_store] Your purchase is complete (${orderNo})`;
}

export default PurchaseConfirmationEmail;
