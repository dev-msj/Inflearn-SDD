'use client';

/**
 * 저장소 페이지네이션 · 검색 필터 · 선택 상태 유지 (TECH_SPEC §4 기능1 "검색 필터")
 *
 * 담당 PRD 수용 기준
 *  - 1-2: 최근 수정일 내림차순 정렬은 서버(listAccessibleRepos)가 보장하므로 응답 순서를 그대로 유지한다.
 *  - 1-3: 저장소명 부분 일치 필터, 선택 시 전역 상태에 저장
 *  - 1-5 (엣지): selectedRepo는 repos 배열이 아닌 전역 상태의 독립 필드이므로 추가 로드 후에도 유지된다.
 *
 * setQuery는 즉시 반영한다. 디바운스는 RepoSearchInput이 이미 수행하므로 중첩하지 않는다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { type AppError, toAppError } from '@/lib/errors';
import { useAppApi, useAppDispatch, useAppState } from '@/state/AppStateProvider';
import type { ReposResponse } from '@/types/api';
import type { RepoSummary } from '@/types/github';

export const REPOS_ENDPOINT = '/api/repos';

export interface UseRepoListResult {
  /** 누적 로드된 전체 */
  repos: RepoSummary[];
  /** query로 필터링된 결과 */
  visibleRepos: RepoSummary[];
  query: string;
  setQuery(next: string): void;
  loadMore(): Promise<void>;
  hasNext: boolean;
  isLoading: boolean;
  error: AppError | null;
  selectedRepo: RepoSummary | null;
  selectRepo(repo: RepoSummary): void;
  /** 실패한 페이지를 다시 요청한다. */
  retry(): Promise<void>;
}

/** 저장소명(name) 기준 대소문자 무시 부분 일치. fullName이 아닌 name만 대상으로 한다. */
export function filterReposByName(repos: RepoSummary[], query: string): RepoSummary[] {
  const keyword = query.trim().toLowerCase();
  if (keyword.length === 0) return repos;
  return repos.filter((repo) => repo.name.toLowerCase().includes(keyword));
}

export function useRepoList(): UseRepoListResult {
  const { authStatus, repos, reposPage, reposHasNext, repoQuery, selectedRepo } = useAppState();
  const dispatch = useAppDispatch();
  const api = useAppApi();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const inFlightRef = useRef(false);
  const initialLoadedRef = useRef(false);

  const loadPage = useCallback(
    async (page: number): Promise<void> => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const response = await api.requestJson<ReposResponse>(`${REPOS_ENDPOINT}?page=${page}`);
        dispatch({
          type: 'APPEND_REPOS',
          items: response.page.items,
          page: response.page.page,
          hasNext: response.page.hasNext,
        });
      } catch (caught) {
        setError(toAppError(caught));
      } finally {
        inFlightRef.current = false;
        setIsLoading(false);
      }
    },
    [api, dispatch],
  );

  // 로그인 직후 첫 페이지를 불러온다. 로그아웃하면 다시 처음부터 불러올 수 있도록 플래그를 되돌린다.
  useEffect(() => {
    if (authStatus !== 'authenticated') {
      initialLoadedRef.current = false;
      return;
    }
    if (initialLoadedRef.current) return;
    initialLoadedRef.current = true;
    void loadPage(1);
  }, [authStatus, loadPage]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (!reposHasNext) return;
    await loadPage(reposPage + 1);
  }, [loadPage, reposHasNext, reposPage]);

  const retry = useCallback(async (): Promise<void> => {
    await loadPage(reposPage > 0 ? reposPage : 1);
  }, [loadPage, reposPage]);

  const setQuery = useCallback(
    (next: string): void => {
      dispatch({ type: 'SET_REPO_QUERY', query: next });
    },
    [dispatch],
  );

  const selectRepo = useCallback(
    (repo: RepoSummary): void => {
      dispatch({ type: 'SELECT_REPO', repo });
    },
    [dispatch],
  );

  return {
    repos,
    visibleRepos: filterReposByName(repos, repoQuery),
    query: repoQuery,
    setQuery,
    loadMore,
    hasNext: reposHasNext,
    isLoading,
    error,
    selectedRepo,
    selectRepo,
    retry,
  };
}
