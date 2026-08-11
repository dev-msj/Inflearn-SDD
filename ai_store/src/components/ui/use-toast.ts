'use client';

import * as React from 'react';

/**
 * 토스트 상태 저장소.
 *
 * 컴포넌트 트리 밖(모듈 스코프)에 상태를 두는 이유:
 *  - `CopyButton` 같은 말단 컴포넌트가 Context Provider 위치를 신경 쓰지 않고 `toast()`만 호출하면 된다.
 *  - 상태 관리 라이브러리를 추가하지 않는다는 기술 결정(TECH_SPEC 1장 "채택하지 않은 선택지")을 지킨다.
 *
 * ※ 이 파일은 UI 상태만 다룬다. 도메인 데이터·프롬프트 전문은 절대 저장하지 않는다.
 */

/** 동시에 화면에 유지할 최대 개수. 여러 개가 쌓이면 스크린리더 안내가 뒤엉킨다. */
const TOAST_LIMIT = 3;
/** open=false 이후 DOM에서 제거하기까지의 지연(ms). 닫힘 애니메이션 시간이다. */
const TOAST_REMOVE_DELAY_MS = 200;

export type ToastVariant = 'default' | 'success' | 'destructive';

export interface ToasterToast {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastVariant;
  /** 자동 닫힘까지의 시간(ms). 미지정 시 Toaster의 기본값을 따른다. */
  duration?: number;
  open: boolean;
}

interface ToastState {
  toasts: ToasterToast[];
}

type ToastAction =
  | { type: 'ADD'; toast: ToasterToast }
  | { type: 'DISMISS'; toastId: string }
  | { type: 'REMOVE'; toastId: string };

let state: ToastState = { toasts: [] };
const listeners = new Set<(next: ToastState) => void>();
const removeTimers = new Map<string, ReturnType<typeof setTimeout>>();

let counter = 0;
function nextId(): string {
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
  return `toast-${counter}`;
}

function reduce(current: ToastState, action: ToastAction): ToastState {
  switch (action.type) {
    case 'ADD':
      return { toasts: [action.toast, ...current.toasts].slice(0, TOAST_LIMIT) };
    case 'DISMISS':
      return {
        toasts: current.toasts.map((t) => (t.id === action.toastId ? { ...t, open: false } : t)),
      };
    case 'REMOVE':
      return { toasts: current.toasts.filter((t) => t.id !== action.toastId) };
    default:
      return current;
  }
}

function dispatch(action: ToastAction): void {
  state = reduce(state, action);
  listeners.forEach((listener) => listener(state));
}

function scheduleRemove(toastId: string): void {
  if (removeTimers.has(toastId)) return;

  const timer = setTimeout(() => {
    removeTimers.delete(toastId);
    dispatch({ type: 'REMOVE', toastId });
  }, TOAST_REMOVE_DELAY_MS);

  removeTimers.set(toastId, timer);
}

export function dismissToast(toastId: string): void {
  dispatch({ type: 'DISMISS', toastId });
  scheduleRemove(toastId);
}

export interface ToastOptions {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastVariant;
  duration?: number;
}

/** 토스트 표시. 반환값의 dismiss()로 수동 닫기가 가능하다. */
export function toast(options: ToastOptions): { id: string; dismiss: () => void } {
  const id = nextId();

  dispatch({ type: 'ADD', toast: { ...options, id, open: true } });

  return { id, dismiss: () => dismissToast(id) };
}

export interface UseToastReturn {
  toasts: ToasterToast[];
  toast: typeof toast;
  dismiss: (toastId: string) => void;
}

/** Toaster가 구독하는 훅. 일반 컴포넌트는 `toast()` 함수만 써도 된다. */
export function useToast(): UseToastReturn {
  const [current, setCurrent] = React.useState<ToastState>(state);

  React.useEffect(() => {
    listeners.add(setCurrent);
    // 구독 시점과 마운트 시점 사이에 발생한 토스트를 놓치지 않도록 최신 상태로 맞춘다.
    setCurrent(state);

    return () => {
      listeners.delete(setCurrent);
    };
  }, []);

  return { toasts: current.toasts, toast, dismiss: dismissToast };
}
