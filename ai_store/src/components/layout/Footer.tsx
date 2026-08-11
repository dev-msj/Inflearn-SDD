import { getTranslations } from 'next-intl/server';

import { REFUND_WINDOW_DAYS } from '@/server/refunds/refund.policy';

/**
 * 전역 푸터 (서버 컴포넌트).
 *
 * ★TECH_SPEC과 다르게 구현한 부분
 *   체크리스트는 "약관·환불 정책 링크"를 요구하지만, 이용약관·개인정보처리방침 문서는
 *   PRD 7장 Q15(작성 주체·검토 일정 미정)로 아직 존재하지 않는다.
 *   존재하지 않는 페이지로 가는 죽은 링크를 노출하는 대신, 결제 전 고지 의무가 걸린
 *   **환불 규정 본문만 실제 콘텐츠로** 펼침(`<details>`) 형태로 제공한다(F2-AC12 보조).
 *   문서가 준비되면 이 자리에 링크를 추가한다.
 *
 * 환불 기간(일수)은 refund.policy.ts의 상수를 그대로 쓴다.
 * 화면 문구와 판정 로직이 다른 숫자를 말하는 상황을 원천 차단하기 위함이다.
 */
export async function Footer() {
  const [tFooter, tPolicy] = await Promise.all([
    getTranslations('footer'),
    getTranslations('refundPolicy'),
  ]);

  return (
    <footer className="mt-12 border-t border-border bg-background">
      <div className="container flex flex-col gap-4 py-6 text-sm text-muted-foreground">
        <details className="group">
          <summary className="cursor-pointer rounded-md font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            {tFooter('refundPolicy')}
          </summary>
          <p className="mt-2 max-w-3xl leading-relaxed">
            {tPolicy('body', { days: REFUND_WINDOW_DAYS })}
          </p>
        </details>

        <p>{tFooter('copyright', { year: String(new Date().getFullYear()) })}</p>
      </div>
    </footer>
  );
}
