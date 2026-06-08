'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  CircleAlert,
  Image as ImageIcon,
  Link2,
  ListChecks,
  MessageSquare,
  PenLine,
  Settings2,
  Sparkles,
  Users,
} from 'lucide-react';

import type { DashboardSummary } from '@/app/api/dashboard/summary/aggregate';
import CommandHeader from '@/components/command/CommandHeader';
import OpsRail from '@/components/command/OpsRail';
import EmptyActionState from '@/components/command/EmptyActionState';

export interface DashboardClientProps {
  data: DashboardSummary;
}

const STATUS_LABEL: Record<string, string> = {
  pending: '待处理',
  generated: '已生成',
  published: '已发布',
  recapped: '已复盘',
};

export default function DashboardClient({ data }: DashboardClientProps) {
  const { today, kpi, system, todayTasks } = data;
  const llm = system.apiKeyPool.llm;
  const image = system.apiKeyPool.image;
  const hasKeyIssue = Boolean(llm.lastError || image.lastError);

  return (
    <div className="page-shell">
      <section className="grid gap-5 lg:grid-cols-[1fr_0.78fr]">
        <CommandHeader
          eyebrow={`${system.version} · ${today.date} · ${today.weekday}`}
          title="AI 战情总控"
          description="用一个屏幕查看生产健康、任务流、生成输出、资产、分享和经营信号。"
          stats={[
            { label: '待处理', value: kpi.pendingTasks, tone: 'warning' },
            { label: 'AI 输出', value: kpi.aioutputs, tone: 'ai' },
            { label: '素材', value: kpi.assets, tone: 'info' },
            { label: '分享', value: data.shareStats.total, tone: 'success' },
          ]}
          actions={[
            { href: '/ai-tools/prompt-gen', label: '从内容开始', primary: true, icon: <PenLine className="h-4 w-4" /> },
            { href: '/assets', label: '查看资产', icon: <Boxes className="h-4 w-4" /> },
          ]}
        />

        <div className="command-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase text-cyan-200">系统健康</div>
              <h2 className="mt-1 text-lg font-semibold text-white">
                实时信号
              </h2>
            </div>
            <span className={hasKeyIssue ? 'badge-yellow' : 'badge-green'}>
              {hasKeyIssue ? '需检查' : '健康'}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            <HealthRow label="LLM Key 池" value={`${llm.active}/${llm.total} 启用`} issue={llm.lastError} />
            <HealthRow label="图片 Key 池" value={`${image.active}/${image.total} 启用`} issue={image.lastError} />
            <HealthRow label="磁盘占用" value={`${data.diskUsage.rootPercent ?? 0}%`} />
            <HealthRow label="上传文件" value={`${data.diskUsage.uploadsCount ?? 0} 个`} />
          </div>
          <Link href="/settings" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-white hover:underline">
            查看设置
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>

      <OpsRail
        steps={[
          { href: '/ai-tools/prompt-gen', label: 'Prompt', description: '提示词生成与复用', value: data.recentOutputs.length, icon: PenLine, active: true },
          { href: '/ai-tools', label: 'Image', description: '生成与精修图片', value: kpi.aioutputs, icon: ImageIcon },
          { href: '/assets', label: 'Asset', description: '入库、收藏、下载', value: kpi.assets, icon: Boxes },
          { href: '/share', label: 'Share', description: '客户预览链接', value: data.shareStats.active, icon: Link2 },
          { href: '/today', label: 'Task', description: '排程与发布任务', value: data.pendingTasks.length, icon: ListChecks },
          { href: '/clients', label: 'Client', description: '客户与收入复盘', value: data.clientFollowups.length, icon: Users },
        ]}
      />

      <section className="command-panel p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase text-cyan-200">Live Mission Matrix</div>
            <h2 className="mt-1 text-xl font-black text-white">创作、资产、分享、经营同屏联动</h2>
          </div>
          <Link href="/playground" className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:border-cyan-300/60 hover:bg-white/10">
            启动生成
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <CommandSignal icon={<Sparkles className="h-4 w-4" />} label="最近输出" value={data.recentOutputs.length} desc="可复用到提示词与图片" />
          <CommandSignal icon={<Boxes className="h-4 w-4" />} label="最近资产" value={data.recentAssets.length} desc="可分享、下载、建任务" />
          <CommandSignal icon={<ListChecks className="h-4 w-4" />} label="待排程" value={data.pendingTasks.length} desc="进入今日任务处理" />
          <CommandSignal icon={<Users className="h-4 w-4" />} label="客户跟进" value={data.clientFollowups.length} desc="回流报价与收入复盘" />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <ModuleLink href="/ai-tools" icon={<Sparkles className="h-4 w-4" />} title="创作" desc="提示词、图片工具、ComfyUI。" />
        <ModuleLink href="/assets" icon={<Boxes className="h-4 w-4" />} title="资产" desc="素材库、上传、收藏。" />
        <ModuleLink href="/share" icon={<Link2 className="h-4 w-4" />} title="分享" desc={`${data.shareStats.active} 条可用链接。`} />
        <ModuleLink href="/discuss" icon={<MessageSquare className="h-4 w-4" />} title="协作" desc="团队记录与决策。" />
        <ModuleLink href="/settings" icon={<Settings2 className="h-4 w-4" />} title="设置" desc="Key、适配器、系统。" />
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="page-kicker">今日</div>
              <h2 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
                {today.pendingTasksCount} 个待处理任务
              </h2>
            </div>
            <ListChecks className="h-5 w-5 text-slate-400" aria-hidden />
          </div>
          <div className="mt-4 space-y-2">
            {todayTasks.slice(0, 6).map((task) => (
              <Link
                key={task.id}
                href="/today"
                className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-950"
              >
                <span className="w-12 shrink-0 font-mono text-xs text-slate-400">{task.publishTime}</span>
                <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{task.title}</span>
                <span className="badge-gray shrink-0">{STATUS_LABEL[task.status] ?? task.status}</span>
              </Link>
            ))}
            {todayTasks.length === 0 && (
              <EmptyActionState
                title="今天暂无排程任务"
                description="可以从素材库或三平台工作页创建新的发布任务。"
                actionHref="/assets"
                actionLabel="从素材建任务"
                icon={<ListChecks className="h-5 w-5" aria-hidden />}
              />
            )}
          </div>
        </div>

        <div className="surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="page-kicker">近期生产</div>
              <h2 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
                最新资产
              </h2>
            </div>
            <Link href="/assets" className="text-sm font-medium text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white">
              打开资产库
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {data.recentAssets.slice(0, 4).map((asset) => (
              <Link key={asset.id} href="/assets" className="group overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                {asset.url ? (
                  <img src={asset.url} alt={asset.fileName || asset.type} className="aspect-square w-full object-cover transition-transform group-hover:scale-[1.04]" />
                ) : (
                  <div className="flex aspect-square items-center justify-center text-slate-400">
                    <ImageIcon className="h-6 w-6" aria-hidden />
                  </div>
                )}
                <div className="truncate px-2 py-2 text-xs text-slate-500">{asset.type}</div>
              </Link>
            ))}
            {data.recentAssets.length === 0 && (
              <div className="col-span-full">
                <EmptyActionState
                  title="还没有近期资产"
                  description="先生成或上传图片，素材会自动进入战情室资产流。"
                  actionHref="/ai-tools"
                  actionLabel="开始创作"
                  icon={<ImageIcon className="h-5 w-5" aria-hidden />}
                />
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function HealthRow({ label, value, issue }: { label: string; value: string; issue?: string | null }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</div>
        {issue ? <CircleAlert className="h-4 w-4 text-amber-500" aria-hidden /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />}
      </div>
      <div className="mt-1 text-xs text-slate-500">{value}</div>
      {issue && <div className="mt-2 line-clamp-2 text-xs text-amber-700 dark:text-amber-300">{issue}</div>}
    </div>
  );
}

function CommandSignal({
  icon,
  label,
  value,
  desc,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  desc: string;
}) {
  return (
    <div className="detail-lift rounded-lg border border-white/10 bg-white/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-950">{icon}</span>
        <span className="font-mono text-3xl font-black tabular-nums text-white">{value}</span>
      </div>
      <div className="mt-4 text-sm font-bold text-white">{label}</div>
      <p className="mt-1 text-xs leading-5 text-slate-400">{desc}</p>
    </div>
  );
}

function ModuleLink({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href} className="command-glass detail-lift group block p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">
        {icon}
      </div>
      <div className="mt-4 text-sm font-semibold text-slate-950 dark:text-white">{title}</div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{desc}</p>
      <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-200">
        打开
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
    </Link>
  );
}
