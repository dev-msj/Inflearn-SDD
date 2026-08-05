'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_SORT_ORDER,
  readSortOrder,
  writeSortOrder,
} from '@/lib/storage';
import type { SortOrder } from '@/types/todo';

export interface UseSortOrderResult {
  sortOrder: SortOrder;
  setSortOrder: (order: SortOrder) => void;
  isLoaded: boolean;
}

export function useSortOrder(): UseSortOrderResult {
  const [sortOrder, setSortOrderState] = useState<SortOrder>(DEFAULT_SORT_ORDER);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const stored = readSortOrder();
    // 저장 값이 없거나 손상된 경우 기본 정렬 기준을 사용한다.
    setSortOrderState(stored.ok ? stored.value : DEFAULT_SORT_ORDER);
    setIsLoaded(true);
  }, []);

  const setSortOrder = useCallback((order: SortOrder): void => {
    setSortOrderState(order);
    // 저장 실패는 화면 동작을 막지 않는다. 다음 진입 시 기본값으로 복원된다.
    writeSortOrder(order);
  }, []);

  return { sortOrder, setSortOrder, isLoaded };
}
