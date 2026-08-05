'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readTodos, writeTodos } from '@/lib/storage';
import {
  VALIDATION_MESSAGES,
  validateDueDate,
  validateTitle,
} from '@/lib/todoValidation';
import type { Todo } from '@/types/todo';

/** seq 시작 값. 첫 항목은 1이 된다. */
const SEQ_BASE = 0;
const SEQ_STEP = 1;

export interface TodoInput {
  title: string;
  dueDate: string | null;
}

export interface UseTodosResult {
  todos: Todo[];
  isLoaded: boolean;
  errorMessage: string | null;
  totalCount: number;
  completedCount: number;
  addTodo: (input: TodoInput) => boolean;
  removeTodo: (id: string) => void;
  toggleTodo: (id: string) => void;
  setDueDate: (id: string, rawDueDate: string) => boolean;
}

export function useTodos(): UseTodosResult {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * 커밋된 최신 목록. 같은 틱에 여러 번 변경해도 직전 결과를 기준으로
   * 다음 상태를 계산하기 위해 상태와 함께 갱신한다.
   */
  const todosRef = useRef<Todo[]>([]);

  useEffect(() => {
    const loaded = readTodos();
    // 저장소를 사용할 수 없거나 데이터가 손상된 경우에도 빈 목록으로 시작하되,
    // 빈 목록이 "할 일이 없음"으로 오인되지 않도록 실패 사유를 화면에 알린다.
    const value = loaded.ok ? loaded.value : [];
    todosRef.current = value;
    setTodos(value);
    if (!loaded.ok) {
      setErrorMessage(
        loaded.error === 'UNAVAILABLE'
          ? VALIDATION_MESSAGES.storageUnavailable
          : VALIDATION_MESSAGES.loadFailed
      );
    }
    setIsLoaded(true);
  }, []);

  /**
   * 다음 목록을 계산해 저장한다.
   * 저장에 실패하면 상태를 갱신하지 않아 변경 직전 상태가 그대로 유지되고,
   * errorMessage에 saveFailed를 세팅한 뒤 false를 반환한다.
   */
  const commit = useCallback((next: Todo[]): boolean => {
    const saved = writeTodos(next);
    if (!saved.ok) {
      setErrorMessage(VALIDATION_MESSAGES.saveFailed);
      return false;
    }
    todosRef.current = next;
    setTodos(next);
    setErrorMessage(null);
    return true;
  }, []);

  /**
   * 검증 통과 시 목록 맨 뒤에 추가하고 저장한 뒤 true, 실패 시 errorMessage를 세팅하고 false.
   * 화면에서는 TodoForm이 같은 규칙으로 먼저 검증해 입력란 옆에 오류를 표시하므로,
   * 아래 검증 분기는 폼을 거치지 않는 호출에 대한 방어선으로만 동작한다.
   */
  const addTodo = useCallback(
    (input: TodoInput): boolean => {
      const titleResult = validateTitle(input.title);
      if (!titleResult.ok) {
        setErrorMessage(titleResult.message);
        return false;
      }
      const dueDateResult = validateDueDate(input.dueDate ?? '');
      if (!dueDateResult.ok) {
        setErrorMessage(dueDateResult.message);
        return false;
      }

      const prev = todosRef.current;
      const now = new Date().toISOString();
      const todo: Todo = {
        id: crypto.randomUUID(),
        title: titleResult.value,
        completed: false,
        dueDate: dueDateResult.value,
        seq: Math.max(...prev.map((item) => item.seq), SEQ_BASE) + SEQ_STEP,
        createdAt: now,
        updatedAt: now,
      };
      return commit([...prev, todo]);
    },
    [commit]
  );

  /** id가 일치하는 항목 1건만 제거하고 저장한다. 나머지 항목의 필드는 재생성하지 않는다. */
  const removeTodo = useCallback(
    (id: string): void => {
      commit(todosRef.current.filter((todo) => todo.id !== id));
    },
    [commit]
  );

  /**
   * id 항목의 completed를 반전하고 즉시 저장한다.
   * 저장 실패 시 이전 배열로 상태를 되돌리고 errorMessage에 saveFailed를 세팅한다.
   */
  const toggleTodo = useCallback(
    (id: string): void => {
      const next = todosRef.current.map((todo) =>
        todo.id === id
          ? {
              ...todo,
              completed: !todo.completed,
              updatedAt: new Date().toISOString(),
            }
          : todo
      );
      commit(next);
    },
    [commit]
  );

  /** 등록 후 마감일 변경. 검증 실패 시 false와 함께 errorMessage 세팅. */
  const setDueDate = useCallback(
    (id: string, rawDueDate: string): boolean => {
      const dueDateResult = validateDueDate(rawDueDate);
      if (!dueDateResult.ok) {
        setErrorMessage(dueDateResult.message);
        return false;
      }
      const next = todosRef.current.map((todo) =>
        todo.id === id
          ? {
              ...todo,
              dueDate: dueDateResult.value,
              updatedAt: new Date().toISOString(),
            }
          : todo
      );
      return commit(next);
    },
    [commit]
  );

  const totalCount = todos.length;
  const completedCount = useMemo(
    () => todos.filter((todo) => todo.completed).length,
    [todos]
  );

  return {
    todos,
    isLoaded,
    errorMessage,
    totalCount,
    completedCount,
    addTodo,
    removeTodo,
    toggleTodo,
    setDueDate,
  };
}
