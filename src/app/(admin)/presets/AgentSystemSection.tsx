import Link from 'next/link';
import { Bot, ExternalLink } from 'lucide-react';

/**
 * v0.11 B5 · /presets?tab=agent 占位
 *
 * 本批 (v0.11 B5) 不真实施：v0.9.2 b2 路线图原文「agent 模板独立化」会把
 * photo-director / publish-director 的 systemPrompt 搬到 Setting `prompt:agent:*:system`，
 * 届时这里会渲染真编辑器。当前先给一个清晰的「在哪、怎么用」提示卡，
 * 让用户进入此 tab 不会以为「页面坏了」。
 */
export default function AgentSystemSection() {
  return (
    <div className="card">
      <div className="card-body space-y-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-9 h-9 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 inline-flex items-center justify-center">
            <Bot size={18} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-800 dark:text-slate-100">
              Agent System Prompt 编辑器
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              v0.11 之后规划（v0.9.2 b2 主线）· 当前仅占位
            </div>
          </div>
        </div>

        <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          v0.9.2 b1 已经把生成路由的 <code className="font-mono text-xs px-1 rounded bg-slate-100 dark:bg-slate-800">
            content
          </code>
          /
          <code className="font-mono text-xs px-1 rounded bg-slate-100 dark:bg-slate-800">
            image
          </code>
          /
          <code className="font-mono text-xs px-1 rounded bg-slate-100 dark:bg-slate-800">
            suggestion
          </code>{' '}
          类模板接进 Setting 表（前缀 <code className="font-mono text-xs px-1 rounded bg-slate-100 dark:bg-slate-800">prompt:</code>），可在「文案模板」tab 编辑、与默认 diff。
          下一步（v0.9.2 b2）会把 8 个 agent（含 photo-director / publish-director）的 system prompt 也搬到 Setting 表，
          届时此处会列出每个 agent 的可编辑 system 块 + 默认 vs 当前的双栏 diff。
        </div>

        <div className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 text-xs space-y-2">
          <div className="font-medium text-slate-700 dark:text-slate-200">在那之前可以这样改 agent 行为：</div>
          <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
            <li>
              切到「文案模板」tab，覆盖 <code className="font-mono px-1 rounded bg-white dark:bg-slate-900">xiaohongshu:case</code> /
              <code className="font-mono px-1 rounded bg-white dark:bg-slate-900">image:suggest</code> 等 6 个内置模板
            </li>
            <li>
              在
              <Link
                href="/adapters"
                className="text-brand-600 dark:text-brand-300 hover:underline inline-flex items-center gap-0.5 ml-1"
              >
                /adapters <ExternalLink size={11} aria-hidden="true" />
              </Link>{' '}
              修改图片 adapter 的 styleKeywords / negativePrompt 默认值
            </li>
            <li>
              通过
              <Link
                href="/settings"
                className="text-brand-600 dark:text-brand-300 hover:underline inline-flex items-center gap-0.5 ml-1"
              >
                /settings <ExternalLink size={11} aria-hidden="true" />
              </Link>{' '}
              切换 LLM / IMAGE 池中的不同 key（B1 多 key 池）
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
