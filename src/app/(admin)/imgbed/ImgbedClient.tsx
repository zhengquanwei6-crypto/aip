'use client';

/**
 * v0.13 B3 · ImgbedClient
 *
 * 功能：
 *   - 顶部上传区（拖拽 + 多文件 + ≤10MB · PNG/JPG/WebP/GIF）
 *   - 三 tab 切换（全部 / AI 生成 / 手动上传）· URL 同步 ?tab=
 *   - 网格列表：缩略图 + /i/<id> 短链 + 复制按钮 + 删除按钮 + 来源徽章
 *   - 分页 · prev / next · 显示 当前页/总页
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Upload,
  Copy,
  Check,
  Trash2,
  Image as ImageIcon,
  Sparkles,
  Layers,
  Loader2,
  X,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import clsx from 'clsx';

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

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);
const MAX_BYTES = 10 * 1024 * 1024;

const TABS: { value: Props['tab']; label: string; icon: typeof Layers }[] = [
  { value: 'all', label: '全部', icon: Layers },
  { value: 'ai', label: 'AI 生成', icon: Sparkles },
  { value: 'manual', label: '手动上传', icon: Upload },
];

export default function ImgbedClient(props: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<AssetItem[]>(props.initialItems);
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [copyId, setCopyId] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  // 当 props.initialItems 变化时（路由切 tab/page 后 SSR 再水合）刷新本地 state
  useEffect(() => {
    setItems(props.initialItems);
  }, [props.initialItems]);

  const totalPages = Math.max(1, Math.ceil(props.total / props.pageSize));

  function go(next: { tab?: Props['tab']; page?: number }) {
    const sp = new URLSearchParams(searchParams?.toString() ?? '');
    if (next.tab !== undefined) {
      if (next.tab === 'all') sp.delete('tab');
      else sp.set('tab', next.tab);
      sp.delete('page'); // tab 切换时回到第 1 页
    }
    if (next.page !== undefined) {
      if (next.page <= 1) sp.delete('page');
      else sp.set('page', String(next.page));
    }
    const qs = sp.toString();
    router.push('/imgbed' + (qs ? '?' + qs : ''));
    router.refresh();
  }

  function shortLink(id: string): string {
    if (!origin) return `/i/${id}`;
    return `${origin}/i/${id}`;
  }

  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyId(id);
      setOkMsg(`已复制：${text}`);
      setTimeout(() => {
        setCopyId(null);
        setOkMsg(null);
      }, 1800);
    } catch (e) {
      setErrMsg('复制失败：' + (e as Error).message);
      setTimeout(() => setErrMsg(null), 3000);
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;

    // 前端先做白名单 + 大小检查
    const rejected: string[] = [];
    const accepted: File[] = [];
    for (const f of fileArr) {
      if (!ALLOWED_MIME.has(f.type)) {
        rejected.push(`${f.name}（类型 ${f.type || '未知'} 不在白名单）`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        rejected.push(`${f.name}（${(f.size / 1024 / 1024).toFixed(1)}MB > 10MB）`);
        continue;
      }
      accepted.push(f);
    }

    if (rejected.length > 0) {
      setErrMsg('已跳过：' + rejected.join('；'));
      setTimeout(() => setErrMsg(null), 5000);
    }
    if (accepted.length === 0) return;

    setBusy(true);
    let okCount = 0;
    let errs: string[] = [];
    for (const f of accepted) {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('type', '图床上传');
      try {
        const r = await fetch('/api/assets/upload', { method: 'POST', body: fd });
        const j = await r.json();
        if (!r.ok || !j.ok) {
          errs.push(`${f.name}: ${j.error || r.status}`);
        } else {
          okCount += 1;
        }
      } catch (e) {
        errs.push(`${f.name}: ${(e as Error).message}`);
      }
    }
    setBusy(false);
    if (okCount > 0) {
      setOkMsg(`✅ 上传 ${okCount} 张成功`);
      setTimeout(() => setOkMsg(null), 3000);
      router.refresh();
    }
    if (errs.length > 0) {
      setErrMsg('部分失败：' + errs.join('；'));
      setTimeout(() => setErrMsg(null), 6000);
    }
  }

  async function deleteAsset(id: string) {
    if (!confirm('确定删除这张图？文件 + DB 记录都会删，无法恢复。')) return;
    try {
      const r = await fetch(`/api/assets/${id}`, { method: 'DELETE' });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setErrMsg('删除失败：' + (j.error || r.status));
        setTimeout(() => setErrMsg(null), 3000);
        return;
      }
      setItems((prev) => prev.filter((x) => x.id !== id));
      setOkMsg('已删除');
      setTimeout(() => setOkMsg(null), 1500);
      router.refresh();
    } catch (e) {
      setErrMsg('删除异常：' + (e as Error).message);
      setTimeout(() => setErrMsg(null), 3000);
    }
  }

  return (
    <div className="space-y-4 px-4 sm:px-6 py-3 sm:py-4 max-w-7xl mx-auto">
      <div className="flex items-center gap-2">
        <ImageIcon size={20} className="text-brand-600 dark:text-brand-400" aria-hidden="true" />
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-50">
          图床 · 图片管理
        </h1>
        <span className="text-xs text-slate-400 dark:text-slate-500 ml-2">
          所有图统一短链 · /i/&lt;id&gt;
        </span>
      </div>

      {/* 上传区 */}
      <div
        data-v013-b3-uploader
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer?.files) void uploadFiles(e.dataTransfer.files);
        }}
        className={clsx(
          'rounded-lg border-2 border-dashed p-6 sm:p-8 text-center transition-colors',
          dragOver
            ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
            : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40',
        )}
      >
        <Upload size={28} className="mx-auto mb-2 text-slate-400" aria-hidden="true" />
        <p className="text-sm text-slate-700 dark:text-slate-200 mb-1">
          拖拽图片到此处 · 或点击下方按钮选择文件
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          支持 PNG / JPG / WebP / GIF · 单文件 ≤ 10MB · 可一次选多张
        </p>
        <label className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand-600 hover:bg-brand-700 disabled:bg-slate-400 text-white text-sm font-medium cursor-pointer transition-colors">
          {busy ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <Upload size={14} aria-hidden="true" />
          )}
          {busy ? '上传中…' : '选择文件'}
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              if (e.target.files) void uploadFiles(e.target.files);
              e.currentTarget.value = ''; // 允许重复选同一张
            }}
          />
        </label>
      </div>

      {/* 通知区 */}
      {errMsg && (
        <div className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 p-2 text-xs text-red-800 dark:text-red-100 flex items-start gap-2">
          <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span className="break-all">{errMsg}</span>
        </div>
      )}
      {okMsg && (
        <div className="rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-900/20 p-2 text-xs text-emerald-800 dark:text-emerald-100 flex items-start gap-2">
          <Check size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span className="break-all">{okMsg}</span>
        </div>
      )}

      {/* Tab 切换 */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = props.tab === t.value;
          const count =
            t.value === 'all'
              ? props.stats.all
              : t.value === 'ai'
              ? props.stats.ai
              : props.stats.manual;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => go({ tab: t.value })}
              aria-pressed={isActive}
              className={clsx(
                'inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 text-sm border-b-2 -mb-px transition-colors',
                isActive
                  ? 'border-brand-600 text-brand-700 font-medium dark:text-brand-300'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200',
              )}
            >
              <Icon size={14} aria-hidden="true" />
              {t.label}
              <span className="text-xs text-slate-400 ml-0.5">({count})</span>
            </button>
          );
        })}
        <span className="ml-auto text-[11px] text-slate-400 px-2">
          第 {props.page} / {totalPages} 页 · 共 {props.total} 张
        </span>
      </div>

      {/* 网格 */}
      {items.length === 0 ? (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-12 text-center text-sm text-slate-400">
          <ImageIcon size={28} className="mx-auto mb-2 opacity-40" aria-hidden="true" />
          这一页还没有图。上传一张试试。
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {items.map((it) => {
            const link = shortLink(it.id);
            const isCopied = copyId === it.id;
            return (
              <div
                key={it.id}
                data-v013-b3-card={it.id}
                className="group relative flex flex-col gap-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2"
              >
                <a
                  href={it.url}
                  target="_blank"
                  rel="noreferrer"
                  className="relative block aspect-square overflow-hidden rounded bg-slate-100 dark:bg-slate-800"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={it.url}
                    alt={it.type}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                  <div className="absolute top-1 right-1">
                    <span
                      className={clsx(
                        'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-medium',
                        it.source === 'ai_generated'
                          ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
                      )}
                    >
                      {it.source === 'ai_generated' ? (
                        <>
                          <Sparkles size={9} aria-hidden="true" /> AI
                        </>
                      ) : (
                        <>
                          <Upload size={9} aria-hidden="true" /> 手动
                        </>
                      )}
                    </span>
                  </div>
                </a>
                <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  <span className="truncate" title={it.prompt || it.fileName}>
                    {it.prompt
                      ? it.prompt.slice(0, 30) + (it.prompt.length > 30 ? '…' : '')
                      : it.fileName.slice(0, 24)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    readOnly
                    value={link}
                    className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-[10px] font-mono text-slate-700 dark:text-slate-300 truncate"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button
                    type="button"
                    onClick={() => void copyToClipboard(link, it.id)}
                    className="inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 p-1.5 text-slate-600 dark:text-slate-300 transition-colors"
                    title="复制短链"
                  >
                    {isCopied ? (
                      <Check size={12} className="text-emerald-600" aria-hidden="true" />
                    ) : (
                      <Copy size={12} aria-hidden="true" />
                    )}
                  </button>
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 p-1.5 text-slate-600 dark:text-slate-300 transition-colors"
                    title="新窗口打开"
                  >
                    <ExternalLink size={12} aria-hidden="true" />
                  </a>
                  <button
                    type="button"
                    onClick={() => void deleteAsset(it.id)}
                    className="inline-flex items-center justify-center rounded border border-red-200 dark:border-red-900 bg-white dark:bg-slate-900 hover:bg-red-50 dark:hover:bg-red-900/30 p-1.5 text-red-600 dark:text-red-400 transition-colors"
                    title="删除"
                  >
                    <Trash2 size={12} aria-hidden="true" />
                  </button>
                </div>
                <div className="text-[9px] text-slate-400 dark:text-slate-500 flex items-center justify-between">
                  <span>{new Date(it.createdAt).toLocaleString('zh-CN', { hour12: false })}</span>
                  {it.platform && <span>· {it.platform}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            type="button"
            disabled={props.page <= 1}
            onClick={() => go({ page: props.page - 1 })}
            className="px-3 py-1 text-sm rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            上一页
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {props.page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={props.page >= totalPages}
            onClick={() => go({ page: props.page + 1 })}
            className="px-3 py-1 text-sm rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
