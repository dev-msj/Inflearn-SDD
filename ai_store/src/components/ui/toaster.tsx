'use client';

import { useTranslations } from 'next-intl';

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from './toast';
import { dismissToast, useToast } from './use-toast';

/**
 * 토스트 출력부. 루트 레이아웃에 1회만 마운트한다.
 *
 * 문구(닫기 라벨·영역 이름)는 next-intl에서 가져오므로, 이 컴포넌트는
 * `NextIntlClientProvider` 하위에 있어야 한다.
 */

/** 기본 자동 닫힘 시간(ms). 복사 완료 같은 짧은 안내를 읽기에 충분한 길이다. */
const DEFAULT_DURATION_MS = 4_000;

export function Toaster() {
  const { toasts } = useToast();
  const t = useTranslations('common');

  return (
    <ToastProvider duration={DEFAULT_DURATION_MS} swipeDirection="right">
      {toasts.map(({ id, title, description, variant, duration, open }) => (
        <Toast
          key={id}
          open={open}
          duration={duration}
          variant={variant}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) dismissToast(id);
          }}
        >
          <div className="grid gap-1">
            {title ? <ToastTitle>{title}</ToastTitle> : null}
            {description ? <ToastDescription>{description}</ToastDescription> : null}
          </div>
          <ToastClose label={t('close')} />
        </Toast>
      ))}
      <ToastViewport label={t('notifications')} />
    </ToastProvider>
  );
}
