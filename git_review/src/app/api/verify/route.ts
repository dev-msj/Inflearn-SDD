/**
 * POST /api/verify — 산출물 존재 검증 (NDJSON 스트림) (TECH_SPEC §4 기능3-6, §5)
 *
 * 처리 순서 (GitHub 요청은 fetchRepoTree 1회뿐이다)
 *   1) phase: 'fetching-tree' → fetchRepoTree (지연 대부분이 여기서 발생)
 *   2) phase: 'matching'      → buildTreeIndex
 *   3) VERIFY_CHUNK_SIZE개씩 matchArtifact → item·progress 이벤트 교대 전송
 *   4) done: calculateCompliance 결과를 담은 VerificationReport 전체
 *
 * 담당 PRD 수용 기준
 *  - 3-4: progress 이벤트로 "확인 완료 n / 전체 N" 갱신. 트리 1회 조회 + 인메모리 매칭이라 50개 15초 목표에 여유가 있다.
 *  - 3-6 (엣지): fileCount === 0이면 repoEmpty로 표시하고 전 항목 missing → 0.0% / FAIL
 *  - 3-7 (에러): 실패는 error 이벤트로만 전달한다. 리포트를 부분 생성해 내려보내지 않으므로
 *    클라이언트의 직전 결과가 부정확한 값으로 덮이지 않는다.
 *
 * 요청 본문에는 경로 문자열만 담긴다. 업로드 문서 원문은 서버로 오지 않는다.
 * 응답은 Cache-Control: no-store로 어디에도 캐시되지 않는다. (NDJSON_RESPONSE_HEADERS)
 */
import { NextResponse } from 'next/server';

import { AppError, toAppError } from '@/lib/errors';
import { fetchRepoTree } from '@/lib/github/tree';
import { NDJSON_RESPONSE_HEADERS, createNdjsonEncoder } from '@/lib/ndjson';
import { requireSession } from '@/lib/session';
import { buildTreeIndex } from '@/lib/verify/buildTreeIndex';
import { calculateCompliance } from '@/lib/verify/compliance';
import { matchArtifact } from '@/lib/verify/matchArtifact';
import type { ApiErrorBody, VerifyRequest, VerifyRequestArtifact } from '@/types/api';
import type { ArtifactKind, ExpectedArtifact } from '@/types/artifact';
import type { RepoSummary } from '@/types/github';
import type { VerificationItem, VerificationReport, VerifyEvent } from '@/types/verification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 진행률 갱신 단위 (TECH_SPEC §3-6 VERIFY_CHUNK_SIZE = 10).
 * Route Handler는 HTTP 메서드와 세그먼트 설정 외의 export를 허용하지 않으므로 모듈 내부 상수로 둔다.
 */
const VERIFY_CHUNK_SIZE = 10;

/** 요청 검증 규칙 (TECH_SPEC §5 "요청 검증 규칙") */
const MAX_ARTIFACTS_PER_REQUEST = 500;
const MAX_ARTIFACT_PATH_LENGTH = 200;
const REPO_NAME_RE = /^[A-Za-z0-9._-]+$/;

const ARTIFACT_KINDS: ReadonlySet<string> = new Set<ArtifactKind>(['file', 'directory', 'unknown']);

const PHASE_MESSAGES = {
  fetchingTree: '저장소 파일 목록을 불러오는 중입니다',
  matching: '기대 산출물과 저장소를 대조하는 중입니다',
} as const;

interface ValidatedRequest {
  repo: RepoSummary;
  ref: string;
  artifacts: ExpectedArtifact[];
}

/**
 * 요청 본문 검증 및 정규화.
 * - repo.owner/name 형식 위반, 항목 수 위반 → INVALID_REQUEST
 * - 개별 경로 규칙 위반(200자 초과, '..' 포함, 선행 '/') → 해당 항목만 제외하고 진행
 */
function validateRequest(raw: unknown): ValidatedRequest {
  if (typeof raw !== 'object' || raw === null) {
    throw new AppError('INVALID_REQUEST');
  }

  const body = raw as Partial<VerifyRequest>;
  const repo = body.repo;

  if (
    typeof repo !== 'object' ||
    repo === null ||
    typeof repo.owner !== 'string' ||
    typeof repo.name !== 'string' ||
    typeof repo.defaultBranch !== 'string' ||
    !REPO_NAME_RE.test(repo.owner) ||
    !REPO_NAME_RE.test(repo.name) ||
    repo.defaultBranch.length === 0
  ) {
    throw new AppError('INVALID_REQUEST');
  }

  const rawArtifacts = body.artifacts;
  if (!Array.isArray(rawArtifacts) || rawArtifacts.length < 1 || rawArtifacts.length > MAX_ARTIFACTS_PER_REQUEST) {
    throw new AppError('INVALID_REQUEST');
  }

  const artifacts: ExpectedArtifact[] = [];
  for (const candidate of rawArtifacts as VerifyRequestArtifact[]) {
    if (typeof candidate !== 'object' || candidate === null) continue;
    if (typeof candidate.id !== 'string' || candidate.id.length === 0) continue;
    if (typeof candidate.path !== 'string') continue;
    if (candidate.path.length === 0 || candidate.path.length > MAX_ARTIFACT_PATH_LENGTH) continue;
    if (candidate.path.includes('..') || candidate.path.startsWith('/')) continue;
    if (!ARTIFACT_KINDS.has(candidate.kind)) continue;

    // matchArtifact는 id/path/kind만 사용한다. 출처 정보는 서버로 전송되지 않는다.
    artifacts.push({
      id: candidate.id,
      path: candidate.path,
      kind: candidate.kind,
      sources: [],
      origin: 'extracted',
    });
  }

  if (artifacts.length === 0) {
    throw new AppError('INVALID_REQUEST');
  }

  return {
    // 요청 본문은 저장소 식별 정보만 담는다. 링크 생성에 필요한 나머지 필드는 여기서 복원한다.
    repo: {
      id: 0,
      owner: repo.owner,
      name: repo.name,
      fullName: `${repo.owner}/${repo.name}`,
      defaultBranch: repo.defaultBranch,
      isPrivate: false,
      htmlUrl: `https://github.com/${repo.owner}/${repo.name}`,
      pushedAt: new Date(0).toISOString(),
    },
    ref: repo.defaultBranch,
    artifacts,
  };
}

function errorResponse(error: unknown): NextResponse<ApiErrorBody> {
  const appError = toAppError(error);
  return NextResponse.json<ApiErrorBody>(appError.toBody(), {
    status: appError.httpStatus,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request): Promise<Response> {
  let accessToken: string;
  let validated: ValidatedRequest;

  // 스트림을 열기 전 단계의 실패는 일반 JSON 오류로 응답한다.
  try {
    const session = await requireSession();
    accessToken = session.accessToken;
    validated = validateRequest(await request.json().catch(() => null));
  } catch (error) {
    return errorResponse(error);
  }

  const { repo, ref, artifacts } = validated;
  const startedAt = new Date().toISOString();
  const encoder = createNdjsonEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let isClosed = false;

      const send = (event: VerifyEvent): void => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(event));
        } catch {
          // 클라이언트가 연결을 끊은 경우. 이후 전송을 중단한다.
          isClosed = true;
        }
      };

      try {
        send({ type: 'phase', phase: 'fetching-tree', message: PHASE_MESSAGES.fetchingTree });

        const { tree, rateLimit } = await fetchRepoTree(accessToken, {
          owner: repo.owner,
          repo: repo.name,
          ref,
        });

        send({ type: 'phase', phase: 'matching', message: PHASE_MESSAGES.matching });

        const index = buildTreeIndex(tree.entries);
        const items: VerificationItem[] = [];

        for (let offset = 0; offset < artifacts.length; offset += VERIFY_CHUNK_SIZE) {
          if (request.signal.aborted || isClosed) break;

          for (const artifact of artifacts.slice(offset, offset + VERIFY_CHUNK_SIZE)) {
            const item = matchArtifact(artifact, index, { repo, ref });
            items.push(item);
            send({ type: 'item', item });
          }

          send({ type: 'progress', checked: items.length, total: artifacts.length });
        }

        const report: VerificationReport = {
          repo,
          ref,
          items,
          score: calculateCompliance(items),
          repoEmpty: tree.fileCount === 0,
          treeTruncated: tree.truncated,
          startedAt,
          finishedAt: new Date().toISOString(),
          rateLimit,
        };

        send({ type: 'done', report });
      } catch (error) {
        const appError = toAppError(error);
        send({
          type: 'error',
          code: appError.code,
          message: appError.userMessage,
          retryable: appError.retryable,
        });
      } finally {
        if (!isClosed) {
          isClosed = true;
          try {
            controller.close();
          } catch {
            // 이미 닫힌 스트림이면 무시한다.
          }
        }
      }
    },
  });

  return new Response(stream, { status: 200, headers: NDJSON_RESPONSE_HEADERS });
}
