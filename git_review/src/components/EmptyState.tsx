'use client';

/**
 * EmptyState — 저장소 0개 / 문서 0개 / 산출물 0개 / 빈 저장소 공통 빈 상태
 *
 * 담당 PRD 수용 기준
 *  - 1-4 (엣지): 접근 가능한 저장소가 0개이면 "검증할 저장소가 없습니다" + 다음 행동 안내
 *  - 2-5 (엣지): 산출물 추출 0건이면 "기대 산출물을 찾지 못했습니다" 안내
 *  - 3-6 (엣지): 대상 저장소에 파일이 하나도 없으면 "저장소에 파일이 없습니다" 안내
 *
 * 빈 화면 대신 항상 "무엇이 없는지 + 다음에 무엇을 하면 되는지"를 함께 보여준다.
 */
import { FileQuestionMark, FolderTree, Github, ListChecks, Search, type LucideIcon } from 'lucide-react';

export type EmptyStateVariant =
  | 'no-repos' // 접근 가능한 저장소 0개
  | 'no-search-results' // 검색 결과 0개
  | 'no-documents' // 업로드한 문서 0개
  | 'no-artifacts' // 추출된 기대 산출물 0개
  | 'empty-repo'; // 대상 저장소에 파일 0개

export interface EmptyStateProps {
  variant: EmptyStateVariant;
  /** 기본 제목 대신 표시할 문구 */
  title?: string;
  /** 기본 설명 대신 표시할 문구 */
  description?: string;
  /** 다음 행동 링크(외부 URL). 지정하면 링크 버튼을 노출한다. */
  actionHref?: string;
  /** 다음 행동 버튼 클릭 처리. actionHref가 없을 때 사용한다. */
  onAction?: () => void;
  /** 기본 액션 문구 대신 표시할 텍스트 */
  actionLabel?: string;
  className?: string;
}

interface EmptyStatePreset {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel: string;
}

const EMPTY_STATE_PRESETS: Record<EmptyStateVariant, EmptyStatePreset> = {
  'no-repos': {
    icon: Github,
    title: '검증할 저장소가 없습니다',
    // 읽기 전용을 보장하기 위해 스코프 없는 토큰을 쓰므로 비공개 저장소는 조회되지 않는다.
    description: '이 앱은 공개 저장소만 조회합니다. 비공개 저장소는 목록에 표시되지 않습니다.',
    actionLabel: 'GitHub에서 저장소 확인하기',
  },
  'no-search-results': {
    icon: Search,
    title: '검색 결과가 없습니다',
    description: '저장소명을 포함하는 항목이 없습니다. 검색어를 지우거나 다르게 입력해 보세요.',
    actionLabel: '검색어 지우기',
  },
  'no-documents': {
    icon: FileQuestionMark,
    title: '업로드한 문서가 없습니다',
    description: 'PRD·TECH_SPEC 같은 마크다운(.md) 문서를 업로드하면 기대 산출물을 자동으로 추출합니다.',
    actionLabel: '문서 업로드하기',
  },
  'no-artifacts': {
    icon: ListChecks,
    title: '기대 산출물을 찾지 못했습니다',
    description: '검증할 경로를 직접 추가하면 그대로 검증을 진행할 수 있습니다.',
    actionLabel: '경로 직접 추가하기',
  },
  'empty-repo': {
    icon: FolderTree,
    title: '저장소에 파일이 없습니다',
    description: '대상 저장소에 파일이 하나도 없어 모든 기대 산출물이 "없음"으로 판정됩니다.',
    actionLabel: '다른 저장소 선택하기',
  },
};

const ACTION_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-md border border-brand bg-brand px-4 py-2 text-sm font-semibold text-ink-inverse hover:bg-brand-strong';

export function EmptyState({
  variant,
  title,
  description,
  actionHref,
  onAction,
  actionLabel,
  className,
}: EmptyStateProps) {
  const preset = EMPTY_STATE_PRESETS[variant];
  const Icon = preset.icon;
  const label = actionLabel ?? preset.actionLabel;

  return (
    <div
      className={[
        'flex flex-col items-center gap-3 rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Icon size={32} className="text-ink-muted" aria-hidden="true" />
      <p className="text-base font-semibold text-ink">{title ?? preset.title}</p>
      <p className="max-w-prose text-sm text-ink-muted">{description ?? preset.description}</p>

      {actionHref ? (
        <a className={ACTION_CLASSES} href={actionHref} target="_blank" rel="noopener noreferrer">
          {label}
          <span className="sr-only">(새 탭에서 열림)</span>
        </a>
      ) : null}

      {!actionHref && onAction ? (
        <button className={ACTION_CLASSES} type="button" onClick={onAction}>
          {label}
        </button>
      ) : null}
    </div>
  );
}
