'use client';

/**
 * 通用进度条
 *
 *  mode="determinate"   显示百分比（value/max）
 *  mode="indeterminate" 左右无限滑动
 *
 * 视觉：高 6px，圆角 full；下方左对齐 label，右对齐 elapsed/eta（mm:ss）。
 */

interface ProgressBarProps {
  mode: 'indeterminate' | 'determinate';
  value?: number;
  max?: number;
  label?: string;
  /** 已用时（秒），自动渲染为 mm:ss */
  elapsed?: number;
  /** 预计剩余（秒），不确定模式下自动显示 "~" */
  eta?: number;
  className?: string;
}

function fmtSec(sec: number | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '–';
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function ProgressBar({
  mode,
  value = 0,
  max = 100,
  label,
  elapsed,
  eta,
  className = '',
}: ProgressBarProps) {
  const pct =
    mode === 'determinate'
      ? Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0))
      : 0;

  const elapsedText = fmtSec(elapsed);
  const etaText = mode === 'indeterminate' ? '~' : fmtSec(eta);

  return (
    <div className={'w-full ' + className}>
      <div
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800"
        role="progressbar"
        aria-valuenow={mode === 'determinate' ? Math.round(pct) : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        {mode === 'indeterminate' ? (
          <span
            className="absolute inset-y-0 w-1/3 rounded-full bg-brand-600 dark:bg-brand-500 animate-progress-indeterminate"
          />
        ) : (
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-brand-600 dark:bg-brand-500 transition-[width] duration-200 ease-out"
            style={{ width: pct + '%' }}
          />
        )}
      </div>

      {(label || elapsed != null || eta != null) && (
        <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          <span className="truncate">{label ?? ''}</span>
          <span className="flex-shrink-0">
            {elapsed != null ? elapsedText : '–'}
            {' / '}
            {etaText}
          </span>
        </div>
      )}
    </div>
  );
}
