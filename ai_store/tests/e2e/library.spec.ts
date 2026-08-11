import { expect, test, type Page } from '@playwright/test';

/**
 * 기능 3 — 내 라이브러리 열람·복사·다운로드 E2E (F3-AC1 ~ F3-AC9).
 *
 * ▣ 실행 사전 조건 (이 스펙은 아직 실행되지 않았다)
 *   1. `.env` 구성 + `docker compose up -d postgres`
 *   2. `npx prisma migrate dev && npx prisma db seed`
 *   3. **구매 확정 상태가 필요한 테스트**(F3-AC1/2/3/4/6/9)는 아래 픽스처 환경 변수가 필요하다.
 *        E2E_BUYER_EMAIL / E2E_BUYER_PASSWORD  — library_items(ACTIVE)를 1건 이상 보유한 계정
 *        E2E_OWNED_TEMPLATE_ID                 — 그 계정이 보유한 템플릿 uuid
 *        E2E_REVOKED_TEMPLATE_ID (선택)        — 환불되어 REVOKED 된 템플릿 uuid (F3-AC9)
 *      준비는 샌드박스 결제 1건을 완료하거나 DB에 직접 삽입해서 한다.
 *      미설정 시 해당 테스트는 실패가 아니라 **스킵**된다.
 *   4. 미구매·미로그인 경로(F3-AC5/AC7/AC8)는 시드만으로 실행 가능하다.
 *
 * ▣ 클립보드 검증은 Chromium 권한(clipboard-read/write)을 부여해야 한다.
 *   playwright.config.ts의 프로젝트가 모두 Chromium이므로 컨텍스트에서 grantPermissions 한다.
 */

const SEED = {
  /** 어떤 계정도 구매하지 않은 템플릿 (F3-AC5 검증용) */
  unownedSlug: 'concept-explainer',
} as const;

const BUYER = {
  email: process.env.E2E_BUYER_EMAIL,
  password: process.env.E2E_BUYER_PASSWORD,
  templateId: process.env.E2E_OWNED_TEMPLATE_ID,
};
const HAS_BUYER = Boolean(BUYER.email && BUYER.password && BUYER.templateId);

const REVOKED_TEMPLATE_ID = process.env.E2E_REVOKED_TEMPLATE_ID;

const PASSWORD = 'e2e-password-1234';

function uniqueEmail(): string {
  return `e2e-lib-${Date.now()}-${Math.floor(Math.random() * 100_000)}@example.com`;
}

/** 회원가입 → 로그인. (헬퍼 파일을 늘리지 않기 위해 스펙 내부에 둔다) */
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

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/ko/login');
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호').fill(password);
  await page.getByRole('button', { name: '로그인' }).click();
}

/** 공개 API에서 템플릿 uuid를 얻는다(전문은 포함되지 않는다). */
async function fetchTemplateId(page: Page, slug: string): Promise<string> {
  const response = await page.request.get(`/api/templates/${slug}`);
  expect(response.status()).toBe(200);

  const payload = (await response.json()) as { template: { id: string } };
  return payload.template.id;
}

test.describe('F3-AC8 미로그인 시 로그인 후 원래 화면 복귀', () => {
  test('라이브러리 접근 → 로그인 → 같은 URL로 되돌아온다', async ({ page }) => {
    await page.goto('/ko/library');

    await expect(page).toHaveURL(/\/ko\/login\?callbackUrl=%2Fko%2Flibrary/);
    await expect(page.getByText('로그인이 필요한 화면입니다.')).toBeVisible();

    await signUpAndLogin(page, uniqueEmail(), '/ko/library');

    await expect(page).toHaveURL(/\/ko\/library$/);
    await expect(page.getByRole('heading', { name: '내 라이브러리', level: 1 })).toBeVisible();
  });

  test('전문 열람 경로도 쿼리까지 보존해 로그인으로 보낸다', async ({ page }) => {
    const templateId = await fetchTemplateId(page, SEED.unownedSlug);

    await page.goto(`/ko/library/${templateId}`);

    await expect(page).toHaveURL(new RegExp(`/ko/login\\?callbackUrl=%2Fko%2Flibrary%2F${templateId}`));
  });

  test('잘못된 자격 증명은 오류 문구를 보여주고 복귀 대상을 유지한다', async ({ page }) => {
    await page.goto('/ko/login?callbackUrl=%2Fko%2Flibrary');

    await page.getByLabel('이메일').fill('no-such-user@example.com');
    await page.getByLabel('비밀번호').fill('wrong-password');
    await page.getByRole('button', { name: '로그인' }).click();

    await expect(page.getByText('이메일 또는 비밀번호가 올바르지 않습니다.')).toBeVisible();
    await expect(page).toHaveURL(/callbackUrl=%2Fko%2Flibrary/);
  });
});

test.describe('F3-AC7 구매 내역이 없을 때', () => {
  test('빈 목록 대신 안내와 템플릿 목록 경로를 제공한다', async ({ page }) => {
    await signUpAndLogin(page, uniqueEmail(), '/ko/library');

    await expect(page.getByRole('heading', { name: '아직 구매한 템플릿이 없습니다' })).toBeVisible();

    await page.getByRole('link', { name: '템플릿 둘러보기' }).click();
    await expect(page).toHaveURL(/\/ko$/);
    await expect(page.getByRole('heading', { name: '프롬프트 템플릿', level: 1 })).toBeVisible();
  });
});

test.describe('F3-AC5 미구매 템플릿의 전문 접근 거부', () => {
  test('전문 열람 경로에 직접 접근하면 상세 페이지로 안내된다', async ({ page }) => {
    await signUpAndLogin(page, uniqueEmail(), '/ko/library');
    const templateId = await fetchTemplateId(page, SEED.unownedSlug);

    await page.goto(`/ko/library/${templateId}`);

    await expect(page).toHaveURL(new RegExp(`/ko/templates/${SEED.unownedSlug}$`));
    await expect(page.getByRole('heading', { name: '미리보기', level: 2 })).toBeVisible();
  });

  test('다운로드 API는 403으로 거부하고 전문을 담지 않는다', async ({ page }) => {
    await signUpAndLogin(page, uniqueEmail(), '/ko/library');
    const templateId = await fetchTemplateId(page, SEED.unownedSlug);

    const response = await page.request.get(`/api/library/${templateId}/download`);

    expect(response.status()).toBe(403);
    const raw = await response.text();
    expect(raw).not.toContain('## 품질 기준');
    expect(raw).not.toContain('## 마무리');
  });

  test('미인증 상태의 다운로드 API는 401이다', async ({ request }) => {
    const response = await request.get('/api/library/00000000-0000-4000-8000-000000000000/download');

    expect(response.status()).toBe(401);
  });

  test('uuid 형식이 아닌 templateId는 404로 처리한다', async ({ page }) => {
    await signUpAndLogin(page, uniqueEmail(), '/ko/library');

    const response = await page.request.get('/api/library/not-a-uuid/download');

    expect(response.status()).toBe(404);
  });
});

test.describe('F3-AC1 / F3-AC2 구매 목록과 전문 열람', () => {
  test('구매일 최신순으로 표시되고 전문 열람 화면으로 이동할 수 있다', async ({ page }) => {
    test.skip(!HAS_BUYER, 'E2E_BUYER_EMAIL / E2E_BUYER_PASSWORD / E2E_OWNED_TEMPLATE_ID 가 필요하다');

    await login(page, BUYER.email!, BUYER.password!);
    await page.goto('/ko/library');

    const items = page.locator('ul > li > article');
    await expect(items.first()).toBeVisible();

    // 서버가 granted_at DESC로 확정한 순서를 그대로 렌더한다.
    const times = await page.locator('ul > li > article time').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('datetime') ?? ''),
    );
    const sorted = [...times].sort((a, b) => b.localeCompare(a));
    expect(times).toEqual(sorted);

    await items.first().getByRole('link', { name: '전문 열람' }).click();
    await expect(page.getByRole('heading', { name: '프롬프트 전문', level: 2 })).toBeVisible();
  });

  test('전문이 마스킹 없이 전부 표시된다', async ({ page }) => {
    test.skip(!HAS_BUYER, '구매 확정 계정 픽스처가 필요하다');

    await login(page, BUYER.email!, BUYER.password!);
    await page.goto(`/ko/library/${BUYER.templateId!}`);

    const body = await page.locator('pre').first().innerText();

    // 상세 페이지 미리보기에서는 절대 볼 수 없던 뒷부분이 여기서는 보인다.
    expect(body).toContain('## 품질 기준');
    expect(body).toContain('## 마무리');
    // 마스킹 안내 문구가 남아 있으면 안 된다.
    await expect(page.getByText('구매 후 전문 열람 가능')).toHaveCount(0);
  });

  test('"전체 복사"가 전문을 클립보드에 넣고 완료를 알린다', async ({ browser }) => {
    test.skip(!HAS_BUYER, '구매 확정 계정 픽스처가 필요하다');

    const context = await browser.newContext();
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const page = await context.newPage();

    await login(page, BUYER.email!, BUYER.password!);
    await page.goto(`/ko/library/${BUYER.templateId!}`);

    const body = await page.locator('pre').first().innerText();
    await page.getByRole('button', { name: '전체 복사' }).click();

    // 복사 완료는 aria-live 토스트로 안내된다.
    await expect(page.getByText('전문이 클립보드에 복사되었습니다.')).toBeVisible();

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(body);

    await context.close();
  });
});

test.describe('F3-AC3 다운로드 파일 = 화면 전문', () => {
  test('다운로드한 텍스트 파일의 내용이 화면에 표시된 전문과 동일하다', async ({ page }) => {
    test.skip(!HAS_BUYER, '구매 확정 계정 픽스처가 필요하다');

    await login(page, BUYER.email!, BUYER.password!);
    await page.goto(`/ko/library/${BUYER.templateId!}`);

    const shown = await page.locator('pre').first().innerText();

    // 라우트 응답을 직접 읽어 바이트 단위로 비교한다(브라우저 다운로드 경로와 동일한 엔드포인트).
    const response = await page.request.get(`/api/library/${BUYER.templateId!}/download`);
    expect(response.status()).toBe(200);

    const headers = response.headers();
    expect(headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(headers['content-disposition']).toContain("attachment; filename*=UTF-8''");
    // 전문이 CDN·브라우저 캐시에 잔류하면 환불 후에도 재획득이 가능해진다.
    expect(headers['cache-control']).toContain('no-store');

    expect(await response.text()).toBe(shown);
  });

  test('다운로드 버튼이 서버 라우트를 가리킨다(클라이언트가 파일을 만들지 않는다)', async ({ page }) => {
    test.skip(!HAS_BUYER, '구매 확정 계정 픽스처가 필요하다');

    await login(page, BUYER.email!, BUYER.password!);
    await page.goto(`/ko/library/${BUYER.templateId!}`);

    await expect(page.getByRole('link', { name: '다운로드' })).toHaveAttribute(
      'href',
      `/api/library/${BUYER.templateId!}/download`,
    );
  });
});

test.describe('F3-AC4 계정 귀속 (기기 무관 동일 목록)', () => {
  test('서로 다른 브라우저 컨텍스트에서 같은 계정은 같은 목록을 본다', async ({ browser }) => {
    test.skip(!HAS_BUYER, '구매 확정 계정 픽스처가 필요하다');

    const readTitles = async (): Promise<string[]> => {
      const context = await browser.newContext();
      const page = await context.newPage();

      await login(page, BUYER.email!, BUYER.password!);
      await page.goto('/ko/library');
      await expect(page.locator('ul > li > article').first()).toBeVisible();

      const titles = await page.locator('ul > li > article h2').allInnerTexts();
      await context.close();
      return titles;
    };

    const [first, second] = await Promise.all([readTitles(), readTitles()]);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
  });
});

test.describe('F3-AC6 최신 버전 열람과 마지막 수정일', () => {
  test('열람 화면에 마지막 수정일이 표시된다', async ({ page }) => {
    test.skip(!HAS_BUYER, '구매 확정 계정 픽스처가 필요하다');

    await login(page, BUYER.email!, BUYER.password!);
    await page.goto(`/ko/library/${BUYER.templateId!}`);

    await expect(page.getByText(/마지막 수정일: /)).toBeVisible();
  });

  test('운영자가 body를 수정하면 재열람 시 최신 내용이 보인다', async ({ page }) => {
    const marker = process.env.E2E_BODY_UPDATE_MARKER;
    test.skip(
      !HAS_BUYER || !marker,
      'templates.body 를 수정한 뒤 E2E_BODY_UPDATE_MARKER 로 새 문자열을 지정해야 한다',
    );

    await login(page, BUYER.email!, BUYER.password!);
    await page.goto(`/ko/library/${BUYER.templateId!}`);

    // 전문은 스냅샷이 아니라 templates.body 실시간 조회 결과다.
    await expect(page.locator('pre').first()).toContainText(marker!);
  });
});

test.describe('F3-AC9 환불 완료 건 열람 차단', () => {
  test('환불된 템플릿은 안내만 보여주고 전문을 노출하지 않는다', async ({ page }) => {
    test.skip(
      !HAS_BUYER || !REVOKED_TEMPLATE_ID,
      'E2E_REVOKED_TEMPLATE_ID (환불 완료된 library_items) 가 필요하다',
    );

    await login(page, BUYER.email!, BUYER.password!);
    await page.goto(`/ko/library/${REVOKED_TEMPLATE_ID!}`);

    await expect(page.getByRole('heading', { name: '환불 처리된 템플릿입니다' })).toBeVisible();
    await expect(page.getByText('환불이 완료되어 전문을 열람할 수 없습니다.')).toBeVisible();

    // 응답 어디에도 전문이 없다.
    const html = await page.content();
    expect(html).not.toContain('## 품질 기준');
    expect(html).not.toContain('## 마무리');
    await expect(page.getByRole('button', { name: '전체 복사' })).toHaveCount(0);
  });

  test('환불된 템플릿의 다운로드도 403으로 거부된다', async ({ page }) => {
    test.skip(!HAS_BUYER || !REVOKED_TEMPLATE_ID, '환불 완료 픽스처가 필요하다');

    await login(page, BUYER.email!, BUYER.password!);

    const response = await page.request.get(`/api/library/${REVOKED_TEMPLATE_ID!}/download`);

    expect(response.status()).toBe(403);
    expect(await response.text()).not.toContain('## 마무리');
  });
});

test.describe('F1-AC8 후단: 판매 중지·삭제된 템플릿도 구매자는 계속 열람한다', () => {
  test('soft delete 된 템플릿이 라이브러리에서 열람 가능하다', async ({ page }) => {
    const deletedTemplateId = process.env.E2E_DELETED_OWNED_TEMPLATE_ID;
    test.skip(
      !HAS_BUYER || !deletedTemplateId,
      'deleted_at 이 설정된 보유 템플릿 uuid(E2E_DELETED_OWNED_TEMPLATE_ID)가 필요하다',
    );

    await login(page, BUYER.email!, BUYER.password!);
    await page.goto(`/ko/library/${deletedTemplateId!}`);

    await expect(page.getByRole('heading', { name: '프롬프트 전문', level: 2 })).toBeVisible();
  });
});
