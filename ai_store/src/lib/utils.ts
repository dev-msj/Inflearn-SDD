import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind 클래스 병합 유틸 (shadcn/ui 컴포넌트 공통 의존) */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
