/**
 * 인증 사용자 프로필 조회 (TECH_SPEC §4 기능1)
 *
 * !! 서버 전용 모듈 !!
 * access token을 인자로 받는다. 반환 타입 GitHubUser에는 토큰이 포함되지 않는다.
 */
import 'server-only';

import { AppError } from '@/lib/errors';
import { createOctokit, withGitHubErrorHandling } from '@/lib/github/client';
import type { GitHubUser } from '@/types/github';

/** GET /user 응답 → GitHubUser 축약 매핑 (필요한 3개 필드만 사용) */
export function toGitHubUser(raw: unknown): GitHubUser {
  if (typeof raw !== 'object' || raw === null) {
    throw new AppError('GITHUB_UNAVAILABLE', { details: { reason: 'invalid-user-payload' } });
  }

  const source = raw as { login?: unknown; name?: unknown; avatar_url?: unknown };

  if (typeof source.login !== 'string' || typeof source.avatar_url !== 'string') {
    throw new AppError('GITHUB_UNAVAILABLE', { details: { reason: 'invalid-user-payload' } });
  }

  return {
    login: source.login,
    name: typeof source.name === 'string' ? source.name : null,
    avatarUrl: source.avatar_url,
  };
}

/** GET /user — 로그인한 사용자의 프로필을 조회한다. */
export async function fetchAuthenticatedUser(accessToken: string): Promise<GitHubUser> {
  const octokit = createOctokit(accessToken);

  return withGitHubErrorHandling(async () => {
    const response = await octokit.rest.users.getAuthenticated();
    return toGitHubUser(response.data);
  });
}
