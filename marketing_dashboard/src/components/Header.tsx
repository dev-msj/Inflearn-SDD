'use client';

import { useState } from 'react';
import { useDashboard } from '@/components/DashboardProvider';
import { Button } from '@/components/ui/Button';

/**
 * 로그인 사용자 표시 + 초기화 · 로그아웃 (AC-1.2, AC-1.9, AC-3.9).
 *
 * - "초기화": 화면 상태와 로컬 스냅샷을 함께 비운다 (`resetAll`).
 * - "로그아웃": 세션 파기 응답을 받은 뒤 `resetAll` 로 정리하고 전체 페이지 이동으로
 *   클라이언트에 남은 활동·분석·콘텐츠 상태까지 폐기한다.
 *   `clearSnapshot()` 을 직접 부르지 않는 이유는 대기 중인 디바운스 저장 타이머가
 *   삭제 직후 스냅샷을 되살릴 수 있기 때문이다 — `resetAll` 은 타이머를 먼저 취소한다 (M-2).
 */
export function Header() {
  const { user, resetAll } = useDashboard();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' });
    } catch {
      // 네트워크 실패라도 로컬 흔적은 지우고 로그인 화면으로 보낸다
    } finally {
      // 디바운스 타이머 취소 → 스냅샷 삭제 → 상태 초기화 (AC-1.9, AC-3.9)
      resetAll();
      window.location.assign('/');
    }
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border-subtle bg-surface px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        {/* next/image 는 원격 도메인 설정이 필요해 아바타는 <img> 로 렌더한다 (TECH_SPEC 1-C) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={user.avatarUrl}
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 shrink-0 rounded-full border border-border-subtle bg-surface-muted"
        />
        <div className="min-w-0">
          {user.name !== null ? (
            <p className="truncate text-sm font-medium text-ink">{user.name}</p>
          ) : null}
          <p className="truncate text-sm text-ink-muted">@{user.login}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={resetAll} disabled={loggingOut}>
          초기화
        </Button>
        <Button variant="ghost" size="sm" onClick={handleLogout} loading={loggingOut}>
          로그아웃
        </Button>
      </div>
    </header>
  );
}

export default Header;
