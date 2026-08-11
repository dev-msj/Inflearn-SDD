import 'server-only';

import { assertTemplateAccess } from './access';
import { db } from '@/lib/db';
import { TemplateNotFoundError } from '@/lib/errors';
import { DEFAULT_LOCALE, isAppLocale } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';
import type { LibraryItemStatus, LibraryListItem, TemplateFullView } from '@/types/domain';

/**
 * 내 라이브러리 서비스 (기능 3).
 *
 * ★`getPurchasedTemplate()`이 프롬프트 전문(body)을 반환하는 **유일한 함수**다.
 *   다른 어떤 서비스·레포지토리도 body를 select 하지 않는다(F1-AC6).
 *   이 함수는 반드시 assertTemplateAccess()를 먼저 호출하며, 게이트 통과 전에는 body를 조회하지 않는다.
 */

function pickCategoryName(category: { nameKo: string; nameEn: string }, locale: AppLocale): string {
  return locale === 'en' ? category.nameEn : category.nameKo;
}

function resolveLocale(locale: string | undefined): AppLocale {
  return isAppLocale(locale) ? locale : DEFAULT_LOCALE;
}

/**
 * 라이브러리 목록 (F3-AC1/4/7).
 * ACTIVE 항목만, 구매일(granted_at) 최신순. 소유 정보는 DB에만 있으므로 기기가 달라도 결과가 같다.
 */
export async function listMyLibrary(userId: string, locale?: string): Promise<LibraryListItem[]> {
  const appLocale = resolveLocale(locale);

  const rows = await db.libraryItem.findMany({
    where: { userId, status: 'ACTIVE' },
    select: {
      templateId: true,
      status: true,
      grantedAt: true,
      order: { select: { orderNo: true } },
      template: {
        select: {
          slug: true,
          title: true,
          thumbnailUrl: true,
          bodyUpdatedAt: true,
          category: { select: { nameKo: true, nameEn: true } },
        },
      },
    },
    orderBy: { grantedAt: 'desc' },
  });

  return rows.map((row) => ({
    templateId: row.templateId,
    slug: row.template.slug,
    title: row.template.title,
    thumbnailUrl: row.template.thumbnailUrl,
    categoryName: pickCategoryName(row.template.category, appLocale),
    grantedAt: row.grantedAt.toISOString(),
    orderNo: row.order.orderNo,
    bodyUpdatedAt: row.template.bodyUpdatedAt.toISOString(),
    status: row.status as LibraryItemStatus,
  }));
}

/**
 * 전문 열람 (F3-AC2/5/6/9).
 *
 * - 소유권 게이트를 먼저 통과한다. 실패하면 AccessDeniedError가 던져져 body 조회 자체가 일어나지 않는다.
 * - body는 항상 실시간 조회한다. 구매 시점의 스냅샷을 두지 않으므로 운영자가 수정하면 최신본이 보인다.
 * - 마지막 수정일은 body_updated_at을 쓴다. 가격만 바뀐 경우에는 값이 흔들리지 않는다.
 */
export async function getPurchasedTemplate(
  userId: string,
  templateId: string,
  locale?: string,
): Promise<TemplateFullView> {
  await assertTemplateAccess(userId, templateId);
  const appLocale = resolveLocale(locale);

  const template = await db.template.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      description: true,
      usageGuide: true,
      thumbnailUrl: true,
      priceKrw: true,
      priceUsd: true,
      status: true,
      previewText: true,
      maskedCharCount: true,
      bodyUpdatedAt: true,
      body: true,
      category: { select: { slug: true, nameKo: true, nameEn: true } },
    },
  });

  if (!template) throw new TemplateNotFoundError(templateId);

  return {
    id: template.id,
    slug: template.slug,
    title: template.title,
    summary: template.summary,
    description: template.description,
    usageGuide: template.usageGuide,
    categorySlug: template.category.slug,
    categoryName: pickCategoryName(template.category, appLocale),
    thumbnailUrl: template.thumbnailUrl,
    priceKrw: template.priceKrw,
    priceUsd: template.priceUsd.toFixed(2),
    status: template.status as TemplateFullView['status'],
    previewText: template.previewText,
    maskedCharCount: template.maskedCharCount,
    bodyUpdatedAt: template.bodyUpdatedAt.toISOString(),
    body: template.body,
  };
}

/**
 * 최초 열람 기록 (F2-AC12 환불 자격 판정의 근거).
 * ★이미 값이 있으면 갱신하지 않는다. "처음 열람한 시각"이 바뀌면 환불 창구 판정이 달라지기 때문이다.
 */
export async function markFirstView(userId: string, templateId: string, now: Date = new Date()): Promise<void> {
  await db.libraryItem.updateMany({
    where: { userId, templateId, status: 'ACTIVE', firstViewedAt: null },
    data: { firstViewedAt: now },
  });
}

/** 최초 다운로드 기록 (F2-AC12). 동일하게 최초 1회만 기록한다. */
export async function markFirstDownload(userId: string, templateId: string, now: Date = new Date()): Promise<void> {
  await db.libraryItem.updateMany({
    where: { userId, templateId, status: 'ACTIVE', firstDownloadedAt: null },
    data: { firstDownloadedAt: now },
  });
}

export interface DownloadPayload {
  filename: string;
  body: string;
}

/**
 * 다운로드용 전문 (F3-AC3).
 * 화면에 표시되는 body와 **완전히 동일한 문자열**을 반환한다(트림·가공 금지).
 */
export async function getDownloadPayload(
  userId: string,
  templateId: string,
  locale?: string,
): Promise<DownloadPayload> {
  const template = await getPurchasedTemplate(userId, templateId, locale);
  await markFirstDownload(userId, templateId);

  return { filename: `${template.slug}.txt`, body: template.body };
}
