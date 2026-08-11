import { Ban } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { PromptViewer } from '@/components/library/PromptViewer';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/auth-guard';
import { AccessDeniedError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { getPurchasedTemplate } from '@/server/library/library.service';
import { getTemplateSlugById } from '@/server/templates/template.service';
import { isAppLocale } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';

/**
 * 프롬프트 전문 열람 (F3-AC2/3/5/6/9).
 *
 * ★전문(body)이 화면으로 나가는 유일한 페이지다.
 *   `getPurchasedTemplate()`이 내부에서 `assertTemplateAccess()`를 먼저 통과시키므로,
 *   소유하지 않은 사용자에게는 body 조회 자체가 일어나지 않는다.
 *
 * ★거부 사유별 처리
 *   NOT_AUTHENTICATED → 로그인 화면(callbackUrl 유지)  (F3-AC8)
 *   NOT_OWNED         → 해당 템플릿 상세 페이지로 안내  (F3-AC5)
 *   REFUNDED          → "환불 처리된 템플릿입니다" 안내, 전문 미노출 (F3-AC9)
 */

export const dynamic = 'force-dynamic';

/** templateId는 uuid다. 형식이 어긋난 값을 그대로 조회하면 DB 오류(500)가 나므로 먼저 거른다. */
const templateIdSchema = z.string().uuid();

interface LibraryViewerPageProps {
  params: Promise<{ locale: string; templateId: string }>;
}

export default async function LibraryViewerPage({ params }: LibraryViewerPageProps) {
  const { locale: rawLocale, templateId } = await params;
  if (!isAppLocale(rawLocale)) notFound();
  const locale: AppLocale = rawLocale;

  if (!templateIdSchema.safeParse(templateId).success) notFound();

  const user = await getCurrentUser();
  if (!user) {
    const callbackUrl = `/${locale}/library/${templateId}`;
    redirect(`/${locale}/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const t = await getTranslations('library');

  try {
    const template = await getPurchasedTemplate(user.id, templateId, locale);

    return (
      <article className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <Badge variant="secondary" className="w-fit">
            {template.categoryName}
          </Badge>
          <h1 className="text-2xl font-bold text-foreground">{template.title}</h1>
          <p className="text-sm text-muted-foreground">{template.summary}</p>
        </header>

        {/* 마스킹 없는 전문 + 복사/다운로드 + 마지막 수정일 (F3-AC2/3/6) */}
        <PromptViewer
          templateId={template.id}
          body={template.body}
          bodyUpdatedAt={template.bodyUpdatedAt}
        />
      </article>
    );
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;

    if (error.reason === 'REFUNDED') {
      // F3-AC9: 안내만 하고 전문은 조회조차 하지 않는다.
      return (
        <section
          role="status"
          className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-4 py-12 text-center"
        >
          <Ban className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-xl font-semibold text-foreground">{t('denied.refundedTitle')}</h1>
          <p className="max-w-md text-sm text-muted-foreground">{t('denied.refundedDescription')}</p>
          <Link href={`/${locale}/library`} className={cn(buttonVariants({ variant: 'outline' }))}>
            {t('title')}
          </Link>
        </section>
      );
    }

    // F3-AC5: 미구매 접근은 거부하고 해당 템플릿 상세 페이지로 안내한다.
    const slug = await getTemplateSlugById(templateId);
    if (!slug) notFound();
    redirect(`/${locale}/templates/${slug}`);
  }
}
