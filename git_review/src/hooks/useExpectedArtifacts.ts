'use client';

/**
 * 기대 산출물 추출 실행 · 항목 추가/삭제 · 총 항목 수 파생 (TECH_SPEC §4 기능2-4)
 *
 * 담당 PRD 수용 기준
 *  - 2-2: extractArtifacts()의 결과(출처 포함)를 그대로 상태에 반영한다.
 *  - 2-3: 추가/삭제가 artifacts 배열을 갱신하고 totalCount는 파생값이므로 즉시 반영된다.
 *  - 2-5 (엣지): 추출 0건이어도 addManualArtifact()로 검증을 계속 진행할 수 있다.
 *
 * 추출은 브라우저에서 실행된다. 문서 내용은 서버로 전송되지 않는다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { extractArtifacts } from '@/lib/extract/extractArtifacts';
import { normalizePath } from '@/lib/extract/normalizePath';
import { rejectionReason } from '@/lib/extract/pathHeuristics';
import { useAppDispatch, useAppState } from '@/state/AppStateProvider';
import type { ExtractStats } from '@/state/appReducer';
import type { ExpectedArtifact, RejectReason, UploadedDocument } from '@/types/artifact';

/** ArtifactAddForm의 ArtifactAddResult와 동일한 형태 */
export type AddArtifactResult = { ok: true } | { ok: false; message: string };

export interface UseExpectedArtifactsResult {
  artifacts: ExpectedArtifact[];
  /** artifacts.length 파생값 */
  totalCount: number;
  isExtracting: boolean;
  extractStats: ExtractStats | null;
  runExtraction(documents: UploadedDocument[]): void;
  addManualArtifact(rawPath: string): AddArtifactResult;
  removeArtifact(artifactId: string): void;
}

/** 거부 사유별 사용자 안내 문구 (수동 입력 실패 시 그대로 노출) */
const REJECT_MESSAGES: Record<RejectReason, string> = {
  'contains-whitespace': '공백이 포함된 경로는 지원하지 않습니다',
  'is-url': '외부 링크는 산출물 경로로 추가할 수 없습니다',
  'code-syntax': '경로에 사용할 수 없는 문자가 포함되어 있습니다',
  'shell-command': '명령어는 산출물 경로로 추가할 수 없습니다',
  'version-string': '버전 표기는 산출물 경로로 추가할 수 없습니다',
  'single-segment-no-extension': '확장자가 없는 단일 이름은 추가할 수 없습니다. 폴더는 끝에 /를 붙여 주세요',
  'unknown-extension': '지원하지 않는 확장자입니다',
  'glob-pattern': '와일드카드(*, ?)가 포함된 경로는 지원하지 않습니다',
  'too-long': '경로가 너무 깁니다',
  placeholder: '자리표시자는 산출물 경로로 추가할 수 없습니다',
  'package-name': '패키지명은 저장소 파일이 아니라서 추가할 수 없습니다',
  'mime-type': 'MIME 타입은 저장소 파일이 아니라서 추가할 수 없습니다',
  'example-placeholder': '설명용 예시 경로(a/b 등)는 추가할 수 없습니다',
  'url-path': 'API 경로 표기입니다. 저장소 기준 경로는 앞의 /를 빼고 입력해 주세요',
};

const INVALID_PATH_MESSAGE = '경로 형식을 확인해 주세요';
const DUPLICATED_PATH_MESSAGE = '이미 목록에 있는 경로입니다';

/** 산출물 식별자 생성. crypto.randomUUID가 없는 환경을 위한 대체 경로를 포함한다. */
function createArtifactId(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  return `artifact-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useExpectedArtifacts(): UseExpectedArtifactsResult {
  const { artifacts, extractStats } = useAppState();
  const dispatch = useAppDispatch();

  const [isExtracting, setIsExtracting] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const runExtraction = useCallback(
    (documents: UploadedDocument[]): void => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      setIsExtracting(true);

      // 추출은 동기 함수다. 진행 안내가 한 프레임이라도 보이도록 다음 태스크에서 실행한다.
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        const result = extractArtifacts(documents);
        dispatch({
          type: 'SET_EXTRACTED_ARTIFACTS',
          artifacts: result.artifacts,
          stats: result.stats,
        });
        setIsExtracting(false);
      }, 0);
    },
    [dispatch],
  );

  const addManualArtifact = useCallback(
    (rawPath: string): AddArtifactResult => {
      const normalized = normalizePath(rawPath);
      if (normalized === null) {
        return { ok: false, message: INVALID_PATH_MESSAGE };
      }

      const reason = rejectionReason(normalized.path);
      if (reason !== null) {
        return { ok: false, message: REJECT_MESSAGES[reason] };
      }

      if (artifacts.some((artifact) => artifact.path === normalized.path)) {
        return { ok: false, message: DUPLICATED_PATH_MESSAGE };
      }

      dispatch({
        type: 'ADD_ARTIFACT',
        artifact: {
          id: createArtifactId(),
          path: normalized.path,
          kind: normalized.kind,
          sources: [],
          origin: 'manual',
        },
      });

      return { ok: true };
    },
    [artifacts, dispatch],
  );

  const removeArtifact = useCallback(
    (artifactId: string): void => {
      dispatch({ type: 'REMOVE_ARTIFACT', artifactId });
    },
    [dispatch],
  );

  return {
    artifacts,
    totalCount: artifacts.length,
    isExtracting,
    extractStats,
    runExtraction,
    addManualArtifact,
    removeArtifact,
  };
}
