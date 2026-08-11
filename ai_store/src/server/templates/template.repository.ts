import 'server-only';

import { Prisma } from '@prisma/client';

import { db } from '@/lib/db';
import type { AppLocale } from '@/i18n/routing';
import type {
  CategoryView,
  TemplateCardView,
  TemplatePreviewView,
  TemplateStatus,
} from '@/types/domain';

/**
 * 템플릿 조회 레포지토리 (F1-AC1/2/3/6).
 *
 * ★마스킹 유출 차단의 1차 방어선 (TECH_SPEC 6장 "4중 방어" 1번)
 *   이 파일의 모든 select에 `body`가 **존재하지 않는다**. Prisma가 생성하는 반환 타입에도
 *   body 필드가 없으므로, 실수로 응답에 실으려 하면 컴파일 단계에서 걸린다.
 *   프롬프트 전문을 읽는 유일한 경로는 소유권 게이트를 통과한 library.service.ts뿐이다.
 */

/** 목록 카드에 필요한 최소 컬럼. description·usageGuide·previewText도 싣지 않는다. */
const CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  thumbnailUrl: true,
  priceKrw: true,
  priceUsd: true,
  status: true,
  category: { select: { slug: true, nameKo: true, nameEn: true } },
} satisfies Prisma.TemplateSelect;

/** 상세(미리보기) 컬럼. previewText는 저장된 마스킹 결과이며 body가 아니다. */
const PREVIEW_SELECT = {
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
  deletedAt: true,
  category: { select: { slug: true, nameKo: true, nameEn: true } },
} satisfies Prisma.TemplateSelect;

type CardRow = Prisma.TemplateGetPayload<{ select: typeof CARD_SELECT }>;
type PreviewRow = Prisma.TemplateGetPayload<{ select: typeof PREVIEW_SELECT }>;

function pickCategoryName(
  category: { nameKo: string; nameEn: string },
  locale: AppLocale,
): string {
  return locale === 'en' ? category.nameEn : category.nameKo;
}

function toCardView(row: CardRow, locale: AppLocale): TemplateCardView {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    categorySlug: row.category.slug,
    categoryName: pickCategoryName(row.category, locale),
    thumbnailUrl: row.thumbnailUrl,
    priceKrw: row.priceKrw,
    // Decimal은 JSON 직렬화가 불가능하므로 경계에서 문자열로 고정한다(부동소수 오차 방지).
    priceUsd: row.priceUsd.toFixed(2),
    status: row.status as TemplateStatus,
  };
}

function toPreviewView(row: PreviewRow, locale: AppLocale): TemplatePreviewView {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    usageGuide: row.usageGuide,
    categorySlug: row.category.slug,
    categoryName: pickCategoryName(row.category, locale),
    thumbnailUrl: row.thumbnailUrl,
    priceKrw: row.priceKrw,
    priceUsd: row.priceUsd.toFixed(2),
    status: row.status as TemplateStatus,
    previewText: row.previewText,
    maskedCharCount: row.maskedCharCount,
    bodyUpdatedAt: row.bodyUpdatedAt.toISOString(),
  };
}

export interface FindTemplateCardsParams {
  q?: string;
  categorySlug?: string;
  skip: number;
  take: number;
  locale: AppLocale;
}

export interface FindTemplateCardsResult {
  items: TemplateCardView[];
  total: number;
}

/**
 * 목록 where 절.
 * - 판매 중(ON_SALE) + 미삭제만 노출한다(F1-AC1, F1-AC8).
 * - 카테고리와 검색어는 AND로 결합한다(F1-AC2).
 * - 검색은 제목·설명 OR 부분 일치. pg_trgm GIN 인덱스가 1초 기준을 담당한다(F1-AC3).
 */
function buildListWhere(params: { q?: string; categorySlug?: string }): Prisma.TemplateWhereInput {
  const where: Prisma.TemplateWhereInput = {
    status: 'ON_SALE',
    deletedAt: null,
  };

  if (params.categorySlug) {
    where.category = { slug: params.categorySlug };
  }

  const keyword = params.q?.trim();
  if (keyword) {
    where.OR = [
      { title: { contains: keyword, mode: 'insensitive' } },
      { description: { contains: keyword, mode: 'insensitive' } },
    ];
  }

  return where;
}

export async function findTemplateCards(
  params: FindTemplateCardsParams,
): Promise<FindTemplateCardsResult> {
  const where = buildListWhere(params);

  const [rows, total] = await Promise.all([
    db.template.findMany({
      where,
      select: CARD_SELECT,
      // published_at DESC(최신순). NULL은 목록에 나오지 않지만 정렬 안정성을 위해 id를 보조 키로 둔다.
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      skip: params.skip,
      take: params.take,
    }),
    db.template.count({ where }),
  ]);

  return { items: rows.map((row) => toCardView(row, params.locale)), total };
}

export interface TemplateDetailRow {
  template: TemplatePreviewView;
  /** soft delete 여부. 서비스 계층의 isPurchasable 판정에 쓰인다(F1-AC8). */
  deleted: boolean;
}

/**
 * 상세 조회.
 * 판매 중지·삭제 상태여도 메타는 반환한다(안내 문구를 띄워야 하므로). 구매 가능 여부는 서비스가 판정한다.
 */
export async function findTemplateDetailBySlug(
  slug: string,
  locale: AppLocale,
): Promise<TemplateDetailRow | null> {
  const row = await db.template.findUnique({ where: { slug }, select: PREVIEW_SELECT });
  if (!row) return null;

  return { template: toPreviewView(row, locale), deleted: row.deletedAt !== null };
}

/** 결제 시작에 필요한 최소 정보. 여기에도 body는 없다. */
export interface TemplateCheckoutRow {
  id: string;
  slug: string;
  title: string;
  priceKrw: number;
  /** Decimal 직렬화 문자열 */
  priceUsd: string;
  status: TemplateStatus;
  deleted: boolean;
}

export async function findTemplateForCheckout(slug: string): Promise<TemplateCheckoutRow | null> {
  const row = await db.template.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      priceKrw: true,
      priceUsd: true,
      status: true,
      deletedAt: true,
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    priceKrw: row.priceKrw,
    priceUsd: row.priceUsd.toFixed(2),
    status: row.status as TemplateStatus,
    deleted: row.deletedAt !== null,
  };
}

/**
 * 템플릿 id → slug.
 *
 * 라이브러리 전문 경로(`/library/{templateId}`)에 미구매 상태로 직접 접근했을 때
 * 상세 페이지(`/templates/{slug}`)로 안내하기 위해 필요하다(F3-AC5).
 * 판매 중지·삭제 상태여도 slug는 반환한다. 상세 페이지가 안내 배너를 띄우기 때문이다.
 * 여기에도 body는 select 하지 않는다.
 */
export async function findTemplateSlugById(templateId: string): Promise<string | null> {
  const row = await db.template.findUnique({ where: { id: templateId }, select: { slug: true } });
  return row?.slug ?? null;
}

/** 카테고리 필터 UI용 목록. 정렬은 sort_order 우선, 동률이면 slug. */
export async function findCategories(locale: AppLocale): Promise<CategoryView[]> {
  const rows = await db.category.findMany({
    select: { id: true, slug: true, nameKo: true, nameEn: true, sortOrder: true },
    orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
  });

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: pickCategoryName(row, locale),
    sortOrder: row.sortOrder,
  }));
}
