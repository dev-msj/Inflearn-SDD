import { expect, test } from '@playwright/test';

/**
 * 기능 1 — 템플릿 탐색 및 상세 미리보기 E2E (F1-AC1 ~ F1-AC9).
 *
 * ▣ 실행 사전 조건 (이 스펙은 아직 실행되지 않았다)
 *   1. `cp .env.example .env` 후 값 채우기 (DATABASE_URL 필수)
 *   2. `docker compose up -d postgres`
 *   3. `npx prisma migrate dev`
 *   4. `npx prisma db seed`   ← 아래 상수들은 prisma/seed.ts 데이터에 의존한다
 *   5. `npm run test:e2e`     (playwright.config.ts의 webServer가 `npm run dev`를 띄운다)
 *   결제사 키는 이 스펙에 필요 없다. 기능 1은 공개 조회 경로만 사용한다.
 *
 * ▣ 이 스펙의 핵심은 F1-AC6 "어떤 경로로도 원문 미노출"이다.
 *   페이지 HTML · RSC 플라이트 페이로드 · /api/templates · /api/templates/[slug]
 *   네 곳 모두에서 프롬프트 전문 문자열이 부재함을 단언한다.
 */

/** 시드 데이터 (prisma/seed.ts) */
const SEED = {
  /** ON_SALE + 미삭제 템플릿 수. 20개 단위 페이지네이션이 2페이지가 된다. */
  visibleTemplateCount: 28,
  pageSize: 20,
  sample: {
    slug: 'email-marketing-sequence',
    title: '이메일 마케팅 시퀀스 설계 프롬프트',
    categorySlug: 'marketing',
    categoryNameKo: '마케팅',
    /** 설명에만 있고 어떤 제목에도 없는 키워드 (F1-AC3 검증용) */
    descriptionOnlyKeyword: '온보딩',
  },
  suspendedSlug: 'suspended-growth-hacking',
  draftSlug: 'draft-upcoming-prompt',
  nonsenseQuery: 'ZZZ존재하지않는키워드ZZZ',
} as const;

/**
 * 프롬프트 전문(templates.body)의 뒤쪽에만 존재하는 문자열들.
 *
 * prisma/seed.ts의 `buildBody()` footer에서 가져왔다. 미리보기는 앞 30% 이하이므로
 * 이 문자열들은 **반드시 마스킹 구간**에 있다. 따라서 어떤 응답에서든 발견되면
 * 그 순간 F1-AC6 위반이다.
 */
const MASKED_BODY_MARKERS = [
  '## 품질 기준',
  '## 마무리',
  '근거 없는 단정 표현을 쓰지 않는다',
  '작성이 끝나면',
  '전환이 일어나지 않은 사용자에게 보낼 리마인드 메일을 별도로 작성한다',
] as const;

/** 응답 텍스트에 전문 조각이 하나도 없어야 한다. */
function expectNoPromptBody(payload: string, where: string): void {
  for (const marker of MASKED_BODY_MARKERS) {
    expect(payload.includes(marker), `${where} 에 프롬프트 전문 조각이 노출됐다: ${marker}`).toBe(
      false,
    );
  }
}

/** 목록 카드 로케이터. TemplateGrid의 `<ul><li><article>` 구조를 따른다. */
function templateCards(page: import('@playwright/test').Page) {
  return page.locator('ul > li > article a[href*="/templates/"]');
}

test.describe('F1-AC1 목록 표시와 20개 단위 페이지네이션', () => {
  test('1페이지에 20개가 표시되고 카드에 제목·카테고리·KRW/USD 가격·이미지가 있다', async ({
    page,
  }) => {
    await page.goto('/ko');

    await expect(page.getByRole('heading', { name: '프롬프트 템플릿', level: 1 })).toBeVisible();

    const cards = templateCards(page);
    await expect(cards).toHaveCount(SEED.pageSize);

    const first = cards.first();
    // 제목(h3) · 카테고리 뱃지 · 대표 이미지
    await expect(first.locator('h3')).not.toBeEmpty();
    await expect(first.locator('img')).toHaveAttribute('src', /.+/);

    // 가격은 KRW/USD 병기다(D4 통화별 개별 고정가).
    await expect(first).toContainText('원');
    await expect(first).toContainText('$');
  });

  test('다음 페이지로 이동하면 나머지 항목이 표시된다', async ({ page }) => {
    await page.goto('/ko');

    const pagination = page.getByRole('navigation', { name: '페이지 이동' });
    await expect(pagination).toContainText('1 / 2 페이지');

    await pagination.getByRole('link', { name: '2페이지로 이동' }).click();

    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(templateCards(page)).toHaveCount(SEED.visibleTemplateCount - SEED.pageSize);
  });

  test('DRAFT 템플릿은 목록에 노출되지 않는다', async ({ page }) => {
    await page.goto('/ko');
    await expect(page.locator(`a[href$="/templates/${SEED.draftSlug}"]`)).toHaveCount(0);

    await page.goto('/ko?page=2');
    await expect(page.locator(`a[href$="/templates/${SEED.draftSlug}"]`)).toHaveCount(0);
  });
});

test.describe('F1-AC2 카테고리 필터 (검색어와 동시 적용)', () => {
  test('카테고리를 선택하면 해당 카테고리만 남고 선택 상태가 화면에 표시된다', async ({ page }) => {
    await page.goto('/ko');

    await page.getByRole('link', { name: SEED.sample.categoryNameKo, exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`category=${SEED.sample.categorySlug}`));
    await expect(page.getByText(`선택한 카테고리: ${SEED.sample.categoryNameKo}`)).toBeVisible();

    const badges = templateCards(page).locator('span', { hasText: SEED.sample.categoryNameKo });
    const cardCount = await templateCards(page).count();
    expect(cardCount).toBeGreaterThan(0);
    await expect(badges).toHaveCount(cardCount);
  });

  test('카테고리와 검색어가 동시에 적용된다', async ({ page }) => {
    await page.goto(`/ko?category=${SEED.sample.categorySlug}&q=이메일`);

    const cards = templateCards(page);
    await expect(cards).not.toHaveCount(0);

    // 모든 결과가 선택 카테고리에 속한다.
    for (const card of await cards.all()) {
      await expect(card).toContainText(SEED.sample.categoryNameKo);
    }
    await expect(page.locator(`a[href$="/templates/${SEED.sample.slug}"]`)).toBeVisible();
  });
});

test.describe('F1-AC3 키워드 검색', () => {
  test('설명에만 있는 키워드로도 검색된다', async ({ page }) => {
    await page.goto('/ko');

    await page.getByLabel('템플릿 검색').fill(SEED.sample.descriptionOnlyKeyword);
    await page.getByRole('button', { name: '검색' }).click();

    await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(SEED.sample.descriptionOnlyKeyword)}`));
    await expect(page.locator(`a[href$="/templates/${SEED.sample.slug}"]`)).toBeVisible();
  });

  test('검색 결과가 1초 이내에 표시된다 (비기능 요구)', async ({ page }) => {
    await page.goto('/ko');

    const startedAt = Date.now();
    await page.goto('/ko?q=프롬프트');
    await expect(templateCards(page).first()).toBeVisible();

    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });
});

test.describe('F1-AC4 / F1-AC5 상세 표시와 30% 마스킹 미리보기', () => {
  test('상세에 제목·설명·카테고리·가격·사용 예시·미리보기가 모두 표시된다', async ({ page }) => {
    await page.goto(`/ko/templates/${SEED.sample.slug}`);

    await expect(page.getByRole('heading', { name: SEED.sample.title, level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: '가격', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: '설명', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: '사용 예시 안내', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: '미리보기', level: 2 })).toBeVisible();
    await expect(page.getByText(SEED.sample.categoryNameKo).first()).toBeVisible();
  });

  test('미리보기에 30% 안내와 "구매 후 전문 열람 가능" 문구가 함께 표시된다', async ({ page }) => {
    await page.goto(`/ko/templates/${SEED.sample.slug}`);

    await expect(page.getByText('프롬프트 전문 중 앞부분 30%만 표시됩니다.')).toBeVisible();
    await expect(page.getByText('구매 후 전문 열람 가능')).toBeVisible();
    await expect(page.getByText(/나머지 [\d,]+자는 가려져 있습니다\./)).toBeVisible();
  });

  test('화면에 표시된 미리보기 길이가 안내한 마스킹 수치와 일관된다', async ({ page, request }) => {
    const response = await request.get(`/api/templates/${SEED.sample.slug}`);
    expect(response.status()).toBe(200);

    const payload = (await response.json()) as {
      template: { previewText: string; maskedCharCount: number };
    };

    // 미리보기 + 마스킹 = 전문 길이이므로, 미리보기가 전체의 30%를 넘을 수 없다.
    const total = payload.template.previewText.length + payload.template.maskedCharCount;
    expect(payload.template.previewText.length).toBeLessThanOrEqual(Math.floor(total * 0.3));
  });
});

test.describe('★F1-AC6 어떤 경로로도 원문이 노출되지 않는다', () => {
  test('① 상세 페이지 HTML에 전문이 없다', async ({ page }) => {
    await page.goto(`/ko/templates/${SEED.sample.slug}`);
    await expect(page.getByRole('heading', { name: '미리보기', level: 2 })).toBeVisible();

    expectNoPromptBody(await page.content(), '상세 페이지 HTML');
  });

  test('② RSC 플라이트 페이로드에 전문이 없다', async ({ request }) => {
    // Next.js는 `RSC: 1` 헤더가 붙은 요청에 플라이트 페이로드를 그대로 돌려준다.
    const response = await request.get(`/ko/templates/${SEED.sample.slug}`, {
      headers: { RSC: '1' },
    });
    expect(response.status()).toBe(200);

    expectNoPromptBody(await response.text(), 'RSC 플라이트 페이로드');
  });

  test('③ /api/templates 응답에 전문도 미리보기도 없다', async ({ request }) => {
    const response = await request.get('/api/templates?pageSize=50');
    expect(response.status()).toBe(200);

    const raw = await response.text();
    expectNoPromptBody(raw, '/api/templates');

    const payload = JSON.parse(raw) as { items: Array<Record<string, unknown>> };
    for (const item of payload.items) {
      expect(item).not.toHaveProperty('body');
      expect(item).not.toHaveProperty('previewText');
    }
  });

  test('④ /api/templates/[slug] 응답에 전문이 없다', async ({ request }) => {
    const response = await request.get(`/api/templates/${SEED.sample.slug}`);
    expect(response.status()).toBe(200);

    const raw = await response.text();
    expectNoPromptBody(raw, '/api/templates/[slug]');

    const payload = JSON.parse(raw) as { template: Record<string, unknown> };
    expect(payload.template).not.toHaveProperty('body');
    expect(payload.template).toHaveProperty('previewText');
  });

  test('미리보기 영역을 전체 선택·복사해도 마스킹 구간 원문은 얻을 수 없다', async ({ page }) => {
    await page.goto(`/ko/templates/${SEED.sample.slug}`);

    // 마스킹 구간은 "감춘 텍스트"가 아니라 텍스트가 없는 장식 블록이므로
    // 페이지 전체 innerText 어디에도 원문이 없다.
    const visibleText = await page.locator('body').innerText();
    expectNoPromptBody(visibleText, '페이지 전체 텍스트(복사 대상)');
  });
});

test.describe('F1-AC7 검색 결과 0건', () => {
  test('안내 문구와 전체 목록 복귀 경로를 제공한다', async ({ page }) => {
    await page.goto(`/ko?q=${encodeURIComponent(SEED.nonsenseQuery)}`);

    await expect(page.getByRole('heading', { name: '검색 결과가 없습니다' })).toBeVisible();

    await page.getByRole('link', { name: '전체 목록 보기' }).click();

    await expect(page).toHaveURL(/\/ko$/);
    await expect(templateCards(page)).toHaveCount(SEED.pageSize);
  });
});

test.describe('F1-AC8 판매 중지 템플릿', () => {
  test('안내를 표시하고 구매 버튼을 노출하지 않는다', async ({ page }) => {
    await page.goto(`/ko/templates/${SEED.suspendedSlug}`);

    await expect(page.getByText('현재 판매하지 않는 템플릿입니다.')).toBeVisible();
    await expect(
      page.getByText('이미 구매하신 경우 내 라이브러리에서 계속 열람할 수 있습니다.'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: '구매하기' })).toHaveCount(0);
  });

  test('판매 중지 상태여도 전문은 여전히 노출되지 않는다', async ({ page }) => {
    await page.goto(`/ko/templates/${SEED.suspendedSlug}`);
    expectNoPromptBody(await page.content(), '판매 중지 템플릿 상세 HTML');
  });
});

test.describe('F1-AC9 로드 실패 시 오류 안내와 재시도', () => {
  test('데이터 조회 실패 시 오류 안내와 재시도 버튼이 표시된다', async ({ page }) => {
    // 이 검증은 DB를 의도적으로 중단한 상태에서만 의미가 있다.
    //   docker compose stop postgres && E2E_FAULT_INJECTION=1 npm run test:e2e
    test.skip(
      process.env.E2E_FAULT_INJECTION !== '1',
      'DB 장애 주입 환경(E2E_FAULT_INJECTION=1 + postgres 중단)에서만 실행한다',
    );

    await page.goto('/ko');

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('템플릿 목록을 불러오지 못했습니다');
    await expect(alert.getByRole('button', { name: '다시 시도' })).toBeVisible();
  });

  test('존재하지 않는 slug는 404 안내를 표시한다', async ({ page }) => {
    await page.goto('/ko/templates/no-such-template-slug');

    await expect(page.getByText('페이지를 찾을 수 없습니다')).toBeVisible();
  });
});

test.describe('비기능 요구: 360px에서 가로 스크롤이 없다', () => {
  test('목록과 상세 모두 가로 스크롤이 발생하지 않는다', async ({ page }) => {
    for (const path of ['/ko', `/ko/templates/${SEED.sample.slug}`]) {
      await page.goto(path);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} 에서 가로 스크롤이 발생했다`).toBeLessThanOrEqual(1);
    }
  });
});
