/**
 * v0.11 B15.7 · Dashboard 磁盘警告卡（BUG-L12 闭环）
 *
 * 条件渲染：rootPercent ≥ 85 时显示。
 * 文案 = 「磁盘紧张，去 /docs/08 看清理建议」+ uploads 用量摘要。
 *
 * 任务定义里要求：
 *   - 警告卡 data-test marker：data-b15-7-disk-warning
 *   - 链接到 /docs/08-backup（B15.7 新加的「💾 磁盘清理 (v0.11 B15.7)」节）
 */
'use client';

import { HardDrive } from 'lucide-react';
import Link from 'next/link';
import type { DashboardSummaryDiskUsage } from '@/app/api/dashboard/summary/aggregate';

const WARN_THRESHOLD = 85; // %

export interface DiskWarningCardProps {
  diskUsage: DashboardSummaryDiskUsage;
}

function fmtMB(bytes: number | null): string {
  if (bytes == null) return '—';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function fmtGB(bytes: number | null): string {
  if (bytes == null) return '—';
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
}

export default function DiskWarningCard({ diskUsage }: DiskWarningCardProps) {
  const { rootPercent, rootBytes, rootUsedBytes, uploadsBytes, uploadsCount } =
    diskUsage;

  // 不显示：rootPercent 读不到 OR 低于阈值
  if (rootPercent == null || rootPercent < WARN_THRESHOLD) {
    return null;
  }

  return (
    <section
      data-b15-7-disk-warning
      aria-label="磁盘警告"
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 sm:p-5 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <div className="flex items-start gap-3">
        <div
          className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 shrink-0"
          aria-hidden
        >
          <HardDrive className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm sm:text-base font-semibold">
            磁盘紧张（已用{' '}
            <span className="tabular-nums font-bold">{rootPercent}%</span>
            ） · BUG-L12 (v0.11 B15.7)
          </h2>
          <p className="mt-1 text-xs sm:text-sm leading-relaxed text-amber-800 dark:text-amber-300">
            容器根分区使用率 ≥ {WARN_THRESHOLD}%，去{' '}
            <Link
              href="/docs/08-backup"
              className="underline decoration-amber-500 underline-offset-2 hover:text-amber-700 dark:hover:text-amber-100"
            >
              /docs/08-backup §「💾 磁盘清理 (v0.11 B15.7)」
            </Link>{' '}
            看清理建议。手动跑 dry-run（容器内）：
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-amber-100/60 px-3 py-2 text-[11px] sm:text-xs text-amber-950 dark:bg-amber-900/40 dark:text-amber-100">
            docker exec design-ai-ops node /app/scripts/cleanup-assets.mjs
          </pre>
          <ul className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-1 text-xs text-amber-800 dark:text-amber-300">
            <li>
              根分区:{' '}
              <span className="tabular-nums font-medium">
                {fmtGB(rootUsedBytes)} / {fmtGB(rootBytes)}
              </span>
            </li>
            <li>
              uploads 累计:{' '}
              <span className="tabular-nums font-medium">
                {fmtMB(uploadsBytes)}
              </span>
            </li>
            <li>
              uploads 文件数:{' '}
              <span className="tabular-nums font-medium">
                {uploadsCount ?? '—'}
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
