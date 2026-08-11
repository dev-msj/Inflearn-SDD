import { describe, expect, it } from 'vitest';

import { PREVIEW_RATIO, buildPreview } from '@/server/templates/preview';

/**
 * 미리보기 마스킹 단위 테스트 (F1-AC5, F1-AC6).
 *
 * 검증 목표
 *  - previewText는 어떤 입력에서도 `floor(body.length * ratio)` 상한을 넘지 않는다(30% 초과 금지).
 *  - 문장 중간 절단을 피하기 위한 스냅은 **뒤로만** 일어난다(앞으로 스냅 = 상한 초과이므로 금지).
 *  - 마스킹 구간(뒤 70%)의 원문은 결과 어디에도 남지 않는다.
 *  - previewCharCount + maskedCharCount 는 항상 전문 길이와 같다(UI 표시 값의 무결성).
 */

/** 상한: TECH_SPEC 11장 N10 확정 규칙. */
function limitOf(body: string, ratio: number = PREVIEW_RATIO): number {
  return Math.floor(body.length * ratio);
}

/** 공백·줄바꿈이 고르게 섞인 본문을 만든다. 경계 스냅 경로를 타게 하기 위함이다. */
function makeBody(length: number): string {
  const chunk = 'prompt line with words\n';
  return chunk.repeat(Math.ceil(length / chunk.length)).slice(0, length);
}

describe('buildPreview 상한 (F1-AC5)', () => {
  it('PREVIEW_RATIO는 PRD가 정한 30%로 고정된다', () => {
    expect(PREVIEW_RATIO).toBe(0.3);
  });

  it('길이 1000 전문의 미리보기는 300자를 넘지 않는다', () => {
    const body = makeBody(1000);

    const result = buildPreview(body);

    expect(result.previewCharCount).toBeLessThanOrEqual(300);
    expect(result.previewText.length).toBe(result.previewCharCount);
  });

  it('길이 1~2000의 모든 입력에서 상한을 초과하지 않는다', () => {
    for (let length = 1; length <= 2000; length += 7) {
      const body = makeBody(length);

      const result = buildPreview(body);

      expect(result.previewText.length).toBeLessThanOrEqual(limitOf(body));
    }
  });

  it('공백·줄바꿈이 전혀 없는 전문은 상한에서 그대로 잘린다', () => {
    const body = 'A'.repeat(1000);

    const result = buildPreview(body);

    expect(result.previewText).toBe('A'.repeat(300));
    expect(result.maskedCharCount).toBe(700);
  });
});

describe('buildPreview 경계 스냅 (F1-AC5)', () => {
  it('상한 이내의 마지막 줄바꿈까지만 남긴다', () => {
    // 길이 100 → 상한 30. 상한 이내 마지막 줄바꿈은 인덱스 20.
    const body = `${'a'.repeat(20)}\n${'b'.repeat(79)}`;
    expect(body.length).toBe(100);

    const result = buildPreview(body);

    expect(result.previewText).toBe('a'.repeat(20));
    expect(result.previewText.length).toBeLessThanOrEqual(30);
  });

  it('줄바꿈이 없으면 상한 이내의 마지막 공백까지만 남긴다', () => {
    // 길이 100 → 상한 30. 상한 이내 마지막 공백은 인덱스 25.
    const body = `${'a'.repeat(25)} ${'b'.repeat(74)}`;
    expect(body.length).toBe(100);

    const result = buildPreview(body);

    expect(result.previewText).toBe('a'.repeat(25));
  });

  it('상한 이후의 경계로는 절대 앞으로 스냅하지 않는다', () => {
    // 상한(30) 이내에는 경계가 없고, 경계는 상한 뒤(인덱스 50)에만 있다.
    const body = `${'a'.repeat(50)} ${'b'.repeat(49)}`;
    expect(body.length).toBe(100);

    const result = buildPreview(body);

    // 앞으로 스냅했다면 51자가 되어 30% 상한을 넘는다.
    expect(result.previewText.length).toBe(30);
  });

  it('스냅 결과의 후행 공백은 제거되어 상한을 넘지 않는다', () => {
    const body = `word   ${'x'.repeat(93)}`;
    expect(body.length).toBe(100);

    const result = buildPreview(body);

    expect(result.previewText).toBe(result.previewText.trimEnd());
    expect(result.previewText.length).toBeLessThanOrEqual(30);
  });
});

describe('buildPreview 마스킹 구간 미노출 (F1-AC6)', () => {
  it('미리보기는 항상 전문의 접두사이며 뒤쪽 원문을 포함하지 않는다', () => {
    const body = `${makeBody(600)}SECRET_TAIL_MARKER_비밀구간${makeBody(400)}`;

    const result = buildPreview(body);

    expect(body.startsWith(result.previewText)).toBe(true);
    expect(result.previewText).not.toContain('SECRET_TAIL_MARKER_비밀구간');
  });

  it('previewCharCount + maskedCharCount 는 전문 길이와 같다', () => {
    for (const length of [0, 1, 9, 100, 333, 1024]) {
      const body = makeBody(length);

      const result = buildPreview(body);

      expect(result.previewCharCount + result.maskedCharCount).toBe(length);
    }
  });

  it('전문이 비었거나 너무 짧아 상한이 0이면 아무것도 노출하지 않는다', () => {
    expect(buildPreview('')).toEqual({ previewText: '', previewCharCount: 0, maskedCharCount: 0 });
    // 길이 3 → floor(3 * 0.3) = 0
    expect(buildPreview('abc')).toEqual({ previewText: '', previewCharCount: 0, maskedCharCount: 3 });
  });
});

describe('buildPreview ratio 방어', () => {
  it('음수 ratio는 0으로 클램프되어 전문이 노출되지 않는다', () => {
    const body = makeBody(500);

    const result = buildPreview(body, -1);

    expect(result.previewText).toBe('');
    expect(result.maskedCharCount).toBe(500);
  });

  it('NaN ratio는 기본 30%로 되돌아간다', () => {
    const body = 'A'.repeat(500);

    const result = buildPreview(body, Number.NaN);

    expect(result.previewText.length).toBe(limitOf(body));
  });
});
