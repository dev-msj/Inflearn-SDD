import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components';

/**
 * 미확정 결제 운영자 리포트 (F2-AC11).
 *
 * PRD는 "결제 성공·주문 확정 지연 건을 운영자가 조회할 수 있어야 한다"를 요구한다.
 * MVP는 기능 3개를 유지하기 위해 운영자 화면 대신 이 메일로 목록을 통지한다(D5).
 *
 * ★고객 이메일·프롬프트 전문은 싣지 않는다. 주문번호·금액·경과 시간만으로 추적이 가능하다.
 */

export interface ReconciliationIncident {
  orderNo: string;
  status: string;
  provider: string;
  currency: string;
  amount: string;
  createdAt: string;
  reconcileAttempts: number;
}

export interface ReconciliationReportProps {
  generatedAt: string;
  incidents: ReconciliationIncident[];
  /** 24시간 초과 판정 기준(시간). 본문 안내 문구에 사용한다. */
  incidentAfterHours: number;
}

const bodyStyle = { backgroundColor: '#f6f7f9', fontFamily: 'system-ui, -apple-system, sans-serif' };
const containerStyle = { backgroundColor: '#ffffff', margin: '0 auto', padding: '32px', maxWidth: '640px' };
const textStyle = { color: '#1f2933', fontSize: '14px', lineHeight: '22px' };
const headerCellStyle = { color: '#52606d', fontSize: '12px', fontWeight: 600, padding: '6px 8px' };
const cellStyle = { color: '#1f2933', fontSize: '13px', padding: '6px 8px' };

export function ReconciliationReportEmail(props: ReconciliationReportProps) {
  return (
    <Html lang="ko">
      <Head />
      <Preview>{`미확정 결제 ${props.incidents.length}건 확인 필요`}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading style={{ ...textStyle, fontSize: '20px', margin: '0 0 12px' }}>
            미확정 결제 리포트
          </Heading>
          <Text style={textStyle}>
            {`생성 시각: ${props.generatedAt} / 대상 ${props.incidents.length}건`}
          </Text>
          <Text style={textStyle}>
            {`아래 주문은 결제사 조회로 ${props.incidentAfterHours}시간 이상 확정되지 않았습니다. ` +
              '자동 재조회 배치는 계속 시도하지만, 라이브러리 미지급으로 끝나지 않도록 결제사 콘솔에서 원본 거래를 확인해 주세요.'}
          </Text>

          <Hr style={{ borderColor: '#e4e7eb', margin: '20px 0' }} />

          <Section>
            <Row>
              <Column style={headerCellStyle}>주문번호</Column>
              <Column style={headerCellStyle}>상태</Column>
              <Column style={headerCellStyle}>결제사</Column>
              <Column style={headerCellStyle}>금액</Column>
              <Column style={headerCellStyle}>생성 시각</Column>
              <Column style={headerCellStyle}>재조회</Column>
            </Row>
            {props.incidents.map((incident) => (
              <Row key={incident.orderNo}>
                <Column style={cellStyle}>{incident.orderNo}</Column>
                <Column style={cellStyle}>{incident.status}</Column>
                <Column style={cellStyle}>{incident.provider}</Column>
                <Column style={cellStyle}>{`${incident.amount} ${incident.currency}`}</Column>
                <Column style={cellStyle}>{incident.createdAt}</Column>
                <Column style={cellStyle}>{String(incident.reconcileAttempts)}</Column>
              </Row>
            ))}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function reconciliationReportSubject(count: number): string {
  return `[ai_store] 미확정 결제 ${count}건 확인 필요`;
}

export default ReconciliationReportEmail;
