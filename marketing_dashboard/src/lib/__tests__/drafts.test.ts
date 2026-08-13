import { describe, expect, it } from 'vitest';
import { BLOG_MIN_HEADINGS, PLATFORM_SPECS } from '@/lib/constants';
import {
  countChars,
  findUnknownRepositories,
  hasEnoughHeadings,
  validateDraft,
} from '@/lib/drafts';

/**
 * `src/lib/drafts.ts` 단위 테스트 (AC-3.3, AC-3.4, AC-3.8).
 * 순수 함수이므로 경계값(280 / 600 / 1,300 / 800자, 소제목 2개)을 결정적으로 검증한다.
 */

const KNOWN_REPOSITORIES = ['octo/app', 'octo/api'];

/** 정확히 `count` 자인 플레인 텍스트 */
function text(count: number): string {
  return '가'.repeat(count);
}

/** `## 소제목` 을 `headings` 개 포함하고 총 글자 수가 정확히 `count` 인 마크다운 */
function blogContent(count: number, headings: number): string {
  const lines = ['# 제목', ...Array.from({ length: headings }, (_, i) => `## 소제목${i + 1}`)];
  const base = `${lines.join('\n\n')}\n\n`;
  const padding = count - countChars(base);
  if (padding < 0) throw new Error('요청한 글자 수가 머리말보다 짧습니다.');
  return base + text(padding);
}

describe('countChars', () => {
  it('공백을 포함해 계산한다', () => {
    expect(countChars('가 나 다')).toBe(5);
    expect(countChars('')).toBe(0);
  });

  it('이모지·서로게이트 페어를 1자로 계산한다', () => {
    // '🚀' 는 UTF-16 으로 2 코드 유닛이라 String.length 는 2 를 반환한다
    expect('🚀'.length).toBe(2);
    expect(countChars('🚀')).toBe(1);
    expect(countChars('출시 🚀🎉')).toBe(5); // 출·시·공백·🚀·🎉
  });

  it('이모지가 섞여도 X 규격 판정은 문자 수 기준이다 (AC-3.4)', () => {
    const content = '🚀'.repeat(PLATFORM_SPECS.x.max); // 280자 · String.length 는 560
    const result = validateDraft('x', content, KNOWN_REPOSITORIES);

    expect(content.length).toBe(PLATFORM_SPECS.x.max * 2);
    expect(result.charCount).toBe(PLATFORM_SPECS.x.max);
    expect(result.withinLimit).toBe(true);
    expect(result.message).toBeNull();
  });
});

describe('hasEnoughHeadings', () => {
  it('H2 이상 소제목이 2개 이상이면 true', () => {
    expect(hasEnoughHeadings('# 제목\n\n## 하나\n\n## 둘\n')).toBe(true);
    expect(hasEnoughHeadings('### 하나\n### 둘')).toBe(true);
  });

  it('H1 만 있거나 소제목이 1개면 false', () => {
    expect(hasEnoughHeadings('# 제목\n\n본문')).toBe(false);
    expect(hasEnoughHeadings('# 제목\n\n## 하나\n\n본문')).toBe(false);
  });

  it('본문 중간의 # 은 소제목으로 세지 않는다', () => {
    expect(hasEnoughHeadings('## 하나\n\n색상 코드 #fff 와 이슈 #12 를 언급했다')).toBe(false);
  });
});

describe('validateDraft — X (AC-3.3)', () => {
  it('280자는 통과한다', () => {
    const result = validateDraft('x', text(280), KNOWN_REPOSITORIES);

    expect(result.charCount).toBe(280);
    expect(result.withinLimit).toBe(true);
    expect(result.message).toBeNull();
  });

  it('281자는 초과 경고를 낸다', () => {
    const result = validateDraft('x', text(281), KNOWN_REPOSITORIES);

    expect(result.charCount).toBe(281);
    expect(result.withinLimit).toBe(false);
    expect(result.message).toBe('280자를 초과했습니다. 게시 전 줄여 주세요.');
  });
});

describe('validateDraft — LinkedIn 600~1,300자 (AC-3.3)', () => {
  it.each([
    [PLATFORM_SPECS.linkedin.min, true],
    [PLATFORM_SPECS.linkedin.max, true],
    [900, true],
  ])('%i자는 범위 안이다', (count, expected) => {
    const result = validateDraft('linkedin', text(count), KNOWN_REPOSITORIES);

    expect(result.charCount).toBe(count);
    expect(result.withinLimit).toBe(expected);
    expect(result.message).toBeNull();
  });

  it.each([PLATFORM_SPECS.linkedin.min - 1, PLATFORM_SPECS.linkedin.max + 1])(
    '%i자는 범위를 벗어나 경고한다',
    (count) => {
      const result = validateDraft('linkedin', text(count), KNOWN_REPOSITORIES);

      expect(result.withinLimit).toBe(false);
      expect(result.message).toBe('권장 분량(600~1,300자)을 벗어났습니다.');
    },
  );
});

describe('validateDraft — 블로그 800자 이상 + 소제목 2개 이상 (Q4, AC-3.3)', () => {
  const WARNING = '권장 분량 800자 이상 / 소제목 2개 이상을 충족하지 않습니다.';

  it('799자 · 소제목 1개는 경고한다', () => {
    const content = blogContent(799, 1);
    const result = validateDraft('blog', content, KNOWN_REPOSITORIES);

    expect(result.charCount).toBe(799);
    expect(hasEnoughHeadings(content)).toBe(false);
    expect(result.withinLimit).toBe(false);
    expect(result.message).toBe(WARNING);
  });

  it('800자여도 소제목이 1개면 경고한다', () => {
    const result = validateDraft('blog', blogContent(800, 1), KNOWN_REPOSITORIES);

    expect(result.charCount).toBe(800);
    expect(result.withinLimit).toBe(false);
    expect(result.message).toBe(WARNING);
  });

  it('799자면 소제목이 2개여도 경고한다', () => {
    const result = validateDraft('blog', blogContent(799, BLOG_MIN_HEADINGS), KNOWN_REPOSITORIES);

    expect(result.withinLimit).toBe(false);
    expect(result.message).toBe(WARNING);
  });

  it('800자 · 소제목 2개는 통과한다', () => {
    const content = blogContent(800, BLOG_MIN_HEADINGS);
    const result = validateDraft('blog', content, KNOWN_REPOSITORIES);

    expect(result.charCount).toBe(800);
    expect(hasEnoughHeadings(content)).toBe(true);
    expect(result.withinLimit).toBe(true);
    expect(result.message).toBeNull();
  });
});

describe('findUnknownRepositories (AC-3.8)', () => {
  it('활동 데이터에 있는 저장소명은 걸러낸다', () => {
    expect(findUnknownRepositories('octo/app 과 octo/api 를 다뤘다', KNOWN_REPOSITORIES)).toEqual(
      [],
    );
  });

  it('활동 데이터에 없는 저장소명만 등장 순서대로 반환한다', () => {
    const content = 'octo/app 을 개선하고 ghost/repo 와 ghost/repo 도 손봤다. other/lib 도 언급.';

    expect(findUnknownRepositories(content, KNOWN_REPOSITORIES)).toEqual([
      'ghost/repo',
      'other/lib',
    ]);
  });

  it('GitHub URL 안의 저장소명도 검사한다', () => {
    expect(
      findUnknownRepositories('https://github.com/ghost/repo 참고', KNOWN_REPOSITORIES),
    ).toEqual(['ghost/repo']);

    expect(
      findUnknownRepositories('https://github.com/octo/app/pull/12 참고', KNOWN_REPOSITORIES),
    ).toEqual([]);
  });

  it('대소문자는 구분하지 않는다', () => {
    expect(findUnknownRepositories('Octo/App 을 다뤘다', KNOWN_REPOSITORIES)).toEqual([]);
  });

  it('CI/CD·날짜 같은 관용 표기는 저장소명으로 보지 않는다', () => {
    expect(findUnknownRepositories('CI/CD 파이프라인과 8/11 릴리스', KNOWN_REPOSITORIES)).toEqual(
      [],
    );
  });

  it('미확인 저장소명이 있으면 경고 문구에 포함한다', () => {
    const result = validateDraft('x', `ghost/repo 를 다뤘다`, KNOWN_REPOSITORIES);

    expect(result.unknownRepos).toEqual(['ghost/repo']);
    expect(result.message).toBe('활동 데이터에 없는 저장소명이 포함되어 있습니다: ghost/repo');
  });

  it('분량 경고와 미확인 저장소 경고를 함께 담는다', () => {
    const result = validateDraft('x', `${text(281)} ghost/repo`, KNOWN_REPOSITORIES);

    expect(result.withinLimit).toBe(false);
    expect(result.message).toBe(
      '280자를 초과했습니다. 게시 전 줄여 주세요. 활동 데이터에 없는 저장소명이 포함되어 있습니다: ghost/repo',
    );
  });
});
