/**
 * 동일 경로 병합, 출처 누적, 종류(kind) 충돌 해소 (TECH_SPEC §4 기능2 "병합")
 *
 * 병합 키 = 정규화된 path (대소문자 구분. GitHub 경로가 대소문자를 구분하기 때문)
 */
import type {
  ArtifactKind,
  ArtifactSource,
  ExpectedArtifact,
  ExtractionRule,
} from '@/types/artifact';
import type { RawCandidate } from '@/lib/extract/extractArtifacts';

/**
 * 병합 입력 후보. RawCandidate에 출처 문서 정보를 더한 형태다.
 * (RawCandidate 자체는 문서 정보를 갖지 않으므로 병합 단계에서 주입한다)
 */
export interface MergeCandidate extends RawCandidate {
  documentId: string;
  documentName: string;
}

/** 규칙 우선순위. 숫자가 작을수록 신뢰도가 높다. */
const RULE_PRIORITY: Record<ExtractionRule, number> = {
  'tree-block': 0,
  'code-block-path': 1,
  'inline-code': 2,
  'table-cell': 3,
  'list-label': 4,
  manual: 5,
};

/**
 * 동순위 규칙일 때의 kind 우선순위.
 * 폴더 판정이 하위 파일 존재까지 포괄해 오탐 위험이 낮으므로 directory를 우선한다.
 */
const KIND_PRIORITY: Record<ArtifactKind, number> = {
  directory: 0,
  file: 1,
  unknown: 2,
};

/** 산출물 식별자 생성. 브라우저·Node 양쪽에서 동작한다. */
function createArtifactId(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  return `artifact-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 후보 정렬 기준: 규칙 우선순위 → kind 우선순위 */
function compareCandidates(a: RawCandidate, b: RawCandidate): number {
  const byRule = RULE_PRIORITY[a.rule] - RULE_PRIORITY[b.rule];
  if (byRule !== 0) return byRule;
  return KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
}

/** 출처 정렬 기준: 문서명 → 줄 번호 오름차순 */
function compareSources(a: ArtifactSource, b: ArtifactSource): number {
  if (a.documentName !== b.documentName) {
    return a.documentName < b.documentName ? -1 : 1;
  }
  return a.line - b.line;
}

/**
 * 같은 문서의 같은 줄에서 나온 출처를 하나로 줄인다.
 * 여러 규칙이 같은 줄을 잡은 경우 우선순위가 높은 규칙의 출처만 남긴다.
 */
function dedupeSources(sources: ArtifactSource[]): ArtifactSource[] {
  const bestByPosition = new Map<string, ArtifactSource>();
  for (const source of sources) {
    const key = `${source.documentId}#${source.line}`;
    const current = bestByPosition.get(key);
    if (current === undefined || RULE_PRIORITY[source.rule] < RULE_PRIORITY[current.rule]) {
      bestByPosition.set(key, source);
    }
  }
  return [...bestByPosition.values()].sort(compareSources);
}

/**
 * 동일 경로 후보를 ExpectedArtifact 1건으로 합친다.
 * - sources를 모두 누적한다 (두 문서에서 같은 경로가 나오면 출처 2건).
 * - kind 충돌은 규칙 우선순위 → kind 우선순위 순으로 해소한다.
 * - 결과는 path 사전순 오름차순으로 정렬한다.
 */
export function mergeArtifacts(candidates: MergeCandidate[]): ExpectedArtifact[] {
  const grouped = new Map<string, MergeCandidate[]>();

  for (const candidate of candidates) {
    const bucket = grouped.get(candidate.path);
    if (bucket === undefined) {
      grouped.set(candidate.path, [candidate]);
    } else {
      bucket.push(candidate);
    }
  }

  const artifacts: ExpectedArtifact[] = [];

  for (const [path, bucket] of grouped) {
    const winner = [...bucket].sort(compareCandidates)[0];
    const sources = dedupeSources(
      bucket.map((candidate) => ({
        documentId: candidate.documentId,
        documentName: candidate.documentName,
        line: candidate.line,
        rule: candidate.rule,
        snippet: candidate.snippet,
      })),
    );

    artifacts.push({
      id: createArtifactId(),
      path,
      kind: winner.kind,
      sources,
      origin: 'extracted',
    });
  }

  artifacts.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return artifacts;
}
