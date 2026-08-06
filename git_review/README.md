# SDD 대시보드

진행 중인 프로젝트가 SDD를 제대로 따르고 있는지 모니터링 할 수 있는 웹 구현.

1. Github OAuth 로그인
2. Repo 선택 + 파일 트리
3. PRD, TECH-SPEC 업로드
4. SDD 준수 검증 리포트

## 구현 절차

1. `/sdd-init`으로 todolist 프로젝트를 초기화하여 필요한 파일과 디렉토리를 생성
2. `/sdd-plan  github 로그인하면 내 repo의 sdd 준수 여부를 검증해주는 대시보드 만들어줘. sdd 파일은 사용자가 별도로 업로드 해줄거야.` 요청
   1. 간단한 클로드 질문들에 답변하여 요구사항을 정의
   2. sdd-toolkit의 plannder 에이전트가 PRD 문서 산출
3. `/sdd-design` 요청
   1. sdd-toolkit의 architect 에이전트가 PRD 문서를 기반으로 TECH SPEC 문서 산출
4. `/sdd-build` 요청
   1. sdd-toolkit의 developer 에이전트가 TECH SPEC 문서를 기반으로 코드를 생성
5. `/sdd-review` 요청
   1. sdd-toolkit의 reviewer 에이전트가 PRD, TECH SPEC 문서를 기반으로 코드를 리뷰
6. 실제 코드를 실행하여 동작 확인