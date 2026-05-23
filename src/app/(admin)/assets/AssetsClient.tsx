'use client';

import { useState, useRef } from 'react';
import { Download, Trash2, Heart } from 'lucide-react';
import { IMAGE_TYPES } from '@/lib/constants';
import { toast } from '@/lib/toast';
import ListShell, { bulkSerial } from '@/components/ListShell';
import ImageLightbox from '@/components/ImageLightbox';

interface Asset {
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

const SOURCE_FILTER_OPTIONS = [
  { value: '', label: '全部来源' },
  { value: 'ai_generated', label: 'AI 生成' },
  { value: 'manual_upload', label: '手动上传' },
];

const TYPE_FILTER_OPTIONS = [
  { value: '', label: '全部类型' },
  ...IMAGE_TYPES.map((c) => ({ value: c, label: c })),
];

const FAV_FILTER_OPTIONS = [
  { value: '', label: '全部' },
  { value: '1', label: '仅收藏' },
];

const STORAGE_KEY = 'list:assets';

/**
 * v0.11 B7 · /workspace?tab=assets&type=xxx&source=yyy URL 参数支持
 *
 * 旧实现：父级 page 已经把 ?type / ?source 应用到 prisma where（server-side），
 *         但传给 AssetsClient 的 `filters` prop 完全被忽略 —— ListShell 用
 *         localStorage 持久化的 filterValues 默认值（空字符串），所以 URL 跳过来
 *         一打开会看到没有任何筛选标签 + 全部数据（不是用户期待）。
 *
 * 修复：useState 懒初始化把 URL 筛选值同步写入 localStorage[list:assets]。
 *       这个写入在 AssetsClient 的初次 render 时完成，发生在 ListShell 内
 *       useStickyState 的 useEffect 运行之前 —— 所以 ListShell 首次 mount 读
 *       localStorage 时就能拿到 URL 来的筛选值，UI 一次到位 + 0 闪烁。
 *
 * 不破坏：用户在 /assets（未带 query）已经保存的 filter 偏好仍然保留 —— 只在
 *         URL 真有 ?type 或 ?source 时才覆盖。
 */
export default function AssetsClient({
  initialAssets,
  initialFavMap = {},
  filters,
}: {
  initialAssets: Asset[];
  filters?: { type: string; source: string };
  initialFavMap?: Record<string, boolean>;
}) {
  // v0.11 B7: 懒初始化 — 在第一次 render 时把 URL filters 写入 localStorage
  // 这样 ListShell 的 useStickyState 在 useEffect mount 时读取 localStorage 就能拿到 URL 值
  const [_seededFromUrl] = useState<true | null>(() => {
    if (typeof window === 'undefined') return null;
    const urlType = filters?.type ?? '';
    const urlSource = filters?.source ?? '';
    if (!urlType && !urlSource) return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw
        ? (JSON.parse(raw) as {
            view?: string;
            filters?: Record<string, string>;
            q?: string;
            page?: number;
          })
        : {};
      const merged = {
        view: parsed.view ?? 'card',
        q: parsed.q ?? '',
        page: 1,
        filters: {
          ...(parsed.filters ?? {}),
          ...(urlType ? { type: urlType } : {}),
          ...(urlSource ? { source: urlSource } : {}),
        },
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      /* localStorage quota / disabled — 静默 */
    }
    return true;
  });

  // 收藏的素材排在最前
  const [favMap, setFavMap] = useState<Record<string, boolean>>(initialFavMap);
  const sortByFav = (arr: Asset[], fm: Record<string, boolean>) =>
    arr
      .slice()
      .sort(
        (a, b) =>
          (fm[b.id] ? 1 : 0) - (fm[a.id] ? 1 : 0),
      );

  const [assets, setAssets] = useState(() => sortByFav(initialAssets, initialFavMap));
  const [uploading, setUploading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [zipping, setZipping] = useState(false);
  const [favPending, setFavPending] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', '封面图');
      const res = await fetch('/api/assets/upload', {
        method: 'POST',
        body: fd,
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '上传失败');
      setAssets((arr) => sortByFav([j.asset, ...arr], favMap));
      toast.success('已上传');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function getExtFromUrl(url: string, fallback = 'jpg') {
    const m = url.match(/\.([a-zA-Z0-9]{1,5})(?:\?|#|$)/);
    if (m) return m[1].toLowerCase();
    return fallback;
  }

  async function downloadZip(ids: string[]) {
    setZipping(true);
    try {
      const JSZipMod = await import('jszip');
      const JSZip = (JSZipMod as any).default || JSZipMod;
      const zip = new JSZip();
      const idSet = new Set(ids);
      const list = assets.filter((a) => idSet.has(a.id));
      let success = 0;
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        try {
          const res = await fetch(a.url);
          if (!res.ok) throw new Error(`下载 ${a.url} 失败`);
          const blob = await res.blob();
          const ext = getExtFromUrl(a.url, 'jpg');
          const safeFileName =
            a.fileName && /\.\w{1,5}$/.test(a.fileName)
              ? a.fileName
              : `${a.source || 'asset'}-${a.id}.${ext}`;
          zip.file(safeFileName, blob);
          success++;
        } catch (e) {
          // v0.11 B4: dev-only console.warn（生产环境静默）
          if (process.env.NODE_ENV !== 'production') {
            console.warn('zip skip', a.id, e);
          }
        }
        if (i < list.length - 1) {
          await new Promise((r) => setTimeout(r, 80));
        }
      }
      if (success === 0) {
        return { ok: false, message: '没有图片可打包' };
      }
      const out = await zip.generateAsync({ type: 'blob' });
      const dlUrl = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `assets-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(dlUrl), 5000);
      return { ok: true, message: `已打包 ${success} 张图片为 ZIP` };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    } finally {
      setZipping(false);
    }
  }

  async function toggleFavorite(id: string) {
    if (favPending.has(id)) return;
    const cur = !!favMap[id];
    const next = !cur;
    // 乐观更新
    setFavPending((s) => {
      const copy = new Set(s);
      copy.add(id);
      return copy;
    });
    const prevFav = favMap;
    const optimistic = { ...favMap, [id]: next };
    if (!next) delete optimistic[id];
    setFavMap(optimistic);
    setAssets((arr) => sortByFav(arr, optimistic));
    try {
      const res = await fetch(`/api/assets/${id}/favorite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: next }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '操作失败');
      toast.success(next ? '已收藏' : '已取消收藏');
    } catch (e) {
      // 回滚
      setFavMap(prevFav);
      setAssets((arr) => sortByFav(arr, prevFav));
      toast.error((e as Error).message);
    } finally {
      setFavPending((s) => {
        const copy = new Set(s);
        copy.delete(id);
        return copy;
      });
    }
  }

  function openLightbox(id: string) {
    const idx = assets.findIndex((a) => a.id === id);
    if (idx >= 0) setLightboxIndex(idx);
  }
  const lightboxImages = assets.map((a) => ({
    url: a.url,
    alt: a.fileName || a.type,
  }));

  return (
    <>
      <ListShell<Asset>
        items={assets}
        getId={(a) => a.id}
        storageKey={STORAGE_KEY}
        title={<span className="text-slate-700 dark:text-slate-200">素材库</span>}
        toolbar={
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadFile(f);
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="btn-primary text-sm"
            >
              {uploading ? '上传中…' : '上传图片'}
            </button>
          </>
        }
        searchPlaceholder="搜索 prompt / 文件名 / 类目"
        searchKeys={['prompt', 'fileName', 'category', 'type']}
        filters={[
          {
            key: 'fav',
            label: '收藏',
            options: FAV_FILTER_OPTIONS,
            predicate: (a, v) => (v === '1' ? !!favMap[a.id] : true),
          },
          {
            key: 'source',
            label: '来源',
            options: SOURCE_FILTER_OPTIONS,
            predicate: (a, v) => a.source === v,
          },
          {
            key: 'type',
            label: '类型',
            options: TYPE_FILTER_OPTIONS,
            predicate: (a, v) => a.type === v,
          },
        ]}
        viewModes={['card']}
        pageSize={60}
        emptyState="暂无素材，先去 /image 生成或在右上角「上传图片」"
        onToastSuccess={(m) => toast.success(m)}
        onToastError={(m) => toast.error(m)}
        bulk={[
          {
            key: 'zip',
            label: zipping ? '打包中…' : '下载 ZIP',
            icon: <Download size={14} />,
            run: async (ids) => downloadZip(ids),
            clearOnDone: false,
          },
          {
            key: 'delete',
            label: '批量删除',
            icon: <Trash2 size={14} />,
            destructive: true,
            confirmText: '确认删除已选素材？文件会一并从存储中移除。',
            run: async (ids) => {
              const r = await bulkSerial(ids, async (id) => {
                const res = await fetch(`/api/assets/${id}`, { method: 'DELETE' });
                const j = await res.json().catch(() => ({}));
                if (!res.ok || !j.ok) throw new Error(j.error || `删除 ${id} 失败`);
              });
              const failedIds = new Set(r.failed.map((f) => f.id));
              setAssets((arr) =>
                arr.filter((x) => !ids.includes(x.id) || failedIds.has(x.id)),
              );
              if (r.failed.length === 0) {
                return { ok: true, message: `已删除 ${r.ok} 张素材` };
              }
              return {
                ok: false,
                message: `部分失败：成功 ${r.ok} / 失败 ${r.failed.length}`,
              };
            },
          },
        ]}
        cardGridClassName="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
        renderCard={(a) => {
          const fav = !!favMap[a.id];
          const pending = favPending.has(a.id);
          return (
            <div
              className={
                'card overflow-hidden flex flex-col h-full transition-shadow ' +
                (fav ? 'ring-2 ring-amber-400' : '')
              }
            >
              <div className="relative">
                <button
                  type="button"
                  onClick={() => openLightbox(a.id)}
                  className="aspect-square w-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden"
                  aria-label="查看大图"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.url}
                    alt={a.fileName}
                    className="w-full h-full object-cover hover:opacity-90 transition-opacity cursor-zoom-in"
                  />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(a.id);
                  }}
                  disabled={pending}
                  aria-label={fav ? '取消收藏' : '收藏'}
                  title={fav ? '取消收藏' : '收藏'}
                  className={
                    'absolute top-1.5 right-1.5 inline-flex items-center justify-center w-7 h-7 rounded-full backdrop-blur-sm transition-colors ' +
                    (fav
                      ? 'bg-amber-100/90 text-amber-600 hover:bg-amber-200/90'
                      : 'bg-white/70 text-slate-500 hover:bg-white hover:text-rose-500 dark:bg-slate-900/70')
                  }
                >
                  <Heart size={14} fill={fav ? 'currentColor' : 'none'} />
                </button>
              </div>
              <div className="p-3 flex flex-col gap-1 text-xs flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="badge-blue">{a.type}</span>
                  <span className="badge-gray">
                    {a.source === 'ai_generated' ? 'AI 生成' : '手动上传'}
                  </span>
                  {fav && <span className="badge-yellow">已收藏</span>}
                </div>
                <div className="text-slate-500 truncate">
                  {a.platform || '-'} / {a.category || '-'}
                </div>
                {a.prompt && (
                  <div className="text-slate-500 line-clamp-2" title={a.prompt}>
                    {a.prompt}
                  </div>
                )}
                <div className="text-slate-400 mt-auto pt-1">
                  {new Date(a.createdAt).toLocaleString('zh-CN')}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  {a.prompt && (
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(a.prompt);
                        toast.success('已复制 prompt');
                      }}
                      className="text-brand-600 hover:underline"
                    >
                      复制提示词
                    </button>
                  )}
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-600 hover:underline"
                  >
                    原图
                  </a>
                </div>
              </div>
            </div>
          );
        }}
      />

      {lightboxIndex !== null && lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={(i) => setLightboxIndex(i)}
        />
      )}
    </>
  );
}
