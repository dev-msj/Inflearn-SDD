import 'server-only';

import {
  findCategories,
  findTemplateCards,
  findTemplateDetailBySlug,
  findTemplateForCheckout,
  findTemplateSlugById,
  type TemplateCheckoutRow,
} from './template.repository';
import { DEFAULT_PAGE_SIZE } from '@/types/api';
import { TemplateNotFoundError, TemplateNotPurchasableError } from '@/lib/errors';
import type { AppLocale } from '@/i18n/routing';
import type { CategoryView, TemplateCardView, TemplatePreviewView } from '@/types/domain';

/**
 * 템플릿 탐색 서비스 (기능 1).
 * 페이지·API 라우트가 모두 이 함수만 호출한다. 데이터 접근은 레포지토리에만 존재한다.
 */

export interface ListTemplatesParams {
  q?: string;
  categorySlug?: string;
  page?: number;
  pageSize?: number;
  locale: AppLocale;
}

export interface ListTemplatesResult {
  items: TemplateCardView[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 페이지 크기 상한. 클라이언트가 큰 값을 넘겨 전체를 긁어가는 것을 막는다. */
const MAX_PAGE_SIZE = 50;

function normalizePage(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) return 1;
  return Math.max(1, Math.floor(value));
}

function normalizePageSize(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(1, Math.floor(value)), MAX_PAGE_SIZE);
}

/**
 * 목록·검색·카테고리 필터 (F1-AC1/2/3).
 * 요청 페이지가 총 페이지 수를 넘으면 빈 배열을 반환한다(F1-AC7의 0건 안내와 동일하게 처리).
 */
export async function listTemplates(params: ListTemplatesParams): Promise<ListTemplatesResult> {
  const page = normalizePage(params.page);
  const pageSize = normalizePageSize(params.pageSize);

  const { items, total } = await findTemplateCards({
    q: params.q,
    categorySlug: params.categorySlug,
    skip: (page - 1) * pageSize,
    take: pageSize,
    locale: params.locale,
  });

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

export interface TemplateDetailResult {
  template: TemplatePreviewView;
  /** F1-AC8: ON_SALE이면서 삭제되지 않은 경우에만 구매 버튼을 노출한다. */
  isPurchasable: boolean;
}

/**
 * 상세 조회 (F1-AC4/5/8).
 * 판매 중지·삭제 상태여도 메타는 반환한다. 화면은 안내 배너를 띄우고 구매 버튼을 감춘다.
 * 반환 타입에 body가 없으므로 전문은 어떤 경우에도 이 경로로 나갈 수 없다(F1-AC6).
 */
export async function getTemplateDetail(
  slug: string,
  locale: AppLocale,
): Promise<TemplateDetailResult | null> {
  const row = await findTemplateDetailBySlug(slug, locale);
  if (!row) return null;

  return {
    template: row.template,
    isPurchasable: row.template.status === 'ON_SALE' && !row.deleted,
  };
}

/**
 * 템플릿 id로 상세 경로의 slug를 얻는다 (F3-AC5).
 * 미구매 상태로 전문 경로에 접근한 사용자를 상세 페이지로 돌려보낼 때만 쓴다.
 */
export async function getTemplateSlugById(templateId: string): Promise<string | null> {
  return findTemplateSlugById(templateId);
}

/** 카테고리 필터 목록 (F1-AC2). */
export async function listCategories(locale: AppLocale): Promise<CategoryView[]> {
  return findCategories(locale);
}

/**
 * 결제 시작용 템플릿 조회 (F2-AC1/8 보조).
 * 판매 불가 상태면 여기서 차단하므로, 주문 생성 코드가 상태 판정을 중복 구현하지 않는다.
 */
export async function getPurchasableTemplate(slug: string): Promise<TemplateCheckoutRow> {
  const template = await findTemplateForCheckout(slug);
  if (!template) throw new TemplateNotFoundError(slug);
  if (template.status !== 'ON_SALE' || template.deleted) {
    throw new TemplateNotPurchasableError(slug);
  }
  return template;
}

export type { TemplateCheckoutRow };
