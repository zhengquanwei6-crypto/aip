/**
 * v0.13 B4 · /ai-tools · AI 工具集合页（路由分发）
 *
 * 当前仅 1 个工具：无缝纹理（/ai-tools/seamless）。
 * 将来可在此页加入更多 AI 快捷工具：去背景 / 抠图 / 拼图 / 局部重绘 等。
 */

import Link from 'next/link';
import { Wand2, Layers, ArrowRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface Tool {
  href: string;
  label: string;
  desc: string;
  status: 'ready' | 'soon';
}

const TOOLS: Tool[] = [
  {
    href: '/ai-tools/seamless',
    label: 'AI 无缝纹理',
    desc: '上传瓷砖 / 布料 / 大理石等纹理图，自动生成四周可平铺的无缝版本，变动最小。',
    status: 'ready',
  },
  // 将来加：
  // { href: '/ai-tools/remove-bg', label: 'AI 去背景',    desc: '一键扣除背景生成透明 PNG',  status: 'soon' },
  // { href: '/ai-tools/upscale',   label: 'AI 高清放大',  desc: '低分辨率图无损放大到 4K',   status: 'soon' },
];

export default function AiToolsPage() {
  return (
    <div className="space-y-4 px-4 sm:px-6 py-3 sm:py-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <Wand2 size={20} className="text-brand-600 dark:text-brand-400" aria-hidden="true" />
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-50">
          AI 工具
        </h1>
        <span className="text-xs text-slate-400 dark:text-slate-500 ml-2">
          快速完成的 AI 小工具集合
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {TOOLS.map((t) => {
          const inner = (
            <div
              data-v013-b4-tool={t.href}
              className="group flex flex-col gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:shadow-md hover:border-brand-300 dark:hover:border-brand-700 transition-all"
            >
              <div className="flex items-center gap-2">
                <Layers
                  size={16}
                  className="text-brand-600 dark:text-brand-400"
                  aria-hidden="true"
                />
                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                  {t.label}
                </h2>
                {t.status === 'soon' && (
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                    敬请期待
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {t.desc}
              </p>
              <div className="mt-auto flex items-center justify-end text-[11px] text-brand-600 dark:text-brand-400">
                {t.status === 'ready' ? (
                  <>
                    打开工具 <ArrowRight size={12} className="ml-1" aria-hidden="true" />
                  </>
                ) : (
                  '即将上线'
                )}
              </div>
            </div>
          );
          return t.status === 'ready' ? (
            <Link key={t.href} href={t.href} className="block">
              {inner}
            </Link>
          ) : (
            <div key={t.href} className="cursor-not-allowed opacity-60">
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
