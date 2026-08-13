import { Dashboard } from '@/components/Dashboard';
import { DashboardProvider } from '@/components/DashboardProvider';
import { LoginScreen, type LoginErrorCode } from '@/components/LoginScreen';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * 합성 루트 (서버 컴포넌트, TECH_SPEC 3. 기능 3 > 3-E).
 *
 * - 세션이 없으면 `LoginScreen` 만 렌더한다. 활동·분석·생성 영역은 트리에 포함하지 않는다 (AC-1.1).
 * - OAuth 콜백이 붙인 `?error=` 를 `LoginScreen` 에 전달한다 (AC-1.3).
 * - 로그아웃 후 다시 접근하면 세션이 없으므로 자동으로 로그인 화면으로 돌아온다 (AC-1.9).
 */

const LOGIN_ERROR_CODES: readonly LoginErrorCode[] = ['oauth_denied', 'oauth_failed', 'forbidden'];

/** 알 수 없는 `?error` 값은 무시한다 */
function parseLoginError(value: string | string[] | undefined): LoginErrorCode | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return LOGIN_ERROR_CODES.find((code) => code === raw);
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const user = await getSessionUser();
  const { error } = await searchParams;

  if (user === null) {
    return <LoginScreen errorCode={parseLoginError(error)} />;
  }

  return (
    <DashboardProvider user={user}>
      <Dashboard />
    </DashboardProvider>
  );
}
