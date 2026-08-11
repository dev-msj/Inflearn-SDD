# SDD 대시보드

진행 중인 프로젝트가 SDD를 제대로 따르고 있는지 모니터링 할 수 있는 웹 구현.

1. Github OAuth 로그인
2. Repo 선택 + 파일 트리
3. PRD, TECH-SPEC 업로드
4. SDD 준수 검증 리포트

## 구현 절차

1. `/sdd-init`으로 todolist 프로젝트를 초기화하여 필요한 파일과 디렉토리를 생성
2. `/sdd-toolkit:sdd-plan ai 프롬프트 템플릿을 판매하는 스토어를 만들어줘. 결제는 토스 페이먼츠랑 패들(해외 결제)를 붙일거야.` 요청
   1. 간단한 클로드 질문들에 답변하여 요구사항을 정의
   2. sdd-toolkit의 plannder 에이전트가 PRD 문서 산출
3. `/sdd-design` 요청
   1. sdd-toolkit의 architect 에이전트가 PRD 문서를 기반으로 TECH SPEC 문서 산출
4. `/sdd-build` 요청
   1. sdd-toolkit의 developer 에이전트가 TECH SPEC 문서를 기반으로 코드를 생성
5. `/sdd-review` 요청
   1. sdd-toolkit의 reviewer 에이전트가 PRD, TECH SPEC 문서를 기반으로 코드를 리뷰
6. 실제 코드를 실행하여 동작 확인

## 회고

강의 내용 자체는 그냥 스킬 워크플로우를 거치는 것만 보여준다.
SDD를 입문하기에는 좋은 예제이지만, 실무에서 사용하기에는 허점이 많다.

다만 이번 프로젝트에서 feature 단위로 plan 모드로 작업 계획을 작성하고,
이를 기반으로 task 문서에 체크리스트를 작성하여 작업을 진행하게 했다.
이 방식은 불필요하게 plan 모드 진입이 많아서 토큰 소모량이나 구현 시간이 지나치게 많았다.
차라리 plan 모드가 전체 작업 계획을 작성하고, feature 단위로 task 문서를 작성하여 작업을 진행하는 방식이 더 효율적일 것 같다.
