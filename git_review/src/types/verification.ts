/**
 * 검증 결과 도메인 타입 (TECH_SPEC §3.3)
 *
 * 리포트는 메모리 전용이다. 서버는 응답 후 어떤 형태로도 보관하지 않는다.
 */
import type { AppErrorCode } from '@/lib/errors';
import type { ArtifactKind } from '@/types/artifact';
import type { RateLimitInfo, RepoSummary } from '@/types/github';

export type ArtifactStatus = 'present' | 'missing';

/** 어떤 규칙으로 존재 판정되었는지 (정확도 검증 시 근거) */
export type MatchMethod =
  | 'exact-file' // blob 경로 완전 일치
  | 'exact-directory' // 해당 접두사로 시작하는 blob 1개 이상
  | 'case-insensitive-file' // 대소문자만 다른 blob 일치
  | 'case-insensitive-directory'
  | 'suffix-file' // 앞부분이 생략된 부분 경로가 저장소 파일 1개에만 대응
  | 'suffix-directory'
  | 'ambiguous-suffix' // 부분 경로에 대응하는 후보가 2개 이상이라 특정 불가
  | 'none';

/** 검증 결과 항목 1건 */
export interface VerificationItem {
  artifactId: string;
  path: string;
  kind: ArtifactKind;
  status: ArtifactStatus;
  matchedPath: string | null; // 실제 저장소에서 일치한 경로 (대소문자 차이 확인용)
  matchMethod: MatchMethod;
  htmlUrl: string | null; // status === 'present'일 때만 채워짐
  childFileCount: number; // 폴더 판정 시 하위 파일 수, 파일이면 0
  /**
   * matchMethod === 'ambiguous-suffix'일 때 대응 후보 경로 목록. 그 외에는 빈 배열.
   * "진짜 없는 파일"과 "여러 후보가 있어 특정 불가"를 화면에서 구분하기 위한 근거다.
   */
  candidatePaths: string[];
}

/** 준수율 및 판정 */
export interface ComplianceScore {
  total: number;
  present: number;
  missing: number;
  rate: number; // 0~100, 반올림 전 원값
  rateText: string; // 소수점 첫째 자리 고정 문자열, 예: "83.3"
  verdict: 'PASS' | 'FAIL';
  threshold: number; // 80 (화면에 기준값 안내용으로 함께 전달)
}

/** 검증 리포트 (메모리 전용, 저장하지 않음) */
export interface VerificationReport {
  repo: RepoSummary;
  ref: string;
  items: VerificationItem[];
  score: ComplianceScore;
  repoEmpty: boolean; // 저장소에 blob이 0개
  treeTruncated: boolean; // 트리가 잘려 결과가 불완전할 수 있음
  startedAt: string;
  finishedAt: string;
  rateLimit: RateLimitInfo | null;
}

/** /api/verify NDJSON 스트림 이벤트 */
export type VerifyEvent =
  | { type: 'phase'; phase: 'fetching-tree' | 'matching'; message: string }
  | { type: 'progress'; checked: number; total: number }
  | { type: 'item'; item: VerificationItem }
  | { type: 'done'; report: VerificationReport }
  | { type: 'error'; code: AppErrorCode; message: string; retryable: boolean };
