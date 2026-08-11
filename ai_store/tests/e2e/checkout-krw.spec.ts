import { expect, test, type Page } from '@playwright/test';

/**
 * 기능 2 — 통화 선택 기반 결제 (KRW / 토스페이먼츠) E2E (F2-AC1 ~ F2-AC12).
 *
 * ▣ 실행 사전 조건 (이 스펙은 아직 실행되지 않았다)
 *   1. `.env` 구성 + `docker compose up -d postgres`
 *   2. `npx prisma migrate dev && npx prisma db seed`
 *   3. 회원가입은 스펙이 직접 수행하므로 계정 준비는 불필요하다.
 *   4. **결제창까지 진행하는 테스트**는 토스페이먼츠 샌드박스 키가 필요하다.
 *      `TOSS_CLIENT_KEY` / `TOSS_SECRET_KEY` / `TOSS_WEBHOOK_SECRET` 미설정 시
 *      해당 테스트는 실패가 아니라 **스킵**된다.
 *   5. 웹훅 수신 검증은 로컬에서 `ngrok http 3000` + 토스 대시보드 웹훅 URL 등록이 추가로 필요하다.
 *
 * ▣ 설계상 중요한 점
 *   리디렉션 복귀는 주문을 CONFIRMING까지만 올린다(F2-AC5). 따라서 이 스펙은
 *   "리디렉션 후 결제 완료"를 단언하지 않고 **"결제 확인 중" 화면 진입**까지만 단언한다.
 *   PAID 전이는 웹훅/배치의 몫이며 단위 테스트(webhook.idempotency)가 별도로 고정한다.
 */

const SEED = {
  slug: 'email-marketing-sequence',
  title: '이메일 마케팅 시퀀스 설계 프롬프트',
  priceKrwText: '12,000원',
  priceUsdText: '$9.00',
  suspendedSlug: 'suspended-growth-hacking',
} as const;

/** 결제사 샌드박스 키가 있어야만 결제창까지 진행할 수 있다. */
const HAS_TOSS_KEYS = Boolean(process.env.TOSS_SECRET_KEY && process.env.TOSS_CLIENT_KEY);

/**
 * 이미 해당 템플릿을 보유한 계정 (F2-AC7 중복 구매 차단 검증용).
 * 샌드박스 결제 1건을 완료했거나 DB에 library_items를 직접 넣어 준비한다.
 */
const OWNED_FIXTURE = {
  email: process.env.E2E_BUYER_EMAIL,
  password: process.env.E2E_BUYER_PASSWORD,
  templateSlug: process.env.E2E_OWNED_TEMPLATE_SLUG,
};
const HAS_OWNED_FIXTURE = Boolean(
  OWNED_FIXTURE.email && OWNED_FIXTURE.password && OWNED_FIXTURE.templateSlug,
);

/** 테스트마다 새 계정을 만든다. 계정 상태가 테스트 간에 새어 나가지 않게 하기 위함이다. */
function uniqueEmail(): string {
  return `e2e-krw-${Date.now()}-${Math.floor(Math.random() * 100_000)}@example.com`;
}

const PASSWORD = 'e2e-password-1234';

/** 회원가입 → 로그인. 로그인 성공 후 callbackUrl(있으면)로 복귀한다. */
async function signUpAndLogin(page: Page, email: string, callbackUrl?: string): Promise<void> {
  const signupUrl = callbackUrl
    ? `/ko/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : '/ko/signup';

  await page.goto(signupUrl);
  await page.getByLabel(/이메일/).fill(email);
  await page.getByLabel(/비밀번호/).fill(PASSWORD);
  await page.getByRole('button', { name: '가입하기' }).click();

  // 가입 직후 로그인 화면으로 돌아온다(?signup=success).
  await expect(page.getByText('가입이 완료되었습니다. 로그인해 주세요.')).toBeVisible();

  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호').fill(PASSWORD);
  await page.getByRole('button', { name: '로그인' }).click();
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/ko/login');
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호').fill(password);
  await page.getByRole('button', { name: '로그인' }).click();
}

test.describe('결제 화면 진입 (F3-AC8과 동일한 보호 규칙)', () => {
  test('미로그인 상태로 결제 화면에 접근하면 로그인 후 원래 화면으로 복귀한다', async ({ page }) => {
    const checkoutPath = `/ko/checkout/${SEED.slug}`;

    await page.goto(checkoutPath);

    await expect(page).toHaveURL(
      new RegExp(`/ko/login\\?callbackUrl=${encodeURIComponent(checkoutPath)}`),
    );
    await expect(page.getByText('로그인이 필요한 화면입니다.')).toBeVisible();

    await signUpAndLogin(page, uniqueEmail(), checkoutPath);

    await expect(page).toHaveURL(new RegExp(`${checkoutPath}$`));
    await expect(page.getByRole('heading', { name: '결제', level: 1 })).toBeVisible();
  });
});

test.describe('F2-AC1 통화 명시 선택과 결제 전 금액 표시', () => {
  test.beforeEach(async ({ page }) => {
    await signUpAndLogin(page, uniqueEmail(), `/ko/checkout/${SEED.slug}`);
    await expect(page.getByRole('heading', { name: '결제', level: 1 })).toBeVisible();
  });

  test('통화가 기본 선택되어 있지 않고, 미선택 상태에서는 결제 버튼이 비활성이다', async ({ page }) => {
    await expect(page.getByRole('radio', { name: /KRW/ })).not.toBeChecked();
    await expect(page.getByRole('radio', { name: /USD/ })).not.toBeChecked();

    // 같은 문구가 금액 요약과 버튼 하단 안내 두 곳에 나온다(둘 다 미선택 사유를 알리는 역할).
    await expect(page.getByText('결제 통화를 선택해 주세요.').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '결제 진행' })).toBeDisabled();
  });

  test('KRW를 선택하면 원화 결제 금액이 결제 진행 전에 표시된다', async ({ page }) => {
    await page.getByRole('radio', { name: /KRW/ }).check();

    await expect(page.getByText('최종 결제 금액')).toBeVisible();
    await expect(page.getByText(SEED.priceKrwText)).toBeVisible();
    await expect(page.getByText('이 화면에 표시된 금액으로 결제됩니다.')).toBeVisible();
  });

  test('선택한 통화를 바꾸면 표시 금액도 함께 바뀐다', async ({ page }) => {
    await page.getByRole('radio', { name: /KRW/ }).check();
    await expect(page.getByText(SEED.priceKrwText)).toBeVisible();

    await page.getByRole('radio', { name: /USD/ }).check();
    await expect(page.getByText(SEED.priceUsdText)).toBeVisible();
  });

  test('F2-AC9 30분 만료 안내가 결제 전에 표시된다', async ({ page }) => {
    await expect(page.getByText(/결제 화면 진입 후 30분 안에 결제를 완료해 주세요\./)).toBeVisible();
  });
});

test.describe('F2-AC2 KRW → 토스페이먼츠 (IP 자동 판별 없음)', () => {
  test('KRW 선택지에 토스페이먼츠 결제 안내가 표시된다', async ({ page }) => {
    await signUpAndLogin(page, uniqueEmail(), `/ko/checkout/${SEED.slug}`);

    await expect(page.getByText('토스페이먼츠로 결제')).toBeVisible();
    await expect(page.getByText('Paddle로 결제')).toBeVisible();
    await expect(
      page.getByText('결제할 통화를 직접 선택해 주세요. 접속 지역으로 자동 결정하지 않습니다.'),
    ).toBeVisible();
  });

  test('해외 IP를 흉내 내는 헤더가 있어도 통화가 자동 선택되지 않는다', async ({ browser }) => {
    // Out of Scope: "IP 기반 자동 통화 판별". 어떤 지역 힌트에도 반응하지 않아야 한다.
    const context = await browser.newContext({
      locale: 'en-US',
      extraHTTPHeaders: {
        'x-forwarded-for': '8.8.8.8',
        'x-vercel-ip-country': 'US',
        'cf-ipcountry': 'US',
      },
    });
    const page = await context.newPage();

    await signUpAndLogin(page, uniqueEmail(), `/ko/checkout/${SEED.slug}`);

    await expect(page.getByRole('radio', { name: /KRW/ })).not.toBeChecked();
    await expect(page.getByRole('radio', { name: /USD/ })).not.toBeChecked();

    await context.close();
  });
});

test.describe('F2-AC12 환불 정책 결제 전 고지·동의', () => {
  test.beforeEach(async ({ page }) => {
    await signUpAndLogin(page, uniqueEmail(), `/ko/checkout/${SEED.slug}`);
    await expect(page.getByRole('heading', { name: '결제', level: 1 })).toBeVisible();
  });

  test('환불 규정 문구가 결제 전에 표시된다', async ({ page }) => {
    await expect(page.getByText('환불 규정 안내')).toBeVisible();
    await expect(page.getByText(/구매일로부터 7일 이내이면서 프롬프트 전문을 아직 열람/)).toBeVisible();
  });

  test('통화를 선택해도 동의 전에는 결제 버튼이 비활성이다', async ({ page }) => {
    await page.getByRole('radio', { name: /KRW/ }).check();
    await expect(page.getByRole('button', { name: '결제 진행' })).toBeDisabled();

    await page.getByRole('checkbox', { name: /환불 규정을 확인했으며/ }).check();
    await expect(page.getByRole('button', { name: '결제 진행' })).toBeEnabled();
  });

  test('동의를 해제하면 다시 비활성으로 돌아간다', async ({ page }) => {
    await page.getByRole('radio', { name: /KRW/ }).check();
    const consent = page.getByRole('checkbox', { name: /환불 규정을 확인했으며/ });

    await consent.check();
    await expect(page.getByRole('button', { name: '결제 진행' })).toBeEnabled();

    await consent.uncheck();
    await expect(page.getByRole('button', { name: '결제 진행' })).toBeDisabled();
  });
});

test.describe('F2-AC7 중복 구매 차단', () => {
  test('이미 보유한 템플릿의 결제 화면은 결제 수단 대신 라이브러리 경로를 제공한다', async ({
    page,
  }) => {
    test.skip(
      !HAS_OWNED_FIXTURE,
      'E2E_BUYER_EMAIL / E2E_BUYER_PASSWORD / E2E_OWNED_TEMPLATE_SLUG 준비 시에만 실행한다',
    );

    await login(page, OWNED_FIXTURE.email!, OWNED_FIXTURE.password!);
    await page.goto(`/ko/checkout/${OWNED_FIXTURE.templateSlug!}`);

    await expect(page.getByText('이미 보유한 템플릿입니다')).toBeVisible();
    await expect(page.getByRole('link', { name: '내 라이브러리로 이동' })).toBeVisible();

    // 결제 수단 자체가 렌더되지 않는다(결제창 진입 불가).
    await expect(page.getByRole('button', { name: '결제 진행' })).toHaveCount(0);
    await expect(page.getByRole('radio', { name: /KRW/ })).toHaveCount(0);
  });

  test('상세 페이지도 보유 시 구매 버튼을 라이브러리 링크로 대체한다', async ({ page }) => {
    test.skip(!HAS_OWNED_FIXTURE, '보유 계정 픽스처가 필요하다');

    await login(page, OWNED_FIXTURE.email!, OWNED_FIXTURE.password!);
    await page.goto(`/ko/templates/${OWNED_FIXTURE.templateSlug!}`);

    await expect(page.getByText('이미 보유한 템플릿입니다.')).toBeVisible();
    await expect(page.getByRole('link', { name: '라이브러리에서 보기' })).toBeVisible();
    await expect(page.getByRole('link', { name: '구매하기' })).toHaveCount(0);
  });

  test('API도 409 ALREADY_OWNED로 차단한다', async ({ page }) => {
    test.skip(!HAS_OWNED_FIXTURE, '보유 계정 픽스처가 필요하다');

    await login(page, OWNED_FIXTURE.email!, OWNED_FIXTURE.password!);

    const response = await page.request.post('/api/checkout', {
      data: {
        templateSlug: OWNED_FIXTURE.templateSlug!,
        currency: 'KRW',
        policyAgreed: true,
      },
    });

    expect(response.status()).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('ALREADY_OWNED');
  });
});

test.describe('F1-AC8 판매 중지 템플릿의 결제 차단', () => {
  test('판매 중지 템플릿의 결제 화면에는 결제 수단이 없다', async ({ page }) => {
    await signUpAndLogin(page, uniqueEmail(), `/ko/checkout/${SEED.suspendedSlug}`);

    await expect(page.getByText('현재 판매하지 않는 템플릿입니다.')).toBeVisible();
    await expect(page.getByRole('button', { name: '결제 진행' })).toHaveCount(0);
  });
});

test.describe('★F2-AC5 리디렉션만으로는 확정되지 않는다 (샌드박스 키 필요)', () => {
  test('결제 완료 후 "결제 확인 중" 화면으로 이동하고 자동 갱신된다', async ({ page }) => {
    test.skip(
      !HAS_TOSS_KEYS,
      'TOSS_CLIENT_KEY / TOSS_SECRET_KEY 가 있어야 결제창까지 진행할 수 있다',
    );

    await signUpAndLogin(page, uniqueEmail(), `/ko/checkout/${SEED.slug}`);

    await page.getByRole('radio', { name: /KRW/ }).check();
    await page.getByRole('checkbox', { name: /환불 규정을 확인했으며/ }).check();
    await page.getByRole('button', { name: '결제 진행' }).click();

    // 결제창이 열리는 동안 버튼은 "결제창을 여는 중…"으로 바뀐다.
    await expect(page.getByRole('button', { name: '결제창을 여는 중…' })).toBeVisible();

    // 이후 토스 샌드박스 결제창 조작은 수동 확인 구간이다(자동화 대상 아님).
    // 결제를 마치면 /api/checkout/toss/return → /ko/checkout/status/{orderNo} 로 복귀한다.
    await page.waitForURL(/\/ko\/checkout\/status\//, { timeout: 120_000 });

    // ★리디렉션으로 도달한 화면은 "결제 확인 중"이지 "결제 완료"가 아니다.
    await expect(page.getByRole('heading', { name: '결제 확인 중' })).toBeVisible();
    await expect(page.getByText('결제 승인 통지를 확인하고 있습니다. 이 화면은 자동으로 갱신됩니다.')).toBeVisible();
    await expect(page.getByRole('link', { name: '내 라이브러리로 이동' })).toHaveCount(0);
  });

  test('웹훅이 도착하면 폴링이 감지해 라이브러리로 자동 이동한다', async ({ page }) => {
    test.skip(
      !HAS_TOSS_KEYS || !process.env.E2E_WEBHOOK_TUNNEL,
      '웹훅 수신이 가능한 환경(E2E_WEBHOOK_TUNNEL=1 + ngrok + 대시보드 등록)에서만 실행한다',
    );

    const orderNo = process.env.E2E_CONFIRMING_ORDER_NO;
    test.skip(!orderNo, 'CONFIRMING 상태의 주문번호(E2E_CONFIRMING_ORDER_NO)가 필요하다');

    await login(page, OWNED_FIXTURE.email!, OWNED_FIXTURE.password!);
    await page.goto(`/ko/checkout/status/${orderNo!}`);

    // 웹훅 확정 후 OrderStatusPoller가 라이브러리로 replace 한다.
    await page.waitForURL(/\/ko\/library$/, { timeout: 90_000 });
    await expect(page.getByRole('heading', { name: '내 라이브러리', level: 1 })).toBeVisible();
  });
});

test.describe('F2-AC10 / F2-AC11 실패·지연 안내', () => {
  test('실패한 주문 화면은 사유와 재시도 경로를 제공한다', async ({ page }) => {
    const orderNo = process.env.E2E_FAILED_ORDER_NO;
    test.skip(!orderNo || !HAS_OWNED_FIXTURE, 'FAILED 상태 주문번호와 소유 계정이 필요하다');

    await login(page, OWNED_FIXTURE.email!, OWNED_FIXTURE.password!);
    await page.goto(`/ko/checkout/status/${orderNo!}`);

    await expect(page.getByText('결제가 완료되지 않았습니다.')).toBeVisible();
    await expect(page.getByRole('link', { name: '다시 결제하기' })).toBeVisible();
  });

  test('확정이 지연되면 "최대 24시간 내 처리" 안내가 표시된다', async ({ page }) => {
    const orderNo = process.env.E2E_INCIDENT_ORDER_NO;
    test.skip(
      !orderNo || !HAS_OWNED_FIXTURE,
      'reconcile_state=INCIDENT 인 주문번호와 소유 계정이 필요하다',
    );

    await login(page, OWNED_FIXTURE.email!, OWNED_FIXTURE.password!);
    await page.goto(`/ko/checkout/status/${orderNo!}`);

    await expect(page.getByText('확인 중입니다. 최대 24시간 내에 처리됩니다.')).toBeVisible();
  });

  test('타인의 주문 상태는 404로 응답한다(존재 여부 비노출)', async ({ page }) => {
    await signUpAndLogin(page, uniqueEmail());

    const response = await page.request.get('/api/orders/AS-20260101-NOTMINE1');

    expect(response.status()).toBe(404);
  });
});
