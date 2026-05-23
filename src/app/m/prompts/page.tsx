// /m/prompts · v0.9 b3 移动端 Prompt 模板库（只读 + 跳桌面编辑）
import Link from 'next/link';
import { listPromptTemplates } from '@/lib/ai/prompts';

export const dynamic = 'force-dynamic';

export default async function MPromptsPage() {
  const list = await listPromptTemplates();

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-white border border-slate-200 p-3">
        <div className="font-semibold text-slate-800">Prompt 模板库</div>
        <div className="text-xs text-slate-500 mt-1 leading-relaxed">
          移动端只读视图。点底部链接到桌面版编辑（保存到 Setting 表 prompt:* 前缀）。
        </div>
      </div>

      <div className="text-xs text-slate-500 px-1">共 {list.length} 条</div>

      {list.map(({ key, source, tpl }) => (
        <div
          key={key}
          className="rounded-xl bg-white border border-slate-200 overflow-hidden"
        >
          <div className="px-3 py-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="badge-gray font-mono text-[11px]">{key}</span>
              <span
                className={
                  source === 'custom' ? 'badge-blue' : 'badge-gray'
                }
              >
                {source === 'custom' ? '自定义' : '默认'}
              </span>
            </div>

            <div className="text-sm font-medium text-slate-800">
              {tpl.name}
            </div>
            <div className="text-xs text-slate-600 leading-relaxed">
              {tpl.description}
            </div>

            <details className="text-xs">
              <summary className="cursor-pointer text-slate-500">
                查看 system prompt（{tpl.system.length} 字符）
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-words bg-slate-50 rounded p-2 text-[11px] text-slate-700 leading-relaxed">
                {tpl.system}
              </pre>
            </details>

            <details className="text-xs">
              <summary className="cursor-pointer text-slate-500">
                查看 user template（{tpl.user.length} 字符）
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-words bg-slate-50 rounded p-2 text-[11px] text-slate-700 leading-relaxed">
                {tpl.user}
              </pre>
            </details>

            {tpl.vars.length > 0 && (
              <div className="text-xs text-slate-600">
                变量：
                {tpl.vars.map((v) => (
                  <span
                    key={v.key}
                    className="inline-block ml-1 mt-1 px-1.5 py-0.5 rounded bg-slate-100 font-mono"
                  >
                    {`{{${v.key}}}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      <Link
        href="/prompts"
        className="block w-full rounded-lg bg-amber-100 text-amber-800 text-center py-3 font-medium active:bg-amber-200"
      >
        🖥 切换到桌面版「编辑模板」 →
      </Link>

      <div className="text-xs text-slate-400 text-center px-3 leading-relaxed">
        说明：当前 generate 路径仍使用硬编码 prompt（v0.9 b4 路线图项），
        编辑后保存到 Setting 表，但暂未参与 LLM 调用。
      </div>
    </div>
  );
}
