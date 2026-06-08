'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  Link2,
  Loader2,
  RefreshCw,
  Shield,
  Timer,
  Trash2,
  Unlock,
} from 'lucide-react';

import { toast } from '@/lib/toast';

interface ShareItem {
  shareId: string;
  assetId: string;
  assetUrl: string;
  watermark: { enabled: boolean };
  maxViews: number | null;
  viewCount: number;
  perViewSeconds: number | null;
  totalSeconds: number | null;
  consumedSeconds: number;
  expiresAt: string | null;
  hasPassword: boolean;
  disableDownload: boolean;
  revoked: boolean;
  status: string;
  createdAt: string;
  lastViewedAt: string | null;
  viewCountLog: number;
}

const STATUS_LABEL: Record<string, string> = {
  ok: '可访问',
  revoked: '已撤销',
  max_views: '次数用尽',
  expired: '已过期',
  total_time: '时长用尽',
};

const STATUS_CLASS: Record<string, string> = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
  revoked: 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400',
  max_views: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
  expired: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
  total_time: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
};

function fmtDate(value: string | null) {
  if (!value) return '无';
  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return value;
  }
}

function secondsLabel(value: number | null) {
  if (value === null) return '不限';
  if (value < 60) return `${value} 秒`;
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return seconds ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`;
}

export default function ShareManageClient() {
  const [links, setLinks] = useState<ShareItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const response = await fetch('/api/share/manage', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || '分享列表加载失败');
      setLinks(data.links ?? []);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const stats = useMemo(() => {
    const active = links.filter((item) => item.status === 'ok').length;
    const protectedCount = links.filter((item) => item.hasPassword || item.disableDownload).length;
    const views = links.reduce((sum, item) => sum + item.viewCount, 0);
    return { active, protectedCount, views };
  }, [links]);

  async function revoke(id: string, revoked: boolean) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/share/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revoked }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || '状态更新失败');
      toast.success(revoked ? '分享链接已撤销' : '分享链接已恢复');
      await reload();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function del(id: string) {
    if (!window.confirm('确认删除这条分享链接？删除后无法恢复。')) return;
    setBusyId(id);
    try {
      const response = await fetch(`/api/share/${id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || '删除失败');
      toast.success('分享链接已删除');
      await reload();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function copy(id: string) {
    await navigator.clipboard.writeText(new URL(`/s/${id}`, window.location.origin).toString());
    toast.success('分享链接已复制');
  }

  return (
    <div className="page-shell">
      <header className="command-panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase text-cyan-200">资产 / 分享</div>
            <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">客户分享指挥库</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              集中查看对外分享的状态、访问次数、有效期和安全策略。低频操作保留在这里，主工作流仍从资产库发起。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/assets" className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:border-cyan-300/60 hover:bg-white/10">
              <Link2 className="mr-2 h-4 w-4" />
              打开资产库
            </a>
            <button type="button" onClick={() => reload()} className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-50 disabled:opacity-60" disabled={loading}>
              <RefreshCw className={loading ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
              刷新
            </button>
          </div>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <Metric icon={<CheckCircle2 className="h-4 w-4" />} label="可访问链接" value={stats.active} />
        <Metric icon={<Eye className="h-4 w-4" />} label="累计访问" value={stats.views} />
        <Metric icon={<Shield className="h-4 w-4" />} label="启用保护" value={stats.protectedCount} />
      </section>

      {loading ? (
        <div className="command-glass flex min-h-[260px] items-center justify-center text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          正在加载分享链接
        </div>
      ) : links.length === 0 ? (
        <div className="command-empty p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-900">
            <Link2 className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-slate-950 dark:text-slate-50">还没有分享链接</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
            到资产库选择图片后点击分享，即可生成带密码、次数、时长和水印策略的外部链接。
          </p>
          <a href="/assets" className="btn-primary mt-5">
            前往资产库
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {links.map((link, index) => (
            <article
              key={link.shareId}
              className="command-glass detail-lift overflow-hidden reveal-up"
              style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
            >
              <div className="command-rail relative aspect-[16/10] bg-slate-100 dark:bg-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={link.assetUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                <div className="absolute left-3 top-3">
                  <span
                    className={
                      'inline-flex rounded-md border px-2 py-1 text-xs font-medium ' +
                      (STATUS_CLASS[link.status] ?? STATUS_CLASS.revoked)
                    }
                  >
                    {STATUS_LABEL[link.status] ?? link.status}
                  </span>
                </div>
                <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-1.5">
                  {link.watermark.enabled && <Badge>水印</Badge>}
                  {link.hasPassword && <Badge>密码</Badge>}
                  {link.disableDownload && <Badge>禁下载</Badge>}
                </div>
              </div>

              <div className="space-y-4 p-4">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <MiniStat icon={<Eye className="h-3.5 w-3.5" />} label="访问" value={`${link.viewCount}${link.maxViews !== null ? ` / ${link.maxViews}` : ''}`} />
                  <MiniStat icon={<Clock className="h-3.5 w-3.5" />} label="单次" value={secondsLabel(link.perViewSeconds)} />
                  <MiniStat icon={<Timer className="h-3.5 w-3.5" />} label="总时长" value={link.totalSeconds === null ? '不限' : `${link.consumedSeconds}/${link.totalSeconds}s`} />
                </div>

                <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex items-center justify-between gap-3">
                    <span>创建时间</span>
                    <span className="text-right">{fmtDate(link.createdAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>到期时间</span>
                    <span className="text-right">{fmtDate(link.expiresAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>最近访问</span>
                    <span className="text-right">{fmtDate(link.lastViewedAt)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => copy(link.shareId)} className="btn-secondary px-3 py-1.5 text-xs transition hover:-translate-y-0.5">
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    复制
                  </button>
                  <a href={`/s/${link.shareId}`} target="_blank" rel="noreferrer" className="btn-secondary px-3 py-1.5 text-xs transition hover:-translate-y-0.5">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    预览
                  </a>
                  {!link.revoked ? (
                    <button
                      type="button"
                      onClick={() => revoke(link.shareId, true)}
                      disabled={busyId === link.shareId}
                      className="btn-secondary px-3 py-1.5 text-xs text-amber-700 transition hover:-translate-y-0.5 dark:text-amber-300"
                    >
                      <Ban className="mr-1.5 h-3.5 w-3.5" />
                      撤销
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => revoke(link.shareId, false)}
                      disabled={busyId === link.shareId}
                      className="btn-secondary px-3 py-1.5 text-xs text-emerald-700 transition hover:-translate-y-0.5 dark:text-emerald-300"
                    >
                      <Unlock className="mr-1.5 h-3.5 w-3.5" />
                      恢复
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => del(link.shareId)}
                    disabled={busyId === link.shareId}
                    className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:-translate-y-0.5 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                    aria-label="删除分享链接"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="command-glass detail-lift flex items-center justify-between p-4">
      <div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-950 dark:text-slate-50">{value}</div>
      </div>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">
        {icon}
      </div>
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-1 truncate font-medium text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md border border-white/30 bg-slate-950/70 px-2 py-1 text-xs font-medium text-white backdrop-blur">
      {children}
    </span>
  );
}
