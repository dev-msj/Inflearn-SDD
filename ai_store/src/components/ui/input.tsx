import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * 공통 입력 필드.
 * 라벨은 이 컴포넌트가 만들지 않는다. 호출부가 `<label htmlFor>`로 명시적으로 연결해
 * 스크린리더가 어떤 값을 입력하는지 항상 읽을 수 있게 한다.
 */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
      'placeholder:text-muted-foreground',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      'disabled:cursor-not-allowed disabled:opacity-60',
      'aria-[invalid=true]:border-destructive',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
