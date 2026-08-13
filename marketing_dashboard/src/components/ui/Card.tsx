import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface CardProps {
  title?: ReactNode;
  description?: ReactNode;
  /** 헤더 우측 액션 영역 (버튼 등) */
  actions?: ReactNode;
  /** 카드 하단 보조 문구 */
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** 섹션 카드 — 패널 공통 레이아웃 */
export function Card({ title, description, actions, footer, className, children }: CardProps) {
  const hasHeader = title !== undefined || description !== undefined || actions !== undefined;

  return (
    <section
      className={cn(
        'rounded-card border border-border-subtle bg-surface p-panel shadow-sm',
        className,
      )}
    >
      {hasHeader ? (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title !== undefined ? (
              <h2 className="text-base font-semibold text-ink">{title}</h2>
            ) : null}
            {description !== undefined ? (
              <p className="mt-1 text-sm text-ink-muted">{description}</p>
            ) : null}
          </div>
          {actions !== undefined ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </header>
      ) : null}

      {children}

      {footer !== undefined ? (
        <footer className="mt-4 border-t border-border-subtle pt-3 text-xs text-ink-muted">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}

export default Card;
