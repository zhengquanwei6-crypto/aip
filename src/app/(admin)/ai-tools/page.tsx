import Link from 'next/link';
import {
  ArrowRight,
  Cpu,
  Eraser,
  Image as ImageIcon,
  Layers,
  Maximize2,
  MessageSquareText,
  Palette,
  PlayCircle,
  Sparkles,
  Wand2,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

const PRIMARY_FLOWS = [
  {
    href: '/ai-tools/prompt-gen',
    title: '提示词工坊',
    desc: '把自然语言需求整理成可复用的图片提示词和风格路线。',
    icon: MessageSquareText,
    meta: 'Brief → Prompt',
  },
  {
    href: '/playground?tab=image',
    title: '模型测试台',
    desc: '在受控环境里测试 LLM、图片模型和 Agent 调用。',
    icon: PlayCircle,
    meta: 'Model Lab',
  },
  {
    href: '/ai-tools/comfy',
    title: 'ComfyUI 工作流',
    desc: '执行远端高级工作流，支持模板填充和进度追踪。',
    icon: Cpu,
    meta: 'Workflow',
  },
] as const;

const IMAGE_TOOLS = [
  {
    href: '/ai-tools/seamless',
    label: '无缝纹理',
    desc: '把材质、表面和图案处理成可平铺纹理。',
    icon: Layers,
  },
  {
    href: '/ai-tools/upscale',
    label: '高清放大',
    desc: '提升低分辨率图片，适合交付和复用。',
    icon: Maximize2,
  },
  {
    href: '/ai-tools/erase',
    label: '元素擦除',
    desc: '移除多余人物、文字和物体。',
    icon: Eraser,
  },
  {
    href: '/ai-tools/recolor',
    label: '局部换色',
    desc: '保留材质和形状，同时修改颜色方案。',
    icon: Palette,
  },
  {
    href: '/ai-tools/retouch',
    label: '产品精修',
    desc: '清理光影、反射、阴影和产品质感。',
    icon: Sparkles,
  },
] as const;

export default function AiToolsPage() {
  return (
    <div className="page-shell">
      <section className="grid gap-5 lg:grid-cols-[1fr_0.86fr]">
        <div className="command-panel p-6 sm:p-7">
          <div className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300">
            <Wand2 className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
            创作模块
          </div>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-none text-white sm:text-5xl">
            从想法到图片资产，只保留一条清晰路径。
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-300">
            旧工具页已经收束到创作中枢。先生成提示词，再生成或编辑图片，最后沉淀到资产库。
          </p>
          <Link href="/playground?tab=image" className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-cyan-300/30 bg-cyan-300/10 p-3 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/60 hover:bg-cyan-300/20">
            <span>
              <span className="block text-sm font-black text-white">GPT IMG 2 Studio</span>
              <span className="mt-1 block text-xs text-cyan-100/80">Prompt -&gt; Model -&gt; Render -&gt; Asset</span>
            </span>
            <ArrowRight className="h-4 w-4 text-cyan-100" aria-hidden />
          </Link>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/playground?tab=image" className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-slate-950 hover:-translate-y-0.5 hover:bg-cyan-50">
              Open GPT IMG 2
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/assets" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 px-4 py-2.5 text-sm font-medium text-white hover:border-white/30 hover:bg-white/5">
              查看资产
              <ImageIcon className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>

        <div className="surface-elevated p-4">
          <div className="mb-3 text-xs font-semibold text-slate-400">
            创作主流程
          </div>
          <div className="space-y-3">
            {PRIMARY_FLOWS.map((flow, index) => {
              const Icon = flow.icon;
              return (
                <Link
                  key={flow.href}
                  href={flow.href}
                  className="kinetic-card hover-lift group flex gap-3 p-3"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                    <Icon className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-950 dark:text-white">{flow.title}</div>
                      <span className="text-[11px] text-slate-400">0{index + 1}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{flow.desc}</p>
                    <div className="mt-2 text-[11px] font-medium text-cyan-600">{flow.meta}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="surface overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-slate-200 p-4 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="page-kicker">图片操作</div>
            <h2 className="mt-1 text-lg font-semibold leading-tight text-slate-950 dark:text-white">
              用于交付前清理和二次加工
            </h2>
          </div>
          <div className="text-xs text-slate-500">{IMAGE_TOOLS.length} 个工具可用</div>
        </div>
        <div className="grid gap-px bg-slate-200 dark:bg-slate-800 sm:grid-cols-2 lg:grid-cols-5">
          {IMAGE_TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.href}
                href={tool.href}
                className="group min-h-[190px] bg-white p-4 hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 dark:border-slate-800 dark:text-slate-200">
                  <Icon className="h-4 w-4" aria-hidden />
                </div>
                <h3 className="mt-5 text-sm font-semibold text-slate-950 dark:text-white">{tool.label}</h3>
                <p className="mt-2 text-xs leading-5 text-slate-500">{tool.desc}</p>
                <div className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-slate-950 dark:text-white">
                  打开
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
