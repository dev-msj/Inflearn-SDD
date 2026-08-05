/** 정렬 기준 */
export type SortOrder = 'dueAsc' | 'dueDesc';

/** 할 일 단일 항목 */
export interface Todo {
  /** crypto.randomUUID()로 생성한 고유 식별자 */
  id: string;
  /** 할 일 내용. trim 결과 1~100자 */
  title: string;
  /** 완료 여부 */
  completed: boolean;
  /** 마감일. 'YYYY-MM-DD' 또는 미지정 시 null */
  dueDate: string | null;
  /** 등록 순서. 정렬 동점 처리 기준. 1부터 단조 증가 */
  seq: number;
  /** 등록 시각 (ISO 8601) */
  createdAt: string;
  /** 최종 수정 시각 (ISO 8601) */
  updatedAt: string;
}

/** localStorage 저장 스키마 */
export interface TodoStorePayload {
  version: 1;
  todos: Todo[];
}
