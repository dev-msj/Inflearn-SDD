import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import type { LibraryListItem } from '@/types/domain';

/**
 * 내 라이브러리 목록 (F3-AC1, F3-AC4).
 *
 * ★정렬은 서버(`listMyLibrary()`가 granted_at DESC)가 확정한 순서를 그대로 쓴다.
 *   클라이언트에서 다시 정렬하지 않는다. 두 곳에서 정렬하면 기준이 어긋날 수 있다.
 *
 * ★소유 정보는 전적으로 DB(library_items.user_id)에 있고 브라우저 저장소를 쓰지 않으므로,
 *   다른 기기에서 같은 계정으로 접속해도 이 목록이 동일하다(F3-AC4).
 *
 * ★프롬프트 전문(body)은 이 목록에 오지 않는다. LibraryListItem 타입에 필드가 없다.
 */
interface LibraryListProps {
  items: LibraryListItem[];
  locale: AppLocale;
}

export function LibraryList({ items, locale }: LibraryListProps) {
  const t = useTranslations('library');
  const tTemplates = useTranslations('templates');
  const format = useFormatter();

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.templateId}>
          <article className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center">
            <div className="w-full shrink-0 overflow-hidden rounded-md bg-muted sm:w-40">
              <img
                src={item.thumbnailUrl}
                alt={tTemplates('thumbnailAlt', { title: item.title })}
                loading="lazy"
                decoding="async"
                className="aspect-[16/9] h-full w-full object-cover"
              />
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Badge variant="secondary" className="w-fit">
                {item.categoryName}
              </Badge>
              <h2 className="text-base font-semibold text-foreground">{item.title}</h2>
              <p className="text-sm text-muted-foreground">
                {t('grantedAt')}:{' '}
                <time dateTime={item.grantedAt}>
                  {format.dateTime(new Date(item.grantedAt), { dateStyle: 'medium' })}
                </time>
              </p>
            </div>

            <Link
              href={`/${locale}/library/${item.templateId}`}
              className={cn(buttonVariants({ variant: 'default' }), 'sm:shrink-0')}
            >
              {t('openViewer')}
            </Link>
          </article>
        </li>
      ))}
    </ul>
  );
}
