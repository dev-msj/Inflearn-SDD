/**
 * 초기 데이터 시드 (TECH_SPEC 11장 N1: 운영자 템플릿 등록 수단은 시드/직접 입력으로 대체).
 *
 * 검증 목적
 *  - F1-AC1 "한 페이지 20개 단위": 판매 중(ON_SALE) 템플릿을 20개보다 많이 넣어 2페이지 이상을 만든다.
 *  - F1-AC2 카테고리 필터: 카테고리 5개에 분산 배치.
 *  - F1-AC3 검색: 제목에만 있는 키워드와 설명에만 있는 키워드를 서로 다르게 심는다.
 *  - F1-AC8 판매 중지/삭제 안내: SUSPENDED 1건, soft delete 1건, DRAFT 1건을 포함한다.
 *
 * ★preview_text / preview_char_count / masked_char_count는 저장 시점에 buildPreview()로 계산한다.
 *   런타임에 body를 잘라 내려보내는 경로를 만들지 않기 위해서다(F1-AC5, F1-AC6).
 *
 * 실행: `npm run db:seed`
 *   package.json의 seed 명령에 `--conditions=react-server`가 붙어 있다.
 *   preview.ts가 `import 'server-only'`를 선언하는데, 이 패키지는 react-server 조건이 아닐 때
 *   import 즉시 예외를 던지도록 만들어져 있기 때문이다(마스킹 로직의 클라이언트 유입 차단 장치).
 */

import { PrismaClient, TemplateStatus } from '@prisma/client';

import { buildPreview } from '../src/server/templates/preview';

const prisma = new PrismaClient();

/** 카테고리 정의. slug는 URL 쿼리(`?category=`)의 단일 진실이다. */
const CATEGORIES = [
  { slug: 'marketing', nameKo: '마케팅', nameEn: 'Marketing', sortOrder: 10 },
  { slug: 'development', nameKo: '개발', nameEn: 'Development', sortOrder: 20 },
  { slug: 'writing', nameKo: '글쓰기', nameEn: 'Writing', sortOrder: 30 },
  { slug: 'business', nameKo: '비즈니스', nameEn: 'Business', sortOrder: 40 },
  { slug: 'study', nameKo: '학습', nameEn: 'Study', sortOrder: 50 },
] as const;

type CategorySlug = (typeof CATEGORIES)[number]['slug'];

interface TemplateSeed {
  slug: string;
  categorySlug: CategorySlug;
  title: string;
  summary: string;
  description: string;
  usageGuide: string;
  /** 프롬프트 전문. buildPreview()의 입력이며 구매자만 열람할 수 있다. */
  bodySections: string[];
  priceKrw: number;
  priceUsd: string;
  status?: TemplateStatus;
  /** soft delete 검증용 (F1-AC8) */
  deleted?: boolean;
}

/**
 * 프롬프트 전문 본문을 만든다.
 * 미리보기 30% 경계가 의미 있게 동작하도록 섹션을 여러 개로 구성하고 줄바꿈을 넣는다.
 */
function buildBody(title: string, sections: string[]): string {
  const header = [
    `# ${title}`,
    '',
    '## 역할',
    '너는 해당 분야에서 10년 이상 실무를 수행한 전문가다. 답변은 실행 가능한 수준까지 구체적으로 작성한다.',
    '',
    '## 입력 변수',
    '- {{목표}}: 이번 작업으로 달성하려는 결과',
    '- {{대상}}: 결과물을 읽을 사람 또는 집단',
    '- {{제약}}: 반드시 지켜야 할 분량·톤·형식 제약',
    '',
    '## 수행 절차',
  ].join('\n');

  const steps = sections.map((section, index) => `${index + 1}. ${section}`).join('\n');

  const footer = [
    '',
    '## 출력 형식',
    '- 1단계: 핵심 요약 3줄',
    '- 2단계: 본문 (소제목 + 불릿)',
    '- 3단계: 바로 사용할 수 있는 최종 결과물',
    '- 4단계: 개선을 위한 후속 질문 3개',
    '',
    '## 품질 기준',
    '근거 없는 단정 표현을 쓰지 않는다. 수치를 제시할 때는 산출 방식을 함께 적는다.',
    '{{제약}}을 위반하면 결과물을 폐기하고 처음부터 다시 작성한다.',
    '',
    '## 마무리',
    '작성이 끝나면 {{목표}} 달성 여부를 스스로 점검하고, 부족한 부분을 한 문단으로 정리한다.',
  ].join('\n');

  return `${header}\n${steps}\n${footer}\n`;
}

const TEMPLATES: TemplateSeed[] = [
  {
    slug: 'email-marketing-sequence',
    categorySlug: 'marketing',
    title: '이메일 마케팅 시퀀스 설계 프롬프트',
    summary: '신규 가입자를 유료 전환으로 이끄는 5통짜리 이메일 시퀀스를 설계한다.',
    description: '가입 직후부터 7일간 발송할 온보딩 이메일의 발송 시점, 제목, 본문 구조를 한 번에 뽑아내는 프롬프트입니다. 전환율 개선 실험 아이디어까지 함께 제안합니다.',
    usageGuide: '{{목표}}에 "무료 체험 → 유료 전환", {{대상}}에 서비스 주 사용자층을 넣고 실행하세요.',
    bodySections: [
      '{{대상}}의 가입 동기를 3가지 가설로 정리한다.',
      '가설별로 첫 번째 이메일의 제목 후보를 5개씩 작성한다.',
      '발송 일정을 D+0, D+1, D+3, D+5, D+7로 나누어 각 메일의 목적을 한 줄로 규정한다.',
      '각 메일의 본문을 도입-근거-행동유도 3단 구조로 작성한다.',
      '행동유도 문구를 A/B 테스트용으로 2가지씩 제안한다.',
      '전환이 일어나지 않은 사용자에게 보낼 리마인드 메일을 별도로 작성한다.',
    ],
    priceKrw: 12000,
    priceUsd: '9.00',
  },
  {
    slug: 'landing-page-copy',
    categorySlug: 'marketing',
    title: '랜딩 페이지 카피라이팅 프롬프트',
    summary: '헤드라인부터 FAQ까지 랜딩 페이지 전체 카피를 생성한다.',
    description: '제품의 핵심 가치를 한 문장으로 압축하고, 스크롤 순서에 맞춰 섹션별 문구를 만들어 줍니다. 반론 처리 문구와 FAQ 초안이 포함됩니다.',
    usageGuide: '{{제약}}에 브랜드 톤앤매너와 금지 표현을 명시하면 결과가 안정됩니다.',
    bodySections: [
      '제품의 핵심 가치를 12단어 이내 헤드라인 후보 7개로 만든다.',
      '방문자가 느낄 불안 요소를 5개 나열하고 각각의 반론 처리 문구를 작성한다.',
      '기능이 아니라 결과 중심으로 베네핏 블록 3개를 작성한다.',
      '사회적 증거 섹션에 넣을 문구 형식을 제안한다.',
      '가격 섹션의 설명 문구와 환불 안내 문구를 작성한다.',
      'FAQ 8개를 질문-답변 형식으로 작성한다.',
    ],
    priceKrw: 15000,
    priceUsd: '11.00',
  },
  {
    slug: 'social-media-calendar',
    categorySlug: 'marketing',
    title: '한 달치 소셜 콘텐츠 캘린더 프롬프트',
    summary: '채널별 특성을 반영한 30일 콘텐츠 캘린더를 만든다.',
    description: '인스타그램, 링크드인, 블로그에 각각 맞는 형식으로 한 달치 게시물 주제와 초안을 배치합니다. 반복 사용해도 주제가 겹치지 않도록 주차별 테마를 분리합니다.',
    usageGuide: '{{대상}}에 팔로워 페르소나를 구체적으로 적을수록 주제 품질이 올라갑니다.',
    bodySections: [
      '주차별 테마를 4개로 나누고 각 테마의 목적을 규정한다.',
      '채널별 게시 빈도와 형식을 표로 정리한다.',
      '30개 게시물의 제목과 후킹 문장을 작성한다.',
      '이미지·영상이 필요한 게시물에는 촬영 지시문을 덧붙인다.',
      '댓글 응대용 기본 문구를 5개 준비한다.',
    ],
    priceKrw: 13000,
    priceUsd: '10.00',
  },
  {
    slug: 'ad-copy-variants',
    categorySlug: 'marketing',
    title: '광고 소재 변형 생성 프롬프트',
    summary: '하나의 메시지에서 채널별 광고 카피 변형을 대량 생성한다.',
    description: '검색 광고, 배너, 영상 스크립트용 카피를 동일한 핵심 메시지에서 파생시켜 일관성을 유지합니다. 심의 리스크가 있는 표현을 스스로 걸러 냅니다.',
    usageGuide: '금지 표현 목록을 {{제약}}에 넣어 두면 심의 반려를 줄일 수 있습니다.',
    bodySections: [
      '핵심 메시지를 한 문장으로 확정한다.',
      '검색 광고용 제목 15자 이내 후보 10개를 만든다.',
      '배너용 카피를 짧은 순서대로 3단계 길이로 만든다.',
      '15초 영상 스크립트를 장면 단위로 작성한다.',
      '과장·단정 표현을 자체 점검하고 대체 문구를 제시한다.',
    ],
    priceKrw: 11000,
    priceUsd: '8.50',
  },
  {
    slug: 'customer-interview-guide',
    categorySlug: 'marketing',
    title: '고객 인터뷰 질문 설계 프롬프트',
    summary: '유도 질문 없이 진짜 니즈를 끌어내는 인터뷰 가이드를 만든다.',
    description: '인터뷰 목적에 맞춰 도입 질문부터 심층 질문까지 계층적으로 배치하고, 답변이 막힐 때 쓸 후속 질문을 함께 제공합니다.',
    usageGuide: '{{목표}}에 검증하려는 가설을 한 문장으로 적어 주세요.',
    bodySections: [
      '검증할 가설을 3개로 정리한다.',
      '라포 형성을 위한 도입 질문 5개를 만든다.',
      '가설별 심층 질문을 각각 4개씩 만든다.',
      '유도 질문이 되지 않도록 문장을 점검하고 수정한다.',
      '인터뷰 후 정리 템플릿을 제공한다.',
    ],
    priceKrw: 9000,
    priceUsd: '7.00',
  },
  {
    slug: 'code-review-checklist',
    categorySlug: 'development',
    title: '코드 리뷰 체크리스트 프롬프트',
    summary: '변경 diff를 받아 리뷰 관점별로 지적 사항을 정리한다.',
    description: '가독성, 경계 조건, 동시성, 보안, 테스트 커버리지 관점을 분리해 리뷰합니다. 지적마다 수정 예시 코드를 함께 제안합니다.',
    usageGuide: '변경 diff 전체를 붙여 넣고 {{제약}}에 사용 중인 언어와 프레임워크를 적으세요.',
    bodySections: [
      '변경의 의도를 한 문단으로 요약한다.',
      '가독성 관점에서 개선 지점을 지적한다.',
      '경계 조건과 예외 처리 누락을 찾는다.',
      '동시성·트랜잭션 관점의 위험을 검토한다.',
      '보안 관점에서 입력 검증과 권한 확인을 점검한다.',
      '누락된 테스트 케이스를 나열하고 예시 코드를 제시한다.',
    ],
    priceKrw: 18000,
    priceUsd: '14.00',
  },
  {
    slug: 'bug-root-cause-analysis',
    categorySlug: 'development',
    title: '장애 원인 분석 프롬프트',
    summary: '로그와 증상만으로 가설을 세우고 검증 순서를 제안한다.',
    description: '재현이 어려운 장애 상황에서 가설을 우선순위로 정렬하고, 각 가설을 최소 비용으로 검증하는 순서를 제안합니다. 사후 회고 문서 초안까지 만듭니다.',
    usageGuide: '로그 원문과 발생 시각, 배포 이력을 함께 입력하세요.',
    bodySections: [
      '증상과 영향 범위를 시간순으로 정리한다.',
      '가능한 원인 가설을 5개 세우고 발생 확률을 추정한다.',
      '가설별 검증 방법을 비용이 낮은 순서로 배열한다.',
      '임시 완화 조치와 근본 조치를 구분해 제안한다.',
      '재발 방지 항목을 회고 문서 형식으로 정리한다.',
    ],
    priceKrw: 19000,
    priceUsd: '15.00',
  },
  {
    slug: 'api-doc-generator',
    categorySlug: 'development',
    title: 'API 문서 초안 생성 프롬프트',
    summary: '핸들러 코드에서 요청·응답 명세와 예시를 뽑아낸다.',
    description: '엔드포인트 코드를 입력하면 경로, 파라미터, 응답 스키마, 오류 코드 표를 작성합니다. 실패 응답 예시를 반드시 포함하도록 강제합니다.',
    usageGuide: '핸들러 코드와 타입 정의를 함께 붙여 넣으세요.',
    bodySections: [
      '엔드포인트의 목적과 인증 요구사항을 정리한다.',
      '요청 파라미터를 필수/선택으로 구분해 표로 만든다.',
      '성공 응답 스키마와 예시 JSON을 작성한다.',
      '오류 코드별 상태 코드와 대응 방법을 표로 만든다.',
      'curl 예시와 주의 사항을 덧붙인다.',
    ],
    priceKrw: 14000,
    priceUsd: '11.00',
  },
  {
    slug: 'sql-query-optimizer',
    categorySlug: 'development',
    title: 'SQL 쿼리 튜닝 프롬프트',
    summary: '실행 계획을 해석하고 인덱스 전략을 제안한다.',
    description: '느린 쿼리와 실행 계획을 입력하면 병목 지점을 지목하고 인덱스 추가·쿼리 재작성 두 방향의 대안을 제시합니다.',
    usageGuide: 'EXPLAIN ANALYZE 결과를 그대로 붙여 넣으세요.',
    bodySections: [
      '실행 계획에서 비용이 큰 노드를 식별한다.',
      '병목 원인을 데이터 분포 관점에서 설명한다.',
      '인덱스 추가안을 컬럼 순서까지 지정해 제안한다.',
      '쿼리 재작성안을 제시하고 예상 효과를 설명한다.',
      '적용 시 부작용과 롤백 방법을 정리한다.',
    ],
    priceKrw: 21000,
    priceUsd: '16.00',
  },
  {
    slug: 'test-case-designer',
    categorySlug: 'development',
    title: '테스트 케이스 설계 프롬프트',
    summary: '요구사항에서 정상·엣지·에러 케이스를 빠짐없이 도출한다.',
    description: '수용 기준 문장을 입력하면 동등 분할과 경계값 분석을 적용해 테스트 케이스 표를 만듭니다. 자동화 우선순위도 함께 매깁니다.',
    usageGuide: '수용 기준을 한 줄씩 나열해 입력하세요.',
    bodySections: [
      '요구사항에서 검증 대상 조건을 추출한다.',
      '동등 분할로 입력 그룹을 나눈다.',
      '경계값 케이스를 각 그룹마다 추가한다.',
      '에러 케이스와 권한 케이스를 별도로 나열한다.',
      '자동화 우선순위를 3단계로 매긴다.',
    ],
    priceKrw: 16000,
    priceUsd: '12.50',
  },
  {
    slug: 'refactoring-plan',
    categorySlug: 'development',
    title: '리팩터링 계획 수립 프롬프트',
    summary: '큰 변경을 안전한 단계로 쪼개는 계획을 만든다.',
    description: '한 번에 바꿀 수 없는 구조 변경을 릴리스 가능한 단위로 분할하고, 단계마다 되돌릴 수 있는 지점을 남기도록 설계합니다.',
    usageGuide: '현재 구조와 목표 구조를 각각 요약해 입력하세요.',
    bodySections: [
      '현재 구조의 문제를 영향도 순으로 정리한다.',
      '목표 구조에 도달하기 위한 단계를 5개 이하로 나눈다.',
      '각 단계가 독립적으로 배포 가능한지 검증한다.',
      '단계별 롤백 조건을 명시한다.',
      '진행 상황을 측정할 지표를 정한다.',
    ],
    priceKrw: 17000,
    priceUsd: '13.00',
  },
  {
    slug: 'commit-message-writer',
    categorySlug: 'development',
    title: '커밋 메시지 작성 프롬프트',
    summary: '변경 내용을 한눈에 파악되는 커밋 메시지로 정리한다.',
    description: '변경 diff를 요약해 제목과 본문을 분리한 커밋 메시지를 만듭니다. 왜 바꿨는지를 반드시 본문에 남기도록 강제합니다.',
    usageGuide: 'diff와 관련 이슈 번호를 함께 입력하세요.',
    bodySections: [
      '변경의 범위를 한 단어로 규정한다.',
      '제목을 50자 이내 명령형으로 작성한다.',
      '본문에 변경 이유와 대안 검토 내용을 적는다.',
      '관련 이슈와 후속 작업을 각주로 남긴다.',
    ],
    priceKrw: 7000,
    priceUsd: '5.50',
  },
  {
    slug: 'blog-post-outline',
    categorySlug: 'writing',
    title: '블로그 글 구조 설계 프롬프트',
    summary: '검색 의도에 맞는 목차와 문단 요지를 만든다.',
    description: '키워드를 입력하면 검색 의도를 분류하고, 그에 맞는 목차와 각 문단이 답해야 할 질문을 배치합니다. 중복 서술을 스스로 제거합니다.',
    usageGuide: '{{목표}}에 검색 키워드를, {{대상}}에 독자 수준을 적으세요.',
    bodySections: [
      '키워드의 검색 의도를 정보형·비교형·구매형으로 분류한다.',
      '의도에 맞는 목차를 6~9개 항목으로 만든다.',
      '문단마다 답해야 할 질문을 한 문장으로 규정한다.',
      '도입부 3문장과 결론 3문장을 작성한다.',
      '내부 링크로 이어질 후속 주제를 3개 제안한다.',
    ],
    priceKrw: 10000,
    priceUsd: '8.00',
  },
  {
    slug: 'story-plot-builder',
    categorySlug: 'writing',
    title: '단편 소설 플롯 구성 프롬프트',
    summary: '인물의 결핍에서 출발해 결말까지 구조를 짠다.',
    description: '주인공의 결핍과 욕망을 정의하고, 갈등이 자연스럽게 상승하도록 장면을 배치합니다. 결말의 반전이 복선과 맞물리는지 스스로 검토합니다.',
    usageGuide: '분량 제약을 {{제약}}에 적으면 장면 수를 맞춰 줍니다.',
    bodySections: [
      '주인공의 결핍과 표면적 욕망을 각각 정의한다.',
      '방해 요소를 3단계로 배치한다.',
      '장면 목록을 시간순으로 작성한다.',
      '복선과 회수 지점을 표로 대응시킨다.',
      '결말 후보를 2개 만들고 각각의 여운을 비교한다.',
    ],
    priceKrw: 12000,
    priceUsd: '9.50',
  },
  {
    slug: 'newsletter-writer',
    categorySlug: 'writing',
    title: '뉴스레터 원고 작성 프롬프트',
    summary: '구독자가 끝까지 읽는 뉴스레터 한 통을 완성한다.',
    description: '한 가지 주제를 깊게 다루는 형식으로 도입, 본문, 실행 제안을 배치합니다. 제목과 미리보기 텍스트 조합까지 제안합니다.',
    usageGuide: '지난 호 주제를 함께 입력하면 중복을 피합니다.',
    bodySections: [
      '이번 호의 단일 주제를 한 문장으로 확정한다.',
      '구독자가 겪는 문제를 도입부에서 재현한다.',
      '본문을 근거-사례-정리 3단으로 구성한다.',
      '오늘 바로 해 볼 수 있는 실행 제안을 2개 제시한다.',
      '제목과 미리보기 텍스트 조합을 5개 만든다.',
    ],
    priceKrw: 11000,
    priceUsd: '8.50',
  },
  {
    slug: 'resume-bullet-rewriter',
    categorySlug: 'writing',
    title: '이력서 성과 문장 다듬기 프롬프트',
    summary: '업무 나열을 성과 중심 문장으로 바꾼다.',
    description: '담당 업무 설명을 입력하면 행동-방법-결과 구조로 재작성하고, 수치가 없으면 어떤 수치를 확보해야 하는지 알려 줍니다.',
    usageGuide: '지원 직무 공고를 함께 붙여 넣으면 표현을 맞춰 줍니다.',
    bodySections: [
      '입력된 업무에서 실제 성과를 분리한다.',
      '행동-방법-결과 구조로 문장을 다시 쓴다.',
      '수치가 없는 항목에는 확보해야 할 지표를 제안한다.',
      '지원 직무 키워드에 맞춰 표현을 조정한다.',
      '과장으로 읽힐 수 있는 표현을 걸러 낸다.',
    ],
    priceKrw: 9000,
    priceUsd: '7.00',
  },
  {
    slug: 'translation-tone-keeper',
    categorySlug: 'writing',
    title: '톤을 유지하는 번역 프롬프트',
    summary: '원문의 어조와 리듬을 살려 번역한다.',
    description: '직역과 의역 사이에서 문서 성격에 맞는 지점을 잡고, 고유명사와 용어를 일관되게 처리합니다. 번역 후 자체 검수 단계를 포함합니다.',
    usageGuide: '용어집이 있으면 {{제약}}에 함께 넣으세요.',
    bodySections: [
      '문서의 성격과 목표 독자를 파악한다.',
      '용어집을 만들고 일관성 기준을 정한다.',
      '문단 단위로 번역한다.',
      '원문과 대조해 누락과 의미 변형을 점검한다.',
      '어색한 문장을 자연스러운 표현으로 다듬는다.',
    ],
    priceKrw: 13000,
    priceUsd: '10.00',
  },
  {
    slug: 'meeting-notes-summarizer',
    categorySlug: 'business',
    title: '회의록 요약 및 액션 아이템 추출 프롬프트',
    summary: '긴 회의 기록에서 결정 사항과 담당자를 뽑아낸다.',
    description: '녹취 텍스트를 입력하면 결정된 사항, 보류된 사항, 액션 아이템을 분리합니다. 담당자와 기한이 비어 있으면 확인 질문을 남깁니다.',
    usageGuide: '참석자 명단을 함께 입력하면 담당자 매칭 정확도가 올라갑니다.',
    bodySections: [
      '회의 목적과 참석자를 정리한다.',
      '결정 사항을 근거와 함께 나열한다.',
      '보류 사항과 보류 사유를 구분한다.',
      '액션 아이템을 담당자·기한과 함께 표로 만든다.',
      '정보가 부족한 항목에 확인 질문을 남긴다.',
    ],
    priceKrw: 12000,
    priceUsd: '9.00',
  },
  {
    slug: 'okr-designer',
    categorySlug: 'business',
    title: '분기 OKR 설계 프롬프트',
    summary: '측정 가능한 핵심 결과로 목표를 분해한다.',
    description: '조직의 목표를 입력하면 정성적 목표와 정량적 핵심 결과를 분리하고, 활동 지표가 아닌 결과 지표를 쓰도록 교정합니다.',
    usageGuide: '지난 분기 성과와 조직 규모를 함께 입력하세요.',
    bodySections: [
      '목표를 한 문장의 정성적 표현으로 정리한다.',
      '핵심 결과 후보를 8개 만든다.',
      '활동 지표를 걸러 내고 결과 지표만 남긴다.',
      '측정 방법과 데이터 출처를 지정한다.',
      '분기 중간 점검 기준을 정한다.',
    ],
    priceKrw: 16000,
    priceUsd: '12.00',
  },
  {
    slug: 'pricing-strategy-advisor',
    categorySlug: 'business',
    title: '가격 정책 설계 프롬프트',
    summary: '가치 기반 가격 구간과 플랜 구성을 제안한다.',
    description: '원가가 아니라 고객이 얻는 가치에서 출발해 가격 구간을 잡고, 플랜 간 차별 요소를 설계합니다. 할인 정책의 위험도 함께 짚습니다.',
    usageGuide: '경쟁 제품 가격표를 함께 입력하면 비교 분석이 붙습니다.',
    bodySections: [
      '고객이 얻는 가치를 금액으로 환산한다.',
      '가격 구간을 3개로 나누고 근거를 적는다.',
      '플랜별 포함 기능을 차별 요소 중심으로 배치한다.',
      '할인 정책이 브랜드에 주는 위험을 평가한다.',
      '가격 인상 시 커뮤니케이션 문구를 작성한다.',
    ],
    priceKrw: 22000,
    priceUsd: '17.00',
  },
  {
    slug: 'competitor-analysis',
    categorySlug: 'business',
    title: '경쟁사 분석 프롬프트',
    summary: '공개 정보만으로 경쟁 구도를 정리한다.',
    description: '경쟁사 목록을 입력하면 포지셔닝, 강점, 취약점을 표로 정리하고 우리 제품이 파고들 틈을 제안합니다.',
    usageGuide: '경쟁사 웹사이트 문구를 함께 붙여 넣으세요.',
    bodySections: [
      '경쟁사별 포지셔닝 문장을 정리한다.',
      '강점과 취약점을 각각 3개씩 뽑는다.',
      '가격과 기능을 비교표로 만든다.',
      '아직 채워지지 않은 틈새를 3개 제안한다.',
      '차별화 메시지 초안을 작성한다.',
    ],
    priceKrw: 18000,
    priceUsd: '14.00',
  },
  {
    slug: 'investor-update-writer',
    categorySlug: 'business',
    title: '투자자 업데이트 메일 프롬프트',
    summary: '월간 진행 상황을 신뢰감 있게 전달한다.',
    description: '지표, 진행 상황, 도움 요청을 정해진 순서로 배치해 읽는 사람이 빠르게 판단할 수 있게 합니다. 나쁜 소식을 숨기지 않도록 구조를 강제합니다.',
    usageGuide: '이번 달 핵심 지표 수치를 함께 입력하세요.',
    bodySections: [
      '핵심 지표를 전월 대비로 정리한다.',
      '잘된 일과 잘 안된 일을 같은 비중으로 적는다.',
      '다음 달 목표를 측정 가능한 형태로 적는다.',
      '구체적인 도움 요청을 2가지 적는다.',
      '전체를 5분 안에 읽히도록 분량을 조정한다.',
    ],
    priceKrw: 14000,
    priceUsd: '11.00',
  },
  {
    slug: 'customer-support-reply',
    categorySlug: 'business',
    title: '고객 응대 답변 작성 프롬프트',
    summary: '불만 문의에 감정과 사실을 분리해 답한다.',
    description: '고객 문의를 입력하면 공감 표현, 사실 확인, 해결 방안, 후속 조치를 순서대로 배치한 답변을 만듭니다. 과잉 사과를 걸러 냅니다.',
    usageGuide: '내부 정책 문구를 {{제약}}에 넣어 두세요.',
    bodySections: [
      '문의에서 감정과 사실을 분리한다.',
      '확인이 필요한 항목을 목록으로 만든다.',
      '해결 방안을 즉시안과 대안으로 나눈다.',
      '후속 조치와 기한을 명시한다.',
      '문장을 다시 읽고 과잉 사과 표현을 줄인다.',
    ],
    priceKrw: 10000,
    priceUsd: '8.00',
  },
  {
    slug: 'study-plan-builder',
    categorySlug: 'study',
    title: '학습 계획 설계 프롬프트',
    summary: '목표 시험일까지 역산해 주간 계획을 만든다.',
    description: '현재 수준과 목표를 입력하면 남은 기간을 역산해 주차별 학습량을 배분합니다. 복습 주기를 자동으로 끼워 넣습니다.',
    usageGuide: '하루에 확보 가능한 학습 시간을 함께 입력하세요.',
    bodySections: [
      '현재 수준과 목표 수준의 격차를 정리한다.',
      '남은 기간을 주 단위로 나눈다.',
      '주차별 학습 범위를 배분한다.',
      '복습 주기를 1일·7일·30일로 배치한다.',
      '진도가 밀렸을 때의 회복 계획을 만든다.',
    ],
    priceKrw: 9000,
    priceUsd: '7.00',
  },
  {
    slug: 'concept-explainer',
    categorySlug: 'study',
    title: '어려운 개념 쉽게 설명 프롬프트',
    summary: '전문 용어를 일상 언어로 바꿔 설명한다.',
    description: '개념을 입력하면 비유, 반례, 흔한 오해 순으로 설명합니다. 이해도를 확인하는 질문을 마지막에 붙입니다.',
    usageGuide: '{{대상}}에 학습자의 배경지식 수준을 적으세요.',
    bodySections: [
      '개념을 한 문장으로 정의한다.',
      '{{대상}}이 이미 아는 것에 빗대어 비유한다.',
      '비유가 깨지는 지점을 명시한다.',
      '흔한 오해 3가지를 반례와 함께 설명한다.',
      '이해도를 확인할 질문 3개를 만든다.',
    ],
    priceKrw: 8000,
    priceUsd: '6.50',
  },
  {
    slug: 'flashcard-generator',
    categorySlug: 'study',
    title: '암기 카드 생성 프롬프트',
    summary: '학습 자료에서 반복 학습용 카드를 뽑는다.',
    description: '교재 텍스트를 입력하면 한 카드에 하나의 개념만 담기도록 분해하고, 헷갈리기 쉬운 항목은 대조 카드로 만듭니다.',
    usageGuide: '카드 개수 상한을 {{제약}}에 적으세요.',
    bodySections: [
      '핵심 개념을 목록으로 추출한다.',
      '카드 하나에 개념 하나만 담기도록 분해한다.',
      '헷갈리는 개념은 대조 카드로 만든다.',
      '정답이 애매한 카드는 표현을 다듬는다.',
      '학습 순서를 난이도 순으로 정렬한다.',
    ],
    priceKrw: 7000,
    priceUsd: '5.50',
  },
  {
    slug: 'reading-note-taker',
    categorySlug: 'study',
    title: '독서 노트 정리 프롬프트',
    summary: '책의 주장과 근거를 구조화해 기록한다.',
    description: '읽은 내용을 입력하면 저자의 주장, 근거, 반론 가능성을 분리해 정리합니다. 내 생각과 인용을 섞지 않도록 구획을 나눕니다.',
    usageGuide: '장 단위로 나눠 입력하면 정리 품질이 높아집니다.',
    bodySections: [
      '저자의 핵심 주장을 한 문장으로 정리한다.',
      '주장을 뒷받침하는 근거를 나열한다.',
      '근거의 약한 지점을 지적한다.',
      '인용문과 내 해석을 구분해 기록한다.',
      '다음에 읽을 자료를 제안한다.',
    ],
    priceKrw: 8000,
    priceUsd: '6.00',
  },
  {
    slug: 'exam-question-predictor',
    categorySlug: 'study',
    title: '출제 예상 문제 생성 프롬프트',
    summary: '학습 범위에서 출제 가능성이 높은 문제를 만든다.',
    description: '범위를 입력하면 개념형, 응용형, 함정형 문제를 균형 있게 만들고 해설을 붙입니다. 정답만 외우지 않도록 오답 근거도 설명합니다.',
    usageGuide: '기출 문제 유형을 함께 입력하면 형식을 맞춰 줍니다.',
    bodySections: [
      '학습 범위에서 출제 빈도가 높은 주제를 고른다.',
      '개념형 문제를 5개 만든다.',
      '응용형 문제를 5개 만든다.',
      '함정형 문제를 3개 만들고 함정 포인트를 설명한다.',
      '모든 문제에 오답 근거를 포함한 해설을 붙인다.',
    ],
    priceKrw: 11000,
    priceUsd: '8.50',
  },
  // ── F1-AC8 검증용: 구매 버튼이 노출되지 않아야 하는 템플릿들 ──
  {
    slug: 'suspended-growth-hacking',
    categorySlug: 'marketing',
    title: '판매 중지된 그로스 해킹 프롬프트',
    summary: '판매가 일시 중지된 템플릿입니다.',
    description: '판매 중지 상태에서 상세 페이지 안내와 구매 버튼 미노출을 검증하기 위한 데이터입니다.',
    usageGuide: '판매가 재개되면 이용할 수 있습니다.',
    bodySections: [
      '실험 가설을 정의한다.',
      '측정 지표를 확정한다.',
      '실험 기간과 표본을 정한다.',
    ],
    priceKrw: 15000,
    priceUsd: '12.00',
    status: TemplateStatus.SUSPENDED,
  },
  {
    slug: 'deleted-legacy-prompt',
    categorySlug: 'writing',
    title: '삭제된 레거시 프롬프트',
    summary: 'soft delete 처리된 템플릿입니다.',
    description: '삭제 후에도 기존 구매자의 라이브러리 열람이 유지되는지 검증하기 위한 데이터입니다.',
    usageGuide: '더 이상 판매하지 않습니다.',
    bodySections: ['옛 버전의 절차를 따른다.', '결과를 기록한다.'],
    priceKrw: 5000,
    priceUsd: '4.00',
    status: TemplateStatus.ON_SALE,
    deleted: true,
  },
  {
    slug: 'draft-upcoming-prompt',
    categorySlug: 'business',
    title: '작성 중인 신규 프롬프트',
    summary: '아직 공개하지 않은 초안입니다.',
    description: 'DRAFT 상태 템플릿이 목록과 검색 결과에 노출되지 않는지 검증하기 위한 데이터입니다.',
    usageGuide: '공개 후 이용할 수 있습니다.',
    bodySections: ['초안 절차 1', '초안 절차 2'],
    priceKrw: 10000,
    priceUsd: '8.00',
    status: TemplateStatus.DRAFT,
  },
];

/** 목록 정렬(published_at DESC)이 결정적으로 검증되도록 1시간 간격으로 발행 시각을 벌린다. */
const PUBLISH_BASE = new Date('2026-07-01T00:00:00.000Z');
const PUBLISH_INTERVAL_MS = 60 * 60 * 1000;

async function main(): Promise<void> {
  const categoryIdBySlug = new Map<string, string>();

  for (const category of CATEGORIES) {
    const saved = await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        nameKo: category.nameKo,
        nameEn: category.nameEn,
        sortOrder: category.sortOrder,
      },
      create: {
        slug: category.slug,
        nameKo: category.nameKo,
        nameEn: category.nameEn,
        sortOrder: category.sortOrder,
      },
      select: { id: true },
    });
    categoryIdBySlug.set(category.slug, saved.id);
  }

  let index = 0;
  for (const seed of TEMPLATES) {
    const categoryId = categoryIdBySlug.get(seed.categorySlug);
    if (!categoryId) {
      throw new Error(`Unknown category slug in seed data: ${seed.categorySlug}`);
    }

    const body = buildBody(seed.title, seed.bodySections);
    // ★저장 시점 마스킹. 런타임에는 preview_text만 읽으므로 원문이 응답 경로에 실릴 수 없다.
    const preview = buildPreview(body);
    const status = seed.status ?? TemplateStatus.ON_SALE;
    const publishedAt =
      status === TemplateStatus.DRAFT ? null : new Date(PUBLISH_BASE.getTime() + index * PUBLISH_INTERVAL_MS);

    const data = {
      categoryId,
      title: seed.title,
      summary: seed.summary,
      description: seed.description,
      usageGuide: seed.usageGuide,
      body,
      previewText: preview.previewText,
      previewCharCount: preview.previewCharCount,
      maskedCharCount: preview.maskedCharCount,
      thumbnailUrl: `/images/templates/${seed.slug}.svg`,
      priceKrw: seed.priceKrw,
      priceUsd: seed.priceUsd,
      status,
      publishedAt,
      // body가 바뀔 때만 갱신되는 값(F3-AC6). 시드는 body를 새로 쓰므로 함께 갱신한다.
      bodyUpdatedAt: new Date(),
      deletedAt: seed.deleted ? new Date() : null,
    };

    await prisma.template.upsert({
      where: { slug: seed.slug },
      update: data,
      create: { slug: seed.slug, ...data },
      select: { id: true },
    });

    index += 1;
  }

  const onSaleCount = await prisma.template.count({
    where: { status: TemplateStatus.ON_SALE, deletedAt: null },
  });

  process.stdout.write(
    `${JSON.stringify({
      message: 'seed_completed',
      categories: CATEGORIES.length,
      templates: TEMPLATES.length,
      onSaleVisible: onSaleCount,
    })}\n`,
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${JSON.stringify({ message: 'seed_failed', error: String(error) })}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
