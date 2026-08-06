/**
 * StatusBadge — 아이콘 + 텍스트 + 색상 3중 표기 배지
 *
 * 담당 PRD 수용 기준
 *  - 접근성 2항: 판정 결과(PASS/FAIL)와 항목 상태(존재/없음)는 색상뿐 아니라 텍스트와 아이콘으로도 구분된다.
 *  - 3-1 / 3-2: 존재·없음, PASS·FAIL 표기의 단일 창구
 *  - 1-2: 저장소 공개/비공개 여부 표시
 *
 * 색상만으로 의미를 전달하지 않기 위해 label 텍스트는 항상 렌더한다.
 * (아이콘은 aria-hidden 처리하여 스크린리더가 중복 낭독하지 않도록 한다)
 */
import {
  CaseSensitive,
  CircleCheck,
  CircleQuestionMark,
  CircleX,
  File,
  Folder,
  Globe,
  Info,
  Lock,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';

export type StatusBadgeVariant =
  | 'present' // 산출물 존재
  | 'missing' // 산출물 없음
  | 'pass' // 준수율 기준 충족
  | 'fail' // 준수율 기준 미달
  | 'private' // 비공개 저장소
  | 'public' // 공개 저장소
  | 'file' // 산출물 종류: 파일
  | 'directory' // 산출물 종류: 폴더
  | 'unknown' // 산출물 종류: 판정 불가
  | 'case-mismatch' // 대소문자만 다른 경로로 매칭됨
  | 'warning'
  | 'info'
  | 'neutral';

export type StatusBadgeSize = 'sm' | 'md';

export interface StatusBadgeProps {
  variant: StatusBadgeVariant;
  /** 기본 문구 대신 표시할 텍스트 */
  label?: string;
  size?: StatusBadgeSize;
  className?: string;
}

interface BadgePreset {
  icon: LucideIcon;
  label: string;
  tone: string;
}

/** 배지 종류별 아이콘·기본 문구·색상 정의 (색상은 globals.css 토큰만 사용) */
const BADGE_PRESETS: Record<StatusBadgeVariant, BadgePreset> = {
  present: {
    icon: CircleCheck,
    label: '존재',
    tone: 'border-success bg-success-surface text-success',
  },
  missing: {
    icon: CircleX,
    label: '없음',
    tone: 'border-danger bg-danger-surface text-danger',
  },
  pass: {
    icon: ShieldCheck,
    label: 'PASS',
    tone: 'border-success bg-success-surface text-success',
  },
  fail: {
    icon: ShieldAlert,
    label: 'FAIL',
    tone: 'border-danger bg-danger-surface text-danger',
  },
  private: {
    icon: Lock,
    label: '비공개',
    tone: 'border-line bg-surface-muted text-ink-muted',
  },
  public: {
    icon: Globe,
    label: '공개',
    tone: 'border-line bg-surface-muted text-ink-muted',
  },
  file: {
    icon: File,
    label: '파일',
    tone: 'border-line bg-surface-muted text-ink-muted',
  },
  directory: {
    icon: Folder,
    label: '폴더',
    tone: 'border-line bg-surface-muted text-ink-muted',
  },
  unknown: {
    icon: CircleQuestionMark,
    label: '종류 미상',
    tone: 'border-line bg-surface-muted text-ink-muted',
  },
  'case-mismatch': {
    icon: CaseSensitive,
    label: '대소문자 불일치',
    tone: 'border-warning bg-warning-surface text-warning',
  },
  warning: {
    icon: TriangleAlert,
    label: '주의',
    tone: 'border-warning bg-warning-surface text-warning',
  },
  info: {
    icon: Info,
    label: '안내',
    tone: 'border-info bg-info-surface text-info',
  },
  neutral: {
    icon: Info,
    label: '정보',
    tone: 'border-line bg-surface-muted text-ink-muted',
  },
};

const SIZE_CLASSES: Record<StatusBadgeSize, string> = {
  sm: 'gap-1 px-2 py-0.5 text-xs',
  md: 'gap-1.5 px-2.5 py-1 text-sm',
};

const ICON_SIZE: Record<StatusBadgeSize, number> = {
  sm: 14,
  md: 16,
};

export function StatusBadge({ variant, label, size = 'sm', className }: StatusBadgeProps) {
  const preset = BADGE_PRESETS[variant];
  const Icon = preset.icon;
  const text = label ?? preset.label;

  return (
    <span
      className={[
        'inline-flex shrink-0 items-center rounded-full border font-medium whitespace-nowrap',
        SIZE_CLASSES[size],
        preset.tone,
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Icon size={ICON_SIZE[size]} aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
}
