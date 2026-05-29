/**
 * v0.15 · /ai-tools · AI 工具集合页
 *
 * 工具入口（已就绪 + 新增 4 个）：
 *   - AI 无缝纹理（已上线）
 *   - AI 无损放大（新）
 *   - AI 一键消除（新）
 *   - AI 一键变色（新）
 *   - AI 产品精修（新）
 *
 * 实现策略：所有新工具走 /api/ai-tools/<slug> 统一接 image-runner（i2i + prompt 模板）
 */

import Link from 'next/link';
import { Wand2, Layers, ArrowRight, Sparkles, Eraser, Palette, Maximize2, PenSquare } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface Tool {
  href: string;
  label: string;
  desc: string;
  status: 'ready' | 'soon';
  icon: React.ReactNode;
}

const TOOLS: Tool[] = [
  {
    href: '/ai-tools/seamless',
    label: 'AI 无缝纹理',
    desc: '上传瓷砖 / 布料 / 大理石等纹理图，自动生成四周可平铺的无缝版本',
    status: 'ready',
    icon: <Layers size={18} aria-hidden />,
  },
  {
    href: '/ai-tools/upscale',
    label: 'AI 无损放大',
    desc: '把模糊或低分辨率图片放大到 2K / 4K，细节增强但不变形',
    status: 'ready',
    icon: <Maximize2 size={18} aria-hidden />,
  },
  {
    href: '/ai-tools/erase',
    label: 'AI 一键消除',
    desc: '上传图后涂抹要去掉的元素（人 / 文字 / 杂物），自动智能填充',
    status: 'ready',
    icon: <Eraser size={18} aria-hidden />,
  },
  {
    href: '/ai-tools/recolor',
    label: 'AI 一键变色',
    desc: '保留物体形状 + 材质，仅替换主色调（衣服 / 包装 / 产品）',
    status: 'ready',
    icon: <Palette size={18} aria-hidden />,
  },
  {
    href: '/ai-tools/retouch',
    label: 'AI 产品精修',
    desc: '上传产品图，自动统一光线 / 阴影 / 反射 / 高光，生成电商级成片',
    status: 'ready',
    icon: <Sparkles size={18} aria-hidden />,
  },
  {
    href: '/ai-tools/prompt-gen',
    label: 'AI 提示词生成器',
    desc: '输入主题 → 生成平台风格英文 prompt × N，复制到 Midjourney / SD / Flux 出图',
    status: 'ready',
    icon: <PenSquare size={18} aria-hidden />,
  },
];

export default function AiToolsPage() {
  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <header className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Wand2 size={18} className="text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <h1 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-100">
            AI 工具
          </h1>
          <span className="text-[11px] text-slate-400 ml-auto">
            {TOOLS.filter((t) => t.status === 'ready').length} 个工具可用
          </span>
        </div>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          快速完成的图片处理工具集合，所有工具共用同一组 image API key 池。
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {TOOLS.map((t) => {
          const inner = (
            <div className="group h-full flex flex-col gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:shadow-md hover:border-brand-300 dark:hover:border-brand-700 transition-all">
              <div className="flex items-center gap-2">
                <span className="text-brand-600 dark:text-brand-400">{t.icon}</span>
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {t.label}
                </h2>
                {t.status === 'soon' && (
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                    即将上线
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {t.desc}
              </p>
              <div className="mt-auto pt-2 flex items-center justify-end text-[11px] text-brand-600 dark:text-brand-400">
                {t.status === 'ready' ? (
                  <>
                    打开工具{' '}
                    <ArrowRight
                      size={12}
                      className="ml-1 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
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
