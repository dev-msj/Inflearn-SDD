'use client';

import {
  LOCAL_STORE_KEY,
  MAX_SNAPSHOT_BYTES,
  SNAPSHOT_COMMIT_FALLBACK_LIMIT,
} from '@/lib/constants';
import { LOCAL_SNAPSHOT_VERSION, localSnapshotSchema, type LocalSnapshot } from '@/types/api';
import type { ActivitySummary, AnalysisResult, ContentDraft, PeriodDays } from '@/types/domain';

/**
 * localStorage 스냅샷 1개 저장·복원·삭제 (Q5, AC-3.9).
 *
 * - 고정 단일 키. 새 스냅샷은 항상 덮어쓴다(히스토리 없음).
 * - `version`/`login` 불일치·JSON 파싱 실패 → 조용히 삭제하고 빈 상태로 시작한다.
 * - 직렬화 결과가 512KB 를 넘으면 커밋을 100건으로 잘라 재시도하고, 그래도 넘으면 저장을 건너뛴다.
 */

export interface SnapshotInput {
  login: string;
  periodDays: PeriodDays;
  activity: ActivitySummary | null;
  analysis: AnalysisResult | null;
  drafts: ContentDraft[];
}

/** SSR·비브라우저 환경에서 안전하게 localStorage 를 얻는다 */
function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // 브라우저 설정으로 스토리지 접근이 차단된 경우
    return null;
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function withTruncatedCommits(snapshot: LocalSnapshot): LocalSnapshot {
  if (snapshot.activity === null) return snapshot;
  return {
    ...snapshot,
    activity: {
      ...snapshot.activity,
      commits: snapshot.activity.commits.slice(0, SNAPSHOT_COMMIT_FALLBACK_LIMIT),
    },
  };
}

/** 스냅샷 저장. 용량 초과·스토리지 오류 시 화면 흐름은 유지하고 경고만 남긴다 */
export function saveSnapshot(input: SnapshotInput): void {
  const storage = getStorage();
  if (storage === null) return;

  const snapshot: LocalSnapshot = {
    version: LOCAL_SNAPSHOT_VERSION,
    savedAt: new Date().toISOString(),
    login: input.login,
    periodDays: input.periodDays,
    activity: input.activity,
    analysis: input.analysis,
    drafts: input.drafts,
  };

  let serialized = JSON.stringify(snapshot);

  if (byteLength(serialized) > MAX_SNAPSHOT_BYTES) {
    serialized = JSON.stringify(withTruncatedCommits(snapshot));

    if (byteLength(serialized) > MAX_SNAPSHOT_BYTES) {
      console.warn('[local-store] 스냅샷이 용량 상한을 초과해 저장을 건너뜁니다.');
      return;
    }
  }

  try {
    storage.setItem(LOCAL_STORE_KEY, serialized);
  } catch (e) {
    console.warn('[local-store] 스냅샷 저장에 실패했습니다:', e instanceof Error ? e.message : e);
  }
}

/** 로그인 ID 가 일치하는 스냅샷만 복원. 그 외에는 삭제 후 null */
export function loadSnapshot(login: string): LocalSnapshot | null {
  const storage = getStorage();
  if (storage === null) return null;

  const raw = storage.getItem(LOCAL_STORE_KEY);
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearSnapshot();
    return null;
  }

  const result = localSnapshotSchema.safeParse(parsed);
  if (!result.success || result.data.login !== login) {
    clearSnapshot();
    return null;
  }

  return result.data;
}

/** 스냅샷 삭제 — "초기화"·로그아웃 시 호출 (AC-1.9, AC-3.9) */
export function clearSnapshot(): void {
  const storage = getStorage();
  if (storage === null) return;

  try {
    storage.removeItem(LOCAL_STORE_KEY);
  } catch (e) {
    console.warn('[local-store] 스냅샷 삭제에 실패했습니다:', e instanceof Error ? e.message : e);
  }
}
