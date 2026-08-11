'use client';

import * as ToastPrimitives from '@radix-ui/react-toast';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * 토스트 (Radix 기반).
 *
 * 접근성(F3-AC2 "복사 완료가 화면에 표시된다" + 비기능 요구)
 *  - Radix `Toast.Root`는 `role="status"`로 렌더되고, 별도의 숨김 live region이
 *    토스트 내용을 읽어 준다. 즉 aria-live 안내가 컴포넌트에 내장되어 있다.
 *  - 여기서 Viewport/Root에 aria-live를 추가로 걸면 같은 문구가 두 번 안내되므로 걸지 않는다.
 *  - Viewport는 `<ol>`이라 `aria-label`을 반드시 주입한다(무명 landmark 방지).
 *  - 토스트가 화면 하단·모바일 전체 폭을 차지해도 360px에서 가로 스크롤이 생기지 않도록
 *    폭을 `calc(100vw-2rem)`으로 제한한다.
 */

const ToastProvider = ToastPrimitives.Provider;

export interface ToastViewportProps
  extends React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport> {
  /** 스크린리더가 읽을 영역 이름. 문구는 next-intl에서 주입한다. */
  label: string;
}

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  ToastViewportProps
>(({ className, label, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    aria-label={label}
    className={cn(
      'fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:w-auto sm:max-w-[24rem]',
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

const toastVariants = cva(
  'pointer-events-auto relative flex w-[calc(100vw-2rem)] max-w-sm items-start gap-3 overflow-hidden rounded-md border p-4 pr-10 shadow-lg transition-all data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-80 data-[state=open]:slide-in-from-bottom-2',
  {
    variants: {
      variant: {
        default: 'border-border bg-background text-foreground',
        success: 'border-success bg-success text-success-foreground',
        destructive: 'border-destructive bg-destructive text-destructive-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => (
  <ToastPrimitives.Root ref={ref} className={cn(toastVariants({ variant }), className)} {...props} />
));
Toast.displayName = ToastPrimitives.Root.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title ref={ref} className={cn('text-sm font-semibold', className)} {...props} />
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description ref={ref} className={cn('text-sm opacity-90', className)} {...props} />
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

export interface ToastCloseProps
  extends React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close> {
  /** 아이콘 전용 버튼이므로 라벨을 반드시 주입한다. */
  label: string;
}

const ToastClose = React.forwardRef<React.ElementRef<typeof ToastPrimitives.Close>, ToastCloseProps>(
  ({ className, label, ...props }, ref) => (
    <ToastPrimitives.Close
      ref={ref}
      className={cn(
        'absolute right-2 top-2 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
      {...props}
    >
      <X className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </ToastPrimitives.Close>
  ),
);
ToastClose.displayName = ToastPrimitives.Close.displayName;

export type ToastRootProps = React.ComponentPropsWithoutRef<typeof Toast>;

export { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport, toastVariants };
