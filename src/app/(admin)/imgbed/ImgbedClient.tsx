'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import {
  Check,
  Copy,
  ExternalLink,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';

import { toast } from '@/lib/toast';

interface AssetItem {
  id: string;
  type: string;
  source: string;
  platform: string;
  category: string;
  url: string;
  prompt: string;
  fileName: string;
  createdAt: string;
}

interface Props {
  initialItems: AssetItem[];
  total: number;
  page: number;
  pageSize: number;
  tab: 'all' | 'ai' | 'manual';
  stats: { all: number; ai: number; manual: number };
}

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);

const TABS: { value: Props['tab']; label: string; icon: typeof Layers }[] = [
  { value: 'all', label: '全部', icon: Layers },
  { value: 'ai', label: 'AI 生成', icon: Sparkles },
  { value: 'manual', label: '手动上传', icon: Upload },
];

function sourceLabel(source: string) {
  if (source === 'ai_generated') return 'AI 生成';
  if (source === 'manual_upload') return '手动上传';
  return source || '未知来源';
}

function fmtDate(value: string) {
  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return value;
  }
}

export default function ImgbedClient(props: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<AssetItem[]>(props.initialItems);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [copyId, setCopyId] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    setItems(props.initialItems);
  }, [props.initialItems]);

  const totalPages = Math.max(1, Math.ceil(props.total / props.pageSize));
  const isWorkspace = pathname?.startsWith('/workspace');

  const routeConfig = useMemo(
    () => ({
      route: isWorkspace ? '/workspace' : '/imgbed',
      tabKey: isWorkspace ? 'ibTab' : 'tab',
      pageKey: isWorkspace ? 'ibPage' : 'page',
    }),
    [isWorkspace],
  );

  function go(next: { tab?: Props['tab']; page?: number }) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (isWorkspace) params.set('tab', 'imgbed');

    if (next.tab !== undefined) {
      if (next.tab === 'all') params.delete(routeConfig.tabKey);
      else params.set(routeConfig.tabKey, next.tab);
      params.delete(routeConfig.pageKey);
    }
    if (next.page !== undefined) {
      if (next.page <= 1) params.delete(routeConfig.pageKey);
      else params.set(routeConfig.pageKey, String(next.page));
    }
    const query = params.toString();
    router.push(routeConfig.route + (query ? `?${query}` : ''));
    router.refresh();
  }

  function shortLink(id: string) {
    return origin ? `${origin}/i/${id}` : `/i/${id}`;
  }

  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyId(id);
      toast.success('短链已复制');
      window.setTimeout(() => setCopyId(null), 1600);
    } catch (error) {
      toast.error((error as Error).message || '复制失败');
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;

    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of fileArr) {
      if (ALLOWED_MIME.has(file.type)) accepted.push(file);
      else rejected.push(file.name);
    }
    if (rejected.length > 0) toast.error(`已跳过不支持的文件：${rejected.join('、')}`, 6000);
    if (accepted.length === 0) return;

    setBusy(true);
    let okCount = 0;
    const errors: string[] = [];
    for (const file of accepted) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', '图床上传');
      try {
        const response = await fetch('/api/assets/upload', { method: 'POST', body: formData });
        const data = await response.json();
        if (!response.ok || !data.ok) errors.push(`${file.name}: ${data.error || response.status}`);
        else okCount += 1;
      } catch (error) {
        errors.push(`${file.name}: ${(error as Error).message}`);
      }
    }
    setBusy(false);

    if (okCount > 0) {
      toast.success(`已上传 ${okCount} 张图片`);
      router.refresh();
    }
    if (errors.length > 0) toast.error(`部分上传失败：${errors.join('；')}`, 7000);
  }

  async function deleteAsset(id: string) {
    if (!window.confirm('确认删除这张图片？文件和数据库记录都会删除，无法恢复。')) return;
    try {
      const response = await fetch(`/api/assets/${id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || '删除失败');
      setItems((current) => current.filter((item) => item.id !== id));
      toast.success('图片已删除');
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <div className="page-shell">
      <header className="command-panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-bold text-cyan-200">
              <span className="pulse-dot" aria-hidden />
              资产 / 图床
            </div>
            <h1 className="mt-4 text-3xl font-black leading-tight text-white sm:text-4xl">图床与短链</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              上传图片、复制 /i/&lt;id&gt; 短链，并按来源快速过滤。它是资产库的轻量入口，适合内部快速分发图片。
            </p>
          </div>
          <button type="button" onClick={() => router.refresh()} className="command-rail btn-primary bg-white text-slate-950 hover:bg-slate-200">
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </button>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <Metric label="全部图片" value={props.stats.all} icon={<Layers className="h-4 w-4" />} />
        <Metric label="AI 生成" value={props.stats.ai} icon={<Sparkles className="h-4 w-4" />} />
        <Metric label="手动上传" value={props.stats.manual} icon={<Upload className="h-4 w-4" />} />
      </section>

      <section
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (event.dataTransfer?.files) void uploadFiles(event.dataTransfer.files);
        }}
        className={clsx(
          'command-glass command-rail relative overflow-hidden p-6 text-center transition-colors sm:p-8',
          dragOver ? 'border-cyan-400 bg-cyan-50/70 dark:bg-cyan-950/30' : '',
        )}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
        </div>
        <h2 className="mt-4 text-base font-semibold text-slate-950 dark:text-slate-50">
          {dragOver ? '释放文件开始上传' : '拖拽图片到这里'}
        </h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          支持 PNG / JPG / WebP / GIF，可一次选择多张；实际容量只受服务器磁盘限制。
        </p>
        <label className="btn-primary mt-5 cursor-pointer">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          {busy ? '上传中' : '选择文件'}
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              if (event.target.files) void uploadFiles(event.target.files);
              event.currentTarget.value = '';
            }}
          />
        </label>
      </section>

      <section className="command-toolbar">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = props.tab === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => go({ tab: tab.value })}
                className={
                  'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ' +
                  (active
                    ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                    : 'border-slate-200 bg-white/70 text-slate-600 hover:border-cyan-300 hover:text-cyan-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300 dark:hover:border-cyan-800')
                }
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="text-sm text-slate-500 dark:text-slate-400">
          当前显示 <span className="font-medium text-slate-900 dark:text-slate-100">{props.total}</span> 张
        </div>
      </section>

      {items.length === 0 ? (
        <div className="command-empty">当前筛选下暂无图片</div>
      ) : (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {items.map((item, index) => (
            <article
              key={item.id}
              className="asset-command-card detail-lift overflow-hidden reveal-up"
              style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
            >
              <div className="relative aspect-square bg-slate-100 dark:bg-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={item.fileName || item.id} className="h-full w-full object-cover" loading="lazy" />
                <span className="absolute left-2 top-2 rounded-md bg-slate-950/70 px-2 py-1 text-[11px] text-white backdrop-blur">
                  {sourceLabel(item.source)}
                </span>
              </div>
              <div className="space-y-3 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {item.fileName || item.type || '未命名图片'}
                  </div>
                  <div className="mt-1 truncate text-xs text-slate-400">{fmtDate(item.createdAt)}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                  /i/{item.id}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(shortLink(item.id), item.id)}
                    className="btn-secondary h-8 flex-1 px-2 py-1 text-xs"
                  >
                    {copyId === item.id ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                    复制
                  </button>
                  <a
                    href={`/i/${item.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                    aria-label="打开短链"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => deleteAsset(item.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                    aria-label="删除图片"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => go({ page: props.page - 1 })}
            disabled={props.page <= 1}
            className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-sm text-slate-500">
            {props.page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => go({ page: props.page + 1 })}
            disabled={props.page >= totalPages}
            className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="command-stat-card flex items-center justify-between">
      <div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
        <div className="mt-1 text-2xl font-black tabular-nums text-slate-950 dark:text-slate-50">{value}</div>
      </div>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">
        {icon}
      </div>
    </div>
  );
}
