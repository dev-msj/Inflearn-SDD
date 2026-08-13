'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 로딩 중에는 스피너를 표시하고 클릭을 막는다 (AC-1.6, AC-2.1, AC-3.1) */
  loading?: boolean;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover border border-transparent',
  secondary: 'bg-surface text-ink border border-border-subtle hover:bg-surface-muted',
  ghost: 'bg-transparent text-ink-muted border border-transparent hover:bg-surface-muted',
  danger: 'bg-danger text-white border border-transparent hover:opacity-90',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-control font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size="sm" label="처리 중" /> : null}
      <span>{children}</span>
    </button>
  );
}

export default Button;
