import 'server-only';

/**
 * 프롬프트 미리보기(마스킹) 생성 (F1-AC5, F1-AC6).
 *
 * ★`import 'server-only'`가 이 파일의 핵심 방어선이다.
 *   클라이언트 컴포넌트가 이 모듈을 import 하면 빌드가 실패하므로,
 *   "전문을 받아서 앞부분만 자르는" 로직 자체가 브라우저로 넘어갈 수 없다.
 *   마스킹은 CSS blur나 클라이언트 자르기가 아니라 **저장 시점에 계산해 DB에 넣은 preview_text**로만
 *   이루어지며, 원문(body)은 서버 밖으로 나가지 않는다.
 *
 * ※ 이 모듈은 전문을 인자로 받지만 어떤 로그·예외 메시지에도 body를 포함하지 않는다.
 */

/** PRD "앞부분 최대 30%" 상한. 값을 키우면 유출 범위가 커지므로 상수로 고정한다. */
export const PREVIEW_RATIO = 0.3;

export interface PreviewResult {
  previewText: string;
  previewCharCount: number;
  maskedCharCount: number;
}

/**
 * 상한 이내에서 문장이 잘리는 지점을 뒤로 스냅하기 위한 경계 문자.
 * 줄바꿈을 우선 찾고, 없으면 공백을 찾는다(TECH_SPEC 6장 buildPreview 규칙).
 */
const BOUNDARY_NEWLINE = '\n';
const BOUNDARY_SPACE = ' ';

/**
 * 프롬프트 전문의 앞부분 최대 `ratio`(기본 30%)만 남긴 미리보기를 생성한다.
 *
 * 규칙 (TECH_SPEC 11장 N10 확정: "최대 30%"는 초과 불가로 해석)
 *  - 상한: `floor(body.length * ratio)`. 어떤 경우에도 이 길이를 넘지 않는다.
 *  - 문장 중간 절단을 피하기 위해 상한 이내의 마지막 줄바꿈 → 마지막 공백 순으로 **뒤로** 스냅한다.
 *    앞으로 스냅(=상한 초과)은 하지 않는다. 30%를 넘기면 유출량이 늘어나기 때문이다.
 *  - 경계 문자가 하나도 없으면(공백 없는 긴 문자열) 상한에서 그대로 자른다.
 *
 * @param body 프롬프트 전문. 호출자는 이 값을 응답·로그로 흘리지 않아야 한다.
 */
export function buildPreview(body: string, ratio: number = PREVIEW_RATIO): PreviewResult {
  const source = typeof body === 'string' ? body : '';
  const totalCharCount = source.length;

  // ratio를 [0, 1]로 강제한다. 잘못된 값이 들어와도 전문이 그대로 노출되지 않게 하기 위함이다.
  const safeRatio = Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : PREVIEW_RATIO;
  const limit = Math.floor(totalCharCount * safeRatio);

  if (limit <= 0) {
    return { previewText: '', previewCharCount: 0, maskedCharCount: totalCharCount };
  }

  const head = source.slice(0, limit);

  // 상한 이내의 마지막 경계에서 자른다. 경계를 못 찾으면(-1 또는 0) 상한 그대로 사용한다.
  let cutIndex = head.lastIndexOf(BOUNDARY_NEWLINE);
  if (cutIndex <= 0) cutIndex = head.lastIndexOf(BOUNDARY_SPACE);
  if (cutIndex <= 0) cutIndex = head.length;

  // trimEnd는 길이를 줄이기만 하므로 상한을 넘길 위험이 없다.
  const previewText = head.slice(0, cutIndex).trimEnd();
  const previewCharCount = previewText.length;

  return {
    previewText,
    previewCharCount,
    maskedCharCount: totalCharCount - previewCharCount,
  };
}
