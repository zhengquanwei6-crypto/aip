import Link from 'next/link';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  CircleDot,
  Command,
  Eye,
  Image as ImageIcon,
  Link2,
  LockKeyhole,
  PenLine,
  Rocket,
  Sparkles,
  Timer,
  Users,
  Workflow,
} from 'lucide-react';

import { buildDashboardSummary } from '@/app/api/dashboard/summary/aggregate';
import { ensureAdminSeed } from '@/lib/auth/seed';
import { getCurrentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'AIP AI 战情室',
  description: 'AI 创作、资产、发布与经营的一体化指挥系统。',
};

const pipeline = [
  { label: 'Prompt', text: '内容变成可执行提示词', href: '/ai-tools/prompt-gen', icon: PenLine },
  { label: 'Image', text: '生成、精修、Comfy 生产线', href: '/ai-tools', icon: ImageIcon },
  { label: 'Asset', text: '入库、收藏、下载、复用', href: '/assets', icon: Boxes },
  { label: 'Share', text: '客户预览与浏览追踪', href: '/share', icon: Link2 },
  { label: 'Task', text: '发布任务与平台排程', href: '/today', icon: Timer },
  { label: 'Client', text: '客户跟进、报价、收入', href: '/clients', icon: Users },
];

export default async function HomePage() {
  headers();
  await ensureAdminSeed();
  const [summary, user] = await Promise.all([buildDashboardSummary(), getCurrentUser()]);
  const loggedIn = Boolean(user);
  const activeKeys = summary.system.apiKeyPool.llm.active + summary.system.apiKeyPool.image.active;
  const totalKeys = summary.system.apiKeyPool.llm.total + summary.system.apiKeyPool.image.total;
  const hasKeyIssue = Boolean(
    summary.system.apiKeyPool.llm.lastError || summary.system.apiKeyPool.image.lastError,
  );
  const recentAssets = summary.recentAssets.slice(0, 8);
  const recentOutputs = summary.recentOutputs.slice(0, 3);

  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none fixed inset-0 opacity-80">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] bg-[size:34px_34px]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(6,182,212,0.14),transparent_34%,rgba(16,185,129,0.08)_72%,transparent),repeating-linear-gradient(115deg,transparent_0_22px,rgba(255,255,255,0.035)_22px_23px)]" />
      </div>

      <header className="relative z-10 border-b border-white/10 bg-slate-950/102 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1560px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="group flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-950 transition-transform group-hover:scale-105">
              <Command className="h-5 w-5" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold leading-4">AIP AI 战情室</span>
              <span className="block text-xs text-slate-400">Creative Command Center</span>
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              href="/api/health/full"
              className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 sm:inline-flex"
            >
              <CircleDot className={hasKeyIssue ? 'h-3.5 w-3.5 text-amber-300' : 'h-3.5 w-3.5 text-emerald-300'} aria-hidden />
              {summary.system.version}
            </Link>
            <Link
              href={loggedIn ? '/dashboard' : '/login'}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-100"
            >
              {loggedIn ? '进入工作台' : '登录'}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative z-10 mx-auto grid max-w-[1560px] items-start gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-8">
        <div className="space-y-6 py-4 lg:py-6">
          <div>
            <div className="command-rail inline-flex items-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs font-medium text-cyan-100">
              <span className="pulse-dot" aria-hidden />
              在线 · Key {activeKeys}/{totalKeys} · {summary.today.weekday} · 最近输出 {summary.recentOutputs.length}
            </div>
            <h1 className="mt-7 max-w-[820px] text-5xl font-black tracking-normal text-white sm:text-6xl lg:text-7xl">
              AI 创作到发布的实时战情室
            </h1>
            <p className="mt-5 max-w-[760px] text-base leading-8 text-slate-300 sm:text-lg">
              把提示词、图像生成、素材入库、客户分享、平台任务和经营复盘压缩到同一条可操作链路里。用户打开首页就能看到系统状态，也能立刻开始生产。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={loggedIn ? '/dashboard' : '/login'}
                className="inline-flex h-12 items-center gap-2 rounded-lg bg-cyan-300 px-5 text-sm font-bold text-slate-950 shadow-xl shadow-cyan-950/30 hover:bg-cyan-200"
              >
                进入工作台
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href={loggedIn ? '/ai-tools/prompt-gen' : '/login'}
                className="inline-flex h-12 items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-5 text-sm font-semibold text-white hover:bg-white/10"
              >
                从一条内容开始
                <Sparkles className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>

          <div className="command-rail rounded-lg border border-white/10 bg-slate-900/70 p-4 shadow-2xl shadow-black/25 backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-cyan-200">Today Command</p>
                <h2 className="mt-1 text-lg font-bold text-white">打开首页就能判断今天该做什么</h2>
              </div>
              <Link
                href={loggedIn ? '/dashboard' : '/login'}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:border-cyan-300/60 hover:bg-white/10"
              >
                查看总控台
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Signal icon={<Sparkles className="h-4 w-4" />} label="最近输出回流" value={`${summary.recentOutputs.length} 条`} />
              <Signal icon={<Boxes className="h-4 w-4" />} label="素材可用" value={`${summary.recentAssets.length} 个`} />
              <Signal icon={<Rocket className="h-4 w-4" />} label="待发布任务" value={`${summary.pendingTasks.length} 条`} />
              <Signal icon={<Link2 className="h-4 w-4" />} label="有效分享" value={`${summary.shareStats.active} 条`} />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <HeroSignal label="生产入口" value="Prompt / Image" />
              <HeroSignal label="资产出口" value="Asset / Share" />
              <HeroSignal label="经营闭环" value="Task / Client" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="AI 输出" value={summary.kpi.aioutputs} />
            <Metric label="素材资产" value={summary.kpi.assets} />
            <Metric label="待处理任务" value={summary.kpi.pendingTasks} tone="amber" />
            <Metric label="客户分享" value={summary.shareStats.active} tone="green" />
          </div>
        </div>

        <div className="grid gap-4">
          <div className="command-rail rounded-lg border border-white/10 bg-white/10 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">Live Pipeline</p>
                <h2 className="mt-1 text-lg font-bold text-white sm:text-xl">Prompt → Image → Asset → Share → Task → Client</h2>
              </div>
              <span className={(hasKeyIssue ? 'badge-yellow' : 'badge-green') + ' shrink-0 whitespace-nowrap'}>
                {hasKeyIssue ? 'Key 池待处理' : '系统健康'}
              </span>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              {pipeline.map((item, index) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={loggedIn ? item.href : '/login'}
                    className="detail-lift group relative overflow-hidden rounded-lg border border-white/10 bg-slate-950/50 p-3 transition hover:border-cyan-300/60 hover:bg-slate-900"
                  >
                    <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent opacity-0 transition group-hover:opacity-100" aria-hidden />
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-slate-950">
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="text-xs text-slate-500">0{index + 1}</span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-white">{item.label}</p>
                    <p className="mt-1 min-h-[34px] text-xs leading-4 text-slate-400">{item.text}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-200 opacity-0 transition group-hover:opacity-100">
                      打开模块
                      <ArrowRight className="h-3 w-3" aria-hidden />
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="grid min-h-[320px] gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-lg border border-white/10 bg-white/10 p-4 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-white">最近素材流</h2>
                <Link href={loggedIn ? '/assets' : '/login'} className="text-sm font-medium text-cyan-200 hover:text-cyan-100">
                  查看资产库
                </Link>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {recentAssets.length > 0 ? (
                  recentAssets.map((asset) => (
                    <Link
                      key={asset.id}
                      href={loggedIn ? '/assets' : '/login'}
                      className="detail-lift group relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-slate-900"
                    >
                      <img
                        src={asset.url}
                        alt={asset.prompt || asset.fileName || 'asset'}
                        className="h-full w-full object-cover opacity-80 transition group-hover:scale-105 group-hover:opacity-100"
                      />
                      <span className="absolute inset-x-2 bottom-2 truncate rounded bg-black/55 px-2 py-1 text-[10px] text-white backdrop-blur">
                        {asset.category || asset.source}
                      </span>
                    </Link>
                  ))
                ) : (
                  <div className="col-span-4 flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-white/10 bg-slate-950/50 text-sm text-slate-400">
                    暂无素材，先从生成图片开始
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/10 p-4 backdrop-blur-xl">
              <div className="flex items-center gap-2">
                <Workflow className="h-4 w-4 text-cyan-200" aria-hidden />
                <h2 className="text-lg font-bold text-white">今日作战信号</h2>
              </div>
              <div className="mt-4 space-y-3">
                <Signal icon={<Rocket className="h-4 w-4" />} label="待发布任务" value={`${summary.pendingTasks.length} 条`} />
                <Signal icon={<Eye className="h-4 w-4" />} label="24h 分享浏览" value={`${summary.shareStats.viewsLast24h} 次`} />
                <Signal icon={<Users className="h-4 w-4" />} label="客户跟进" value={`${summary.clientFollowups.length} 个`} />
                <Signal icon={<LockKeyhole className="h-4 w-4" />} label="磁盘占用" value={`${summary.diskUsage.rootPercent ?? 0}%`} />
              </div>
              <Link
                href={loggedIn ? '/today' : '/login'}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-100"
              >
                进入今日排程
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/10 p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Recent Outputs</p>
                <h2 className="mt-1 text-lg font-bold text-white">最近 AI 输出正在回流资产和任务</h2>
              </div>
              <CheckCircle2 className="h-5 w-5 text-emerald-300" aria-hidden />
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {recentOutputs.length > 0 ? (
                recentOutputs.map((output) => (
                  <Link
                    key={output.id}
                    href={loggedIn ? '/history' : '/login'}
                    className="rounded-lg border border-white/10 bg-slate-950/50 p-3 text-sm text-slate-300 hover:border-cyan-300/50"
                  >
                    <span className="text-xs font-medium text-cyan-200">{output.type}</span>
                    <p className="mt-2 line-clamp-2 leading-6">{output.summary || '新的 AI 输出'}</p>
                  </Link>
                ))
              ) : (
                <Link href={loggedIn ? '/ai-tools/prompt-gen' : '/login'} className="md:col-span-3 rounded-lg border border-dashed border-white/10 p-4 text-sm text-slate-400">
                  暂无最近输出，点击开始第一条内容
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, tone = 'cyan' }: { label: string; value: number; tone?: 'cyan' | 'amber' | 'green' }) {
  const toneClass =
    tone === 'amber'
      ? 'border-amber-300/30 bg-amber-300/10 text-amber-100'
      : tone === 'green'
        ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
        : 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100';

  return (
    <div className={`detail-lift rounded-lg border p-4 backdrop-blur ${toneClass}`}>
      <div className="text-3xl font-black tabular-nums text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-300">{label}</div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-2/3 rounded-full bg-current opacity-70" />
      </div>
    </div>
  );
}

function HeroSignal({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2">
      <div className="text-[10px] font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-1 truncate text-xs font-bold text-cyan-100">{value}</div>
    </div>
  );
}

function Signal({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-3">
      <span className="flex items-center gap-2 text-sm text-slate-300">
        <span className="text-cyan-200">{icon}</span>
        {label}
      </span>
      <span className="text-sm font-bold text-white">{value}</span>
    </div>
  );
}
