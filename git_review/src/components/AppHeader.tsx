'use client';

/**
 * AppHeader — 로그인 계정명·프로필 이미지·로그아웃 버튼
 *
 * 담당 PRD 수용 기준
 *  - 1-1: 인증을 마치면 로그인한 계정명과 프로필 이미지가 화면 상단에 표시된다.
 *  - 1-7 (에러): 로그아웃 버튼이 전체 초기화(RESET_ALL)의 진입점이 된다.
 *  - 접근성 1항: 로그아웃까지 키보드만으로 수행 가능 (네이티브 button 사용)
 *
 * 토큰 등 인증 정보 원문은 어떤 경우에도 렌더하지 않는다. (PRD 보안 4항)
 */
import Image from 'next/image';
import { LoaderCircle, LogOut } from 'lucide-react';

import type { GitHubUser } from '@/types/github';

export interface AppHeaderProps {
  /** 로그인한 사용자. 미인증 상태이면 null */
  user: GitHubUser | null;
  /** 로그아웃 처리. 지정하지 않으면 로그아웃 버튼을 노출하지 않는다. */
  onLogout?: () => void;
  isLoggingOut?: boolean;
}

const APP_TITLE = 'git_review';
const APP_SUBTITLE = 'SDD 스펙 문서 대비 저장소 산출물 검증';
const AVATAR_SIZE = 32;

export function AppHeader({ user, onLogout, isLoggingOut = false }: AppHeaderProps) {
  return (
    <header className="w-full border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
        <div className="min-w-0">
          <p className="text-lg font-bold text-ink">{APP_TITLE}</p>
          <p className="text-sm text-ink-muted">{APP_SUBTITLE}</p>
        </div>

        {user ? (
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Image
                src={user.avatarUrl}
                alt={`${user.login}의 GitHub 프로필 이미지`}
                width={AVATAR_SIZE}
                height={AVATAR_SIZE}
                className="rounded-full border border-line"
              />
              <span className="min-w-0 truncate text-sm font-semibold text-ink">
                {user.login}
                {user.name ? <span className="ml-1 font-normal text-ink-muted">({user.name})</span> : null}
              </span>
            </div>

            {onLogout ? (
              <button
                type="button"
                onClick={onLogout}
                disabled={isLoggingOut}
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoggingOut ? (
                  <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                ) : (
                  <LogOut size={16} aria-hidden="true" />
                )}
                {isLoggingOut ? '로그아웃 중' : '로그아웃'}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
