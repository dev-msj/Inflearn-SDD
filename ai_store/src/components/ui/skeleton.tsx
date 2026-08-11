import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * 로딩 플레이스홀더.
 *
 * ★`aria-hidden`을 기본값으로 둔다. 회색 블록은 시각적 신호일 뿐이고,
 *   로딩 상태 안내는 상위 컨테이너가 `aria-busy`/live region으로 한 번만 전달해야
 *   스크린리더가 의미 없는 블록 수를 읽지 않는다.
 */
export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

export { Skeleton };
