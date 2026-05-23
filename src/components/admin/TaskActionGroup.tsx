'use client';

import { useRef } from 'react';
import Link from 'next/link';
import {
  Send,
  Target,
  ChevronDown,
  PencilLine,
  Image as ImageIcon,
} from 'lucide-react';
import { TASK_STATUSES } from '@/lib/constants';

/**
 * v0.11 B7 · TaskActionGroup 抽出独立文件
 *
 * 历史：原内嵌于 src/app/(admin)/today/TodayTasksClient.tsx 行 387-（约 130 行），
 *      与父组件耦合 5 处 props。recon §九 #M21 标 medium「TaskActionGroup 应抽出」。
 *      本批升 medium → severe（"必须做的代码债"），抽到 src/components/admin/TaskActionGroup.tsx。
 *
 * 用途：/today（桌面）任务卡上的「主操作 + 更多 + 状态」按钮组。
 *
 * 主按钮: 🎯 全流程发布（publish-director）
 * 更多按钮（▾）: 编辑任务详情 / 生成文案 / 生成图片 / 标记为已发布
 * 状态下拉: 仍保留（4 个状态可手改）
 *
 * 不破坏:
 *   - 0 schema 改动
 *   - exactOptionalPropertyTypes 安全：所有 props 标注完整类型
 *   - props 签名与 v0.11 B5 内嵌实现完全一致，调用方仅改 import 路径
 */

export interface TaskRowLite {
  id: string;
  publishTime: string;
  status: string;
}

export interface TaskActionGroupProps {
  task: TaskRowLite;
  isLoading: boolean;
  loadingAction: string;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onPubDirector: () => void;
  onGenerateContent: () => void;
  onGenerateImage: () => void;
  onSetStatus: (v: string) => void;
}

export default function TaskActionGroup({
  task,
  isLoading,
  loadingAction,
  menuOpen,
  onToggleMenu,
  onPubDirector,
  onGenerateContent,
  onGenerateImage,
  onSetStatus,
}: TaskActionGroupProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
      data-task-menu
      className="flex items-center gap-1.5 flex-wrap relative"
      ref={menuRef}
    >
      {/* 主动作：🎯 全流程发布（publish-director） */}
      <button
        type="button"
        onClick={onPubDirector}
        disabled={isLoading}
        className="text-xs px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-900/60 inline-flex items-center gap-1 disabled:opacity-50"
        title="用 publish-director 一次性产出文案+图片，并反写 task"
      >
        <Target size={12} aria-hidden="true" />
        🎯 全流程发布
      </button>

      {/* 更多操作下拉：编辑 / 文案 / 图片 / 发布 */}
      <button
        type="button"
        onClick={onToggleMenu}
        disabled={isLoading}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className="btn-secondary text-xs px-2 py-1 inline-flex items-center gap-1"
        title="更多操作"
      >
        更多
        <ChevronDown size={12} aria-hidden="true" />
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-20 w-44 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1 text-sm"
        >
          <Link
            href={`/calendar/${dayOfWeekFromTime(task.publishTime)}/task/${task.id}`}
            className="block px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
            role="menuitem"
            onClick={onToggleMenu}
          >
            <PencilLine size={12} className="inline mr-1.5 -mt-0.5" aria-hidden="true" />
            编辑任务详情
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={onGenerateContent}
            disabled={isLoading}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-slate-700 dark:text-slate-200"
          >
            <PencilLine size={12} className="inline mr-1.5 -mt-0.5" aria-hidden="true" />
            {isLoading && loadingAction === 'content' ? '生成中…' : '生成文案'}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={onGenerateImage}
            disabled={isLoading}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-slate-700 dark:text-slate-200"
          >
            <ImageIcon size={12} className="inline mr-1.5 -mt-0.5" aria-hidden="true" />
            {isLoading && loadingAction === 'image' ? '生成中…' : '生成图片'}
          </button>
          <div className="border-t border-slate-100 dark:border-slate-800 my-1" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onSetStatus('published');
              onToggleMenu();
            }}
            disabled={isLoading}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-emerald-700 dark:text-emerald-300"
          >
            <Send size={12} className="inline mr-1.5 -mt-0.5" aria-hidden="true" />
            标记为已发布
          </button>
        </div>
      )}

      <select
        value={task.status}
        disabled={isLoading}
        onChange={(e) => onSetStatus(e.target.value)}
        className="input text-xs py-1 w-24"
        aria-label="任务状态"
      >
        {TASK_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * v0.11 B5：从 publishTime（"HH:MM"）反推 dayOfWeek 是无解的（task 没存 dow），
 * 所以这里取「今日 dow」作为 deeplink — 因为整个 /today 页面就是「今日」context。
 * 用 native Date 算（与 lib/date.todayDayOfWeek 等价：周一=1, 周日=7，与 schedule 表一致）。
 */
function dayOfWeekFromTime(_publishTime: string): number {
  const d = new Date();
  const js = d.getDay(); // 0..6, Sunday=0
  return js === 0 ? 7 : js;
}
