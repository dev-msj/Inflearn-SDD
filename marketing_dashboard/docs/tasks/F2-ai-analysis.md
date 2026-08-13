# F2 — Gemini 기반 활동 분석

> 출처: docs/TECH_SPEC.md 「구현 슬라이스 계획」 / 대응 PRD 기능: 기능 2 (AC-2.1 ~ AC-2.8)
> 선행 슬라이스: F0, F1 (완료 필요)
> 완료 게이트: `npx tsc --noEmit && npm run lint && npx vitest run src/lib/__tests__/prompts.test.ts`
> 추가 수동 확인(선택): 세션 쿠키로 `POST /api/analyze`에 F1 응답을 그대로 전달 → `analysisResultSchema`를 만족하는 한국어 JSON 반환
> 내부 순서: 프롬프트 → 라우트 → 훅 → 컴포넌트 → 테스트
> 파일 완성 시 즉시 체크. 일괄 체크 금지. 이 문서에 없는 파일 생성 금지.

## 체크리스트 (5항목)

- [x] `src/lib/prompts/analysis.ts` — `buildAnalysisPrompt()`(Q2 상한 적용·한국어·근거 강제 지시) + `ANALYSIS_RESPONSE_SCHEMA` (의존: types/domain.ts@F0, lib/constants.ts@F0) (AC-2.2, AC-2.3, AC-2.4)
- [x] `src/app/api/analyze/route.ts` — 세션 검증 → 본문 스키마 검증 → 0건 가드 → `generateStructured` → `{ analysis }` (타임아웃·실패 코드 분류) (의존: lib/session.ts·lib/gemini.ts·lib/api-error.ts@F0, lib/prompts/analysis.ts) (AC-2.1, AC-2.5, AC-2.6, AC-2.7)
- [x] `src/hooks/useAnalysis.ts` — `POST /api/analyze` 호출·상태 전이. 실패해도 activity 상태 불변, 성공 시 결과 교체 (의존: DashboardProvider.tsx@F0, types/api.ts@F0) (AC-2.6, AC-2.8)
- [x] `src/components/AnalysisPanel.tsx` — 분석/다시 분석 버튼(비활성 조건) + 요약·하이라이트(근거 칩)·인사이트 렌더 + 소량 활동 안내 + 오류/재시도 (의존: useAnalysis.ts, ui/Card.tsx·ui/Button.tsx·ui/Spinner.tsx·ui/ErrorNotice.tsx@F0) (AC-2.1, AC-2.2, AC-2.3, AC-2.5, AC-2.6, AC-2.8)
- [x] `src/lib/__tests__/prompts.test.ts` — 커밋 101건 입력 시 프롬프트에 100건만 포함, PR·이슈 전체 포함, 스타는 저장소명만, 한국어·근거 지시 문자열 포함 검증 (의존: lib/prompts/analysis.ts) (AC-2.2, AC-2.3, AC-2.4)

## 참조할 TECH_SPEC 절

- 「0. 설계 전제」 Q2(AI 투입 상한: 커밋 100건/PR·이슈 전체/스타는 저장소명만), Q3(2단계 유지), Q6(소량 활동 안내)
- 「3. 구현 명세 > 기능 2: Gemini API 기반 활동 분석 요약」 전체
  - 2-A. 도메인 타입 (`analysisResultSchema`)
  - 2-B. Gemini 래퍼 (`generateStructured` — F0 소유, 여기서는 호출만)
  - 2-C. 프롬프트 — 투입 범위 표 + 반드시 포함할 지시 5개
  - 2-D. `POST /api/analyze` 명세 표
  - 2-E. UI — `useAnalysis`, `AnalysisPanel`
  - 「수용 기준 매핑 (F2)」 표
- 「4.1 오류 코드 → 사용자 메시지」 (`AI_TIMEOUT`, `AI_ERROR`)
- 「5. API 명세」의 `/api/analyze` 행 + 공통 규약

## 수용 기준 매핑

| PRD 수용 기준 | 담당 파일 |
|---|---|
| AC-2.1 분석 실행 조건 | `src/app/api/analyze/route.ts`, `src/components/AnalysisPanel.tsx` |
| AC-2.2 결과 구성 요소 | `src/lib/prompts/analysis.ts`, `src/components/AnalysisPanel.tsx`, `src/lib/__tests__/prompts.test.ts` |
| AC-2.3 근거 추적성 | `src/lib/prompts/analysis.ts`, `src/components/AnalysisPanel.tsx`, `src/lib/__tests__/prompts.test.ts` |
| AC-2.4 한국어 출력 | `src/lib/prompts/analysis.ts`, `src/lib/__tests__/prompts.test.ts` |
| AC-2.5 타임아웃 | `src/app/api/analyze/route.ts`, `src/components/AnalysisPanel.tsx` |
| AC-2.6 AI 오류 처리 | `src/app/api/analyze/route.ts`, `src/hooks/useAnalysis.ts`, `src/components/AnalysisPanel.tsx` |
| AC-2.7 키 비노출 | `src/app/api/analyze/route.ts` (Gemini 호출은 서버 핸들러 내부에만) |
| AC-2.8 재분석 | `src/hooks/useAnalysis.ts`, `src/components/AnalysisPanel.tsx` |
