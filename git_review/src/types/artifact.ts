/**
 * 업로드 문서 / 기대 산출물 도메인 타입 (TECH_SPEC §3.2)
 *
 * 여기 정의된 데이터는 전부 브라우저 메모리에만 존재한다.
 * localStorage / sessionStorage / indexedDB / 서버 전송 어디에도 기록하지 않는다.
 * (PRD 보안 요구 2항: 업로드한 스펙 문서 내용과 검증 결과는 영구 저장되지 않는다)
 */

/** 산출물이 파일인지 폴더인지. 판정 불가 시 'unknown' */
export type ArtifactKind = 'file' | 'directory' | 'unknown';

/** 어떤 추출 규칙으로 뽑혔는지 (출처 표시 및 정확도 튜닝에 사용) */
export type ExtractionRule =
  | 'tree-block' // 코드블록 내 디렉터리 트리
  | 'code-block-path' // 코드블록 내 단독 경로 라인
  | 'inline-code' // 백틱 인라인 코드
  | 'table-cell' // GFM 표 셀
  | 'list-label' // "**파일**: `경로`" 형태의 목록 항목
  | 'manual'; // 사용자가 직접 추가

/** 업로드된 스펙 문서. 메모리에만 존재하며 어디에도 저장되지 않는다. */
export interface UploadedDocument {
  id: string; // crypto.randomUUID()
  fileName: string; // 예: "TECH_SPEC.md"
  sizeBytes: number;
  content: string; // 원문 (파싱 후에도 재추출을 위해 메모리 유지)
  uploadedAt: string; // ISO8601
}

/** 기대 산출물 1건이 어느 문서 어느 줄에서 나왔는지 */
export interface ArtifactSource {
  documentId: string;
  documentName: string;
  line: number; // 1-base 줄 번호 (mdast position 기준)
  rule: ExtractionRule;
  snippet: string; // 근거 원문 최대 120자
}

/** 문서에서 추출(또는 수동 입력)된 기대 산출물 */
export interface ExpectedArtifact {
  id: string;
  path: string; // 정규화된 저장소 루트 기준 경로 (선행/후행 슬래시 없음)
  kind: ArtifactKind;
  sources: ArtifactSource[]; // 병합 시 2건 이상이 될 수 있음
  origin: 'extracted' | 'manual';
}

/** 추출 과정에서 걸러진 후보 (디버깅/정확도 튜닝용, 화면 비노출) */
export interface RejectedCandidate {
  rawText: string;
  reason: RejectReason;
  line: number;
}

export type RejectReason =
  | 'contains-whitespace'
  | 'is-url'
  | 'code-syntax'
  | 'shell-command'
  | 'version-string'
  | 'single-segment-no-extension'
  | 'unknown-extension'
  | 'glob-pattern'
  | 'too-long'
  | 'placeholder';

/** 추출 파이프라인 결과 */
export interface ExtractResult {
  artifacts: ExpectedArtifact[];
  rejected: RejectedCandidate[];
  stats: {
    documentCount: number;
    candidateCount: number; // 규칙에 걸린 원시 후보 수
    mergedCount: number; // 병합으로 줄어든 건수
    elapsedMs: number;
  };
}
