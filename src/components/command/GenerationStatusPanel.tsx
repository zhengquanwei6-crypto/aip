import { AlertTriangle, CheckCircle2, Loader2, RotateCcw } from 'lucide-react';

export type GenerationStatus = 'idle' | 'running' | 'success' | 'error';

const statusConfig = {
  idle: {
    icon: RotateCcw,
    label: '等待指令',
    cls: 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300',
  },
  running: {
    icon: Loader2,
    label: '生成中',
    cls: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/50 dark:text-cyan-300',
  },
  success: {
    icon: CheckCircle2,
    label: '已完成',
    cls: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/50 dark:text-emerald-300',
  },
  error: {
    icon: AlertTriangle,
    label: '需处理',
    cls: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/50 dark:text-amber-300',
  },
};

export default function GenerationStatusPanel({
  status,
  title,
  detail,
}: {
  status: GenerationStatus;
  title: string;
  detail?: string;
}) {
  const cfg = statusConfig[status];
  const Icon = cfg.icon;
  return (
    <div className={`generation-status-panel ${cfg.cls}`}>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-current/10">
          <Icon className={`h-5 w-5 ${status === 'running' ? 'animate-spin' : ''}`} aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="text-xs font-medium opacity-70">{cfg.label}</div>
          <div className="mt-0.5 text-sm font-semibold">{title}</div>
          {detail && <div className="mt-1 line-clamp-2 text-xs opacity-70">{detail}</div>}
        </div>
      </div>
    </div>
  );
}
