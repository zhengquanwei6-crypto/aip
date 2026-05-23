/**
 * <EmptyState> — 通用空态组件
 *
 * v0.11 B4 抽取：
 *   dashboard B3 的 TodayTasksList / RecentAIOutputs 已实现简易空态，
 *   本组件供 B5 整合页 / B7 待补的空态统一复用。
 *
 * 用法：
 *   <EmptyState
 *     icon={<Inbox className="w-6 h-6" />}
 *     title="还没有任务"
 *     description="点下面按钮新建第一条"
 *     action={{ label: '新建任务', href: '/today' }}
 *   />
 *
 * exactOptionalPropertyTypes 兼容：
 *   icon / description / action 都是 optional，且当 action 存在时 href 与 onClick 互斥可选。
 *   不会传 `action: undefined`，组件内部的判断自然成立。
 */

import type { ReactNode } from 'react';
import Link from 'next/link';

export interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  /** 可选额外 className，套在外层 wrapper 上 */
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={
        'flex flex-col items-center justify-center text-center px-4 py-10 ' +
        (className ?? '')
      }
    >
      {icon && (
        <div
          className="mb-3 inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {title}
      </div>
      {description && (
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm">
          {description}
        </div>
      )}
      {action && (
        <div className="mt-4">
          {action.href ? (
            <Link href={action.href} className="btn-primary">
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="btn-primary"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default EmptyState;
