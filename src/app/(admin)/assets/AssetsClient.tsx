'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Check,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  Grid3X3,
  Heart,
  Image as ImageIcon,
  List,
  Search,
  Share2,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';

import { IMAGE_TYPES } from '@/lib/constants';
import { toast } from '@/lib/toast';
import ImageLightbox from '@/components/ImageLightbox';
import ShareCreateModal from '@/components/share/ShareCreateModal';
import EmptyActionState from '@/components/command/EmptyActionState';

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

type ViewMode = 'grid' | 'list';

const SOURCE_OPTIONS = [
  { value: '', label: '全部来源' },
  { value: 'ai_generated', label: 'AI 生成' },
  { value: 'manual_upload', label: '手动上传' },
];

const TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  ...IMAGE_TYPES.map((type) => ({ value: type, label: type })),
];

function sourceLabel(source: string) {
  if (source === 'ai_generated') return 'AI 生成';
  if (source === 'manual_upload') return '手动上传';
  return source || '未知来源';
}

function sortByFavorite(list: Asset[], favMap: Record<string, boolean>) {
  return list
    .slice()
    .sort((a, b) => (favMap[b.id] ? 1 : 0) - (favMap[a.id] ? 1 : 0));
}

export default function AssetsClient({
  initialAssets,
  initialFavMap = {},
  filters,
}: {
  initialAssets: Asset[];
  filters?: { type: string; source: string };
  initialFavMap?: Record<string, boolean>;
}) {
  const [assets, setAssets] = useState(() => sortByFavorite(initialAssets, initialFavMap));
  const [favMap, setFavMap] = useState<Record<string, boolean>>(initialFavMap);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState(filters?.source ?? '');
  const [type, setType] = useState(filters?.type ?? '');
  const [favOnly, setFavOnly] = useState(false);
  const [view, setView] = useState<ViewMode>('grid');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [taskPending, setTaskPending] = useState<Set<string>>(new Set());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [shareAsset, setShareAsset] = useState<{ id: string; url: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const visibleAssets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (source && asset.source !== source) return false;
      if (type && asset.type !== type) return false;
      if (favOnly && !favMap[asset.id]) return false;
      if (!q) return true;
      return [asset.prompt, asset.fileName, asset.category, asset.type, asset.platform]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [assets, favMap, favOnly, query, source, type]);

  const lightboxImages = visibleAssets.map((asset) => ({
    url: asset.url,
    alt: asset.fileName || asset.type,
  }));

  const selectedVisibleCount = visibleAssets.filter((asset) => selected.has(asset.id)).length;
  const assetStats = useMemo(
    () => [
      { label: '资产总量', value: assets.length, note: '可分享、可复用、可建任务' },
      { label: 'AI 生成', value: assets.filter((asset) => asset.source === 'ai_generated').length, note: '创作结果已入库' },
      { label: '收藏素材', value: Object.keys(favMap).length, note: '高价值样稿优先展示' },
      { label: '当前视图', value: visibleAssets.length, note: selected.size > 0 ? `已选择 ${selected.size} 个` : '筛选后可操作素材' },
    ],
    [assets, favMap, selected.size, visibleAssets.length],
  );

  function setAssetBusy(id: string, busy: boolean) {
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

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
      setAssets((list) => sortByFavorite([j.asset as Asset, ...list], favMap));
      toast.success('图片已上传');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectVisible() {
    setSelected((current) => {
      const next = new Set(current);
      if (selectedVisibleCount === visibleAssets.length) {
        for (const asset of visibleAssets) next.delete(asset.id);
      } else {
        for (const asset of visibleAssets) next.add(asset.id);
      }
      return next;
    });
  }

  async function toggleFavorite(id: string) {
    if (busyIds.has(id)) return;
    const currentFav = Boolean(favMap[id]);
    const nextFav = !currentFav;
    setAssetBusy(id, true);
    const previous = favMap;
    const optimistic = { ...favMap, [id]: nextFav };
    if (!nextFav) delete optimistic[id];
    setFavMap(optimistic);
    setAssets((list) => sortByFavorite(list, optimistic));
    try {
      const res = await fetch(`/api/assets/${id}/favorite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: nextFav }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '操作失败');
      toast.success(nextFav ? '已收藏' : '已取消收藏');
    } catch (e) {
      setFavMap(previous);
      setAssets((list) => sortByFavorite(list, previous));
      toast.error((e as Error).message);
    } finally {
      setAssetBusy(id, false);
    }
  }

  function getExtFromUrl(url: string, fallback = 'jpg') {
    const match = url.match(/\.([a-zA-Z0-9]{1,5})(?:\?|#|$)/);
    return match ? match[1].toLowerCase() : fallback;
  }

  async function downloadZip(ids: string[]) {
    if (ids.length === 0) {
      toast.error('请先选择素材');
      return;
    }
    setZipping(true);
    try {
      const JSZipMod = await import('jszip');
      const JSZip = (JSZipMod as any).default || JSZipMod;
      const zip = new JSZip();
      const idSet = new Set(ids);
      const list = assets.filter((asset) => idSet.has(asset.id));
      let success = 0;
      for (const asset of list) {
        try {
          const res = await fetch(asset.url);
          if (!res.ok) throw new Error(`下载失败：${asset.url}`);
          const blob = await res.blob();
          const ext = getExtFromUrl(asset.url, 'jpg');
          const safeName =
            asset.fileName && /\.\w{1,5}$/.test(asset.fileName)
              ? asset.fileName
              : `${asset.source || 'asset'}-${asset.id}.${ext}`;
          zip.file(safeName, blob);
          success++;
        } catch (e) {
          if (process.env.NODE_ENV !== 'production') console.warn('zip skip', asset.id, e);
        }
      }
      if (success === 0) throw new Error('没有可打包的图片');
      const out = await zip.generateAsync({ type: 'blob' });
      const dlUrl = URL.createObjectURL(out);
      const anchor = document.createElement('a');
      anchor.href = dlUrl;
      anchor.download = `assets-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(dlUrl), 5000);
      toast.success(`已打包 ${success} 张图片`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setZipping(false);
    }
  }

  async function deleteSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      toast.error('请先选择素材');
      return;
    }
    if (!window.confirm(`确认删除 ${ids.length} 个素材？文件会一并从存储中移除。`)) return;
    let ok = 0;
    const failed: string[] = [];
    for (const id of ids) {
      try {
        const res = await fetch(`/api/assets/${id}`, { method: 'DELETE' });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.ok) throw new Error(j.error || '删除失败');
        ok++;
      } catch {
        failed.push(id);
      }
    }
    setAssets((list) => list.filter((asset) => !ids.includes(asset.id) || failed.includes(asset.id)));
    setSelected(new Set(failed));
    if (failed.length === 0) toast.success(`已删除 ${ok} 个素材`);
    else toast.error(`部分删除失败：成功 ${ok}，失败 ${failed.length}`);
  }

  async function createTaskFromAsset(asset: Asset) {
    if (taskPending.has(asset.id)) return;
    setTaskPending((current) => new Set(current).add(asset.id));
    try {
      const res = await fetch('/api/tasks/from-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: asset.id,
          platform: asset.platform || 'xiaohongshu',
          category: asset.category || asset.type,
          contentType: '素材发布',
          title: asset.category ? `${asset.category}发布任务` : `${asset.type}发布任务`,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || '创建任务失败');
      toast.success('已创建发布任务');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTaskPending((current) => {
        const next = new Set(current);
        next.delete(asset.id);
        return next;
      });
    }
  }

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {assetStats.map((stat) => (
          <AssetSignal key={stat.label} {...stat} />
        ))}
      </section>

      <section className="command-glass mt-4 overflow-hidden">
        <div className="border-b border-slate-200/80 p-4 dark:border-slate-800/80">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center">
              <div className="relative min-w-0 md:w-[320px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  className="input command-input h-10 pl-9"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索提示词、文件名、类目"
                />
              </div>
              <select className="input command-input h-10 md:w-36" value={source} onChange={(e) => setSource(e.target.value)}>
                {SOURCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <select className="input command-input h-10 md:w-36" value={type} onChange={(e) => setType(e.target.value)}>
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setFavOnly((value) => !value)}
                className={favOnly ? 'btn-primary h-10 gap-2 px-3' : 'btn-secondary h-10 gap-2 px-3'}
              >
                <Star className="h-4 w-4" aria-hidden />
                收藏
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="command-segment">
                <button
                  type="button"
                  onClick={() => setView('grid')}
                  className={view === 'grid' ? 'command-segment-item command-segment-item-active p-2' : 'command-segment-item p-2'}
                  aria-label="网格视图"
                >
                  <Grid3X3 className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setView('list')}
                  className={view === 'list' ? 'command-segment-item command-segment-item-active p-2' : 'command-segment-item p-2'}
                  aria-label="列表视图"
                >
                  <List className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadFile(file);
                }}
              />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-primary h-10 gap-2">
                <Upload className="h-4 w-4" aria-hidden />
                {uploading ? '上传中...' : '上传图片'}
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <div>
              当前显示 {visibleAssets.length} / {assets.length} 个素材，已选择 {selected.size} 个
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={toggleSelectVisible} className="btn-secondary h-8 gap-1.5 px-2.5 text-xs">
                <Check className="h-3.5 w-3.5" aria-hidden />
                {selectedVisibleCount === visibleAssets.length && visibleAssets.length > 0 ? '取消本页' : '选择本页'}
              </button>
              <button type="button" onClick={() => downloadZip(Array.from(selected))} disabled={zipping || selected.size === 0} className="btn-secondary h-8 gap-1.5 px-2.5 text-xs">
                <Download className="h-3.5 w-3.5" aria-hidden />
                {zipping ? '打包中...' : '下载 ZIP'}
              </button>
              <button type="button" onClick={deleteSelected} disabled={selected.size === 0} className="btn-danger h-8 gap-1.5 px-2.5 text-xs">
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                批量删除
              </button>
            </div>
          </div>
        </div>

        {visibleAssets.length === 0 ? (
          <div className="p-6">
            <EmptyActionState
              title="没有匹配的素材"
              description="调整筛选条件，或上传一张新图片进入资产指挥库。"
              actionHref="/ai-tools"
              actionLabel="去生成图片"
              icon={<ImageIcon className="h-5 w-5" aria-hidden />}
            />
          </div>
        ) : view === 'grid' ? (
          <div className="grid gap-4 p-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {visibleAssets.map((asset, index) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                index={index}
                selected={selected.has(asset.id)}
                favorite={Boolean(favMap[asset.id])}
                busy={busyIds.has(asset.id)}
                taskBusy={taskPending.has(asset.id)}
                onOpen={() => setLightboxIndex(index)}
                onSelect={() => toggleSelected(asset.id)}
                onFavorite={() => toggleFavorite(asset.id)}
                onShare={() => setShareAsset({ id: asset.id, url: asset.url })}
                onTask={() => createTaskFromAsset(asset)}
              />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleAssets.map((asset, index) => (
              <AssetRow
                key={asset.id}
                asset={asset}
                selected={selected.has(asset.id)}
                favorite={Boolean(favMap[asset.id])}
                busy={busyIds.has(asset.id)}
                taskBusy={taskPending.has(asset.id)}
                onOpen={() => setLightboxIndex(index)}
                onSelect={() => toggleSelected(asset.id)}
                onFavorite={() => toggleFavorite(asset.id)}
                onShare={() => setShareAsset({ id: asset.id, url: asset.url })}
                onTask={() => createTaskFromAsset(asset)}
              />
            ))}
          </div>
        )}
      </section>

      {lightboxIndex !== null && lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={(index) => setLightboxIndex(index)}
        />
      )}

      {shareAsset && (
        <ShareCreateModal
          assetId={shareAsset.id}
          assetUrl={shareAsset.url}
          onClose={() => setShareAsset(null)}
        />
      )}
    </>
  );
}

function AssetCard({
  asset,
  index,
  selected,
  favorite,
  busy,
  taskBusy,
  onOpen,
  onSelect,
  onFavorite,
  onShare,
  onTask,
}: {
  asset: Asset;
  index: number;
  selected: boolean;
  favorite: boolean;
  busy: boolean;
  taskBusy: boolean;
  onOpen: () => void;
  onSelect: () => void;
  onFavorite: () => void;
  onShare: () => void;
  onTask: () => void;
}) {
  return (
    <article className={`asset-command-card detail-lift ${selected ? 'ring-2 ring-cyan-500' : ''}`}>
      <div className="relative">
        <button type="button" onClick={onOpen} className="flex aspect-square w-full items-center justify-center overflow-hidden bg-slate-100 dark:bg-slate-900" aria-label="查看大图">
          <img src={asset.url} alt={asset.fileName || asset.type} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
        </button>
        <div className="absolute left-2 top-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={onSelect}
            className={selected ? 'inline-flex h-7 w-7 items-center justify-center rounded-md bg-cyan-500 text-white shadow' : 'inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/105 text-slate-500 shadow hover:bg-white'}
            aria-label={selected ? '取消选择' : '选择素材'}
          >
            {selected ? <Check className="h-4 w-4" aria-hidden /> : <span className="text-[10px] tabular-nums">{index + 1}</span>}
          </button>
        </div>
        <button
          type="button"
          onClick={onFavorite}
          disabled={busy}
          className={favorite ? 'absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md bg-amber-100/95 text-amber-600 shadow hover:bg-amber-200' : 'absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/105 text-slate-500 shadow hover:bg-white hover:text-rose-500'}
          aria-label={favorite ? '取消收藏' : '收藏'}
        >
          <Heart className="h-4 w-4" fill={favorite ? 'currentColor' : 'none'} aria-hidden />
        </button>
      </div>

      <div className="flex min-h-[186px] flex-col gap-2 p-3 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="badge-blue">{asset.type}</span>
          <span className="badge-gray">{sourceLabel(asset.source)}</span>
          {favorite && <span className="badge-yellow">已收藏</span>}
        </div>
        <div className="truncate text-slate-500">
          {asset.platform || '-'} / {asset.category || '-'}
        </div>
        {asset.prompt ? (
          <div className="line-clamp-2 text-slate-500" title={asset.prompt}>
            {asset.prompt}
          </div>
        ) : (
          <div className="text-slate-400">无提示词记录</div>
        )}
        <div className="mt-auto text-slate-400">
          {new Date(asset.createdAt).toLocaleString('zh-CN')}
        </div>
        <AssetActions asset={asset} taskBusy={taskBusy} onShare={onShare} onTask={onTask} />
      </div>
    </article>
  );
}

function AssetRow({
  asset,
  selected,
  favorite,
  busy,
  taskBusy,
  onOpen,
  onSelect,
  onFavorite,
  onShare,
  onTask,
}: {
  asset: Asset;
  selected: boolean;
  favorite: boolean;
  busy: boolean;
  taskBusy: boolean;
  onOpen: () => void;
  onSelect: () => void;
  onFavorite: () => void;
  onShare: () => void;
  onTask: () => void;
}) {
  return (
    <div className={`flex gap-3 p-3 transition-colors hover:bg-cyan-50/60 dark:hover:bg-cyan-950/20 ${selected ? 'bg-cyan-50/60 dark:bg-cyan-950/20' : ''}`}>
      <button type="button" onClick={onSelect} className={selected ? 'mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-cyan-500 text-white' : 'mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 dark:border-slate-800 dark:bg-slate-950'} aria-label={selected ? '取消选择' : '选择素材'}>
        <Check className="h-4 w-4" aria-hidden />
      </button>
      <button type="button" onClick={onOpen} className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-900" aria-label="查看大图">
        <img src={asset.url} alt={asset.fileName || asset.type} className="h-full w-full object-cover" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="badge-blue">{asset.type}</span>
          <span className="badge-gray">{sourceLabel(asset.source)}</span>
          {favorite && <span className="badge-yellow">已收藏</span>}
        </div>
        <div className="mt-2 truncate text-sm font-medium text-slate-800 dark:text-slate-100">
          {asset.fileName || asset.category || asset.type}
        </div>
        <div className="mt-1 line-clamp-1 text-xs text-slate-500">{asset.prompt || '无提示词记录'}</div>
        <div className="mt-2 text-xs text-slate-400">{new Date(asset.createdAt).toLocaleString('zh-CN')}</div>
      </div>
      <div className="hidden shrink-0 items-center gap-2 lg:flex">
        <button type="button" onClick={onFavorite} disabled={busy} className="btn-secondary h-9 w-9 p-0" aria-label={favorite ? '取消收藏' : '收藏'}>
          <Heart className="h-4 w-4" fill={favorite ? 'currentColor' : 'none'} aria-hidden />
        </button>
        <button type="button" onClick={onShare} className="btn-secondary h-9 w-9 p-0" aria-label="分享">
          <Share2 className="h-4 w-4" aria-hidden />
        </button>
        <button type="button" onClick={onTask} disabled={taskBusy} className="btn-secondary h-9 w-9 p-0" aria-label="创建任务">
          <ClipboardList className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function AssetActions({
  asset,
  taskBusy,
  onShare,
  onTask,
}: {
  asset: Asset;
  taskBusy: boolean;
  onShare: () => void;
  onTask: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
      {asset.prompt && (
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(asset.prompt);
            toast.success('提示词已复制');
          }}
          className="inline-flex items-center gap-1 text-cyan-700 hover:underline dark:text-cyan-300"
        >
          <Copy className="h-3 w-3" aria-hidden />
          复制提示词
        </button>
      )}
      <a href={asset.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-slate-600 hover:underline dark:text-slate-300">
        <ExternalLink className="h-3 w-3" aria-hidden />
        原图
      </a>
      <button type="button" onClick={onShare} className="inline-flex items-center gap-1 text-emerald-700 hover:underline dark:text-emerald-300">
        <Share2 className="h-3 w-3" aria-hidden />
        分享
      </button>
      <button type="button" onClick={onTask} disabled={taskBusy} className="inline-flex items-center gap-1 text-sky-700 hover:underline disabled:opacity-50 dark:text-sky-300">
        <ClipboardList className="h-3 w-3" aria-hidden />
        {taskBusy ? '创建中' : '转任务'}
      </button>
    </div>
  );
}

function AssetSignal({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note: string;
}) {
  return (
    <div className="command-stat-card">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</div>
        <span className="pulse-dot" aria-hidden />
      </div>
      <div className="mt-3 text-2xl font-black tabular-nums text-slate-950 dark:text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{note}</div>
    </div>
  );
}
