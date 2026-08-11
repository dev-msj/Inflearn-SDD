import { expect, test, type Page } from '@playwright/test';

/**
 * 기능 2 — 통화 선택 기반 결제 (USD / Paddle) E2E (F2-AC1, F2-AC2, F2-AC3, F2-AC5).
 *
 * ▣ 실행 사전 조건 (이 스펙은 아직 실행되지 않았다)
 *   1. `.env` 구성 + `docker compose up -d postgres`
 *   2. `npx prisma migrate dev && npx prisma db seed`
 *   3. **Paddle 오버레이까지 진행하는 테스트**는 샌드박스 키가 필요하다.
 *      `PADDLE_API_KEY` / `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`(= PADDLE_CLIENT_TOKEN) /
 *      `PADDLE_NOTIFICATION_SECRET` 미설정 시 해당 테스트는 실패가 아니라 **스킵**된다.
 *   4. Paddle 오버레이는 외부 도메인 iframe이라 결제 입력 자동화는 하지 않는다.
 *      스펙은 "오버레이가 열렸는가"까지만 단언하고, 이후 확정은 웹훅/배치의 몫이다(F2-AC5).
 *
 * ▣ KRW 스펙과 중복되는 항목(정책 동의 게이팅 등)은 여기서 반복하지 않는다.
 *   이 스펙의 관심사는 **"USD를 고르면 Paddle 흐름으로 간다"** 와
 *   **"지역 정보로 통화를 자동 결정하지 않는다"** 두 가지다.
 */

const SEED = {
  slug: 'sql-query-optimizer',
  priceKrwText: '21,000원',
  priceUsdText: '$16.00',
} as const;

const HAS_PADDLE_KEYS = Boolean(
  process.env.PADDLE_API_KEY &&
    (process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? process.env.PADDLE_CLIENT_TOKEN),
);

const PASSWORD = 'e2e-password-1234';

function uniqueEmail(): string {
  return `e2e-usd-${Date.now()}-${Math.floor(Math.random() * 100_000)}@example.com`;
}

/** 회원가입 → 로그인 → callbackUrl 복귀. (헬퍼 파일을 늘리지 않기 위해 스펙 내부에 둔다) */
async function signUpAndLogin(page: Page, email: string, callbackUrl?: string): Promise<void> {
  const signupUrl = callbackUrl
    ? `/ko/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : '/ko/signup';

  await page.goto(signupUrl);
  await page.getByLabel(/이메일/).fill(email);
  await page.getByLabel(/비밀번호/).fill(PASSWORD);
  await page.getByRole('button', { name: '가입하기' }).click();

  await expect(page.getByText('가입이 완료되었습니다. 로그인해 주세요.')).toBeVisible();

  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호').fill(PASSWORD);
  await page.getByRole('button', { name: '로그인' }).click();
}

test.describe('F2-AC1 USD 선택 시 달러 금액이 결제 전에 표시된다', () => {
  test.beforeEach(async ({ page }) => {
    await signUpAndLogin(page, uniqueEmail(), `/ko/checkout/${SEED.slug}`);
    await expect(page.getByRole('heading', { name: '결제', level: 1 })).toBeVisible();
  });

  test('USD를 선택하면 달러 금액만 최종 결제 금액으로 표시된다', async ({ page }) => {
    await page.getByRole('radio', { name: /USD/ }).check();

    const summary = page.locator('section', { has: page.getByText('최종 결제 금액') }).first();
    await expect(summary).toContainText(SEED.priceUsdText);
    await expect(summary).not.toContainText(SEED.priceKrwText);
  });

  test('통화 미선택 상태에서는 결제 버튼이 비활성이다', async ({ page }) => {
    await expect(page.getByRole('button', { name: '결제 진행' })).toBeDisabled();
  });

  test('USD 선택 + 환불 규정 동의 후에만 결제 버튼이 활성된다', async ({ page }) => {
    await page.getByRole('radio', { name: /USD/ }).check();
    await expect(page.getByRole('button', { name: '결제 진행' })).toBeDisabled();

    await page.getByRole('checkbox', { name: /환불 규정을 확인했으며/ }).check();
    await expect(page.getByRole('button', { name: '결제 진행' })).toBeEnabled();
  });
});

test.describe('F2-AC2 USD → Paddle (IP·국가 자동 판별 금지)', () => {
  test('USD 선택지에 Paddle 결제 안내가 표시된다', async ({ page }) => {
    await signUpAndLogin(page, uniqueEmail(), `/ko/checkout/${SEED.slug}`);

    await expect(page.getByText('USD (미국 달러)')).toBeVisible();
    await expect(page.getByText('Paddle로 결제')).toBeVisible();
  });

  test('한국 IP를 흉내 내도 KRW가 자동 선택되지 않는다', async ({ browser }) => {
    const context = await browser.newContext({
      locale: 'ko-KR',
      extraHTTPHeaders: {
        'x-forwarded-for': '211.34.126.1',
        'x-vercel-ip-country': 'KR',
        'cf-ipcountry': 'KR',
      },
    });
    const page = await context.newPage();

    await signUpAndLogin(page, uniqueEmail(), `/ko/checkout/${SEED.slug}`);

    await expect(page.getByRole('radio', { name: /KRW/ })).not.toBeChecked();
    await expect(page.getByRole('radio', { name: /USD/ })).not.toBeChecked();

    await context.close();
  });

  test('영어 로케일에서도 두 통화가 모두 동등하게 제시된다', async ({ page }) => {
    await signUpAndLogin(page, uniqueEmail(), `/en/checkout/${SEED.slug}`);

    await expect(page.getByRole('radio', { name: /KRW/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: /USD/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: /USD/ })).not.toBeChecked();
  });
});

test.describe('F2-AC2 / F2-AC5 Paddle 오버레이 실행 (샌드박스 키 필요)', () => {
  test('결제 진행 시 Paddle 오버레이가 열린다', async ({ page }) => {
    test.skip(
      !HAS_PADDLE_KEYS,
      'PADDLE_API_KEY / PADDLE_CLIENT_TOKEN 이 있어야 Paddle 트랜잭션을 만들 수 있다',
    );

    await signUpAndLogin(page, uniqueEmail(), `/ko/checkout/${SEED.slug}`);

    await page.getByRole('radio', { name: /USD/ }).check();
    await page.getByRole('checkbox', { name: /환불 규정을 확인했으며/ }).check();
    await page.getByRole('button', { name: '결제 진행' }).click();

    await expect(page.getByRole('button', { name: '결제창을 여는 중…' })).toBeVisible();

    // Paddle.js는 외부 도메인 iframe으로 체크아웃을 띄운다.
    await expect(page.locator('iframe[src*="paddle"]').first()).toBeVisible({ timeout: 60_000 });
  });

  test('결제 완료 후 복귀 화면은 "결제 확인 중"이지 "결제 완료"가 아니다', async ({ page }) => {
    test.skip(
      !HAS_PADDLE_KEYS || !process.env.E2E_PADDLE_MANUAL,
      'Paddle 샌드박스 결제를 수동으로 완료할 수 있는 환경(E2E_PADDLE_MANUAL=1)에서만 실행한다',
    );

    await signUpAndLogin(page, uniqueEmail(), `/ko/checkout/${SEED.slug}`);

    await page.getByRole('radio', { name: /USD/ }).check();
    await page.getByRole('checkbox', { name: /환불 규정을 확인했으며/ }).check();
    await page.getByRole('button', { name: '결제 진행' }).click();

    // 수동으로 샌드박스 카드 결제를 끝내면 /api/checkout/paddle/return 을 거쳐 대기 화면으로 온다.
    await page.waitForURL(/\/ko\/checkout\/status\//, { timeout: 180_000 });

    // ★리디렉션은 CONFIRMING까지만 만든다. 확정은 transaction.completed 웹훅의 몫이다(F2-AC5).
    await expect(page.getByRole('heading', { name: '결제 확인 중' })).toBeVisible();
    await expect(page.getByRole('link', { name: '내 라이브러리로 이동' })).toHaveCount(0);
  });
});

test.describe('F2-AC3 웹훅 서명 검증 (인증 없이 확정 불가)', () => {
  test('서명이 없는 Paddle 웹훅은 401로 거부된다', async ({ request }) => {
    const response = await request.post('/api/webhooks/paddle', {
      headers: { 'content-type': 'application/json' },
      data: {
        event_id: 'evt_e2e_unsigned',
        event_type: 'transaction.completed',
        data: { id: 'txn_e2e', status: 'completed', custom_data: { orderNo: 'AS-20260101-FAKE0001' } },
      },
    });

    expect(response.status()).toBe(401);
  });

  test('서명이 위조된 Paddle 웹훅도 401로 거부된다', async ({ request }) => {
    const response = await request.post('/api/webhooks/paddle', {
      headers: {
        'content-type': 'application/json',
        'paddle-signature': `ts=${Math.floor(Date.now() / 1000)};h1=${'0'.repeat(64)}`,
      },
      data: {
        event_id: 'evt_e2e_forged',
        event_type: 'transaction.completed',
        data: { id: 'txn_e2e', status: 'completed', custom_data: { orderNo: 'AS-20260101-FAKE0001' } },
      },
    });

    expect(response.status()).toBe(401);
  });
});
