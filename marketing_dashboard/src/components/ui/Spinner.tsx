import { cn } from '@/lib/utils';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
  /** 스크린리더용 라벨 (AC-1.6) */
  label?: string;
}

const SIZE_CLASSES: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-9 w-9 border-[3px]',
};

/** 로딩 인디케이터 */
export function Spinner({ size = 'md', className, label = '불러오는 중' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn(
        'inline-block animate-spin rounded-full border-current border-t-transparent align-middle',
        SIZE_CLASSES[size],
        className,
      )}
    />
  );
}

export default Spinner;
