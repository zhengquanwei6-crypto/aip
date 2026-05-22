'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { IMAGE_TYPES } from '@/lib/constants';

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

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '全部来源' },
  { value: 'ai_generated', label: 'AI生成' },
  { value: 'manual_upload', label: '手动上传' },
];

export default function AssetsClient({
  initialAssets,
  filters,
}: {
  initialAssets: Asset[];
  filters: { type: string; source: string };
}) {
  const router = useRouter();
  const [assets, setAssets] = useState(initialAssets);
  const [type, setType] = useState(filters.type);
  const [source, setSource] = useState(filters.source);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function applyFilter() {
    const sp = new URLSearchParams();
    if (type) sp.set('type', type);
    if (source) sp.set('source', source);
    router.push(`/assets${sp.toString() ? '?' + sp.toString() : ''}`);
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', type || '封面图');
      const res = await fetch('/api/assets/upload', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '上传失败');
      setAssets((arr) => [j.asset, ...arr]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function remove(id: string) {
    if (!confirm('确定删除这张图片吗？文件会一并删除。')) return;
    const res = await fetch(`/api/assets/${id}`, { method: 'DELETE' });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      alert(j.error || '删除失败');
      return;
    }
    setAssets((arr) => arr.filter((a) => a.id !== id));
  }

  return (
    <div className="space-y-4">
      {/* 顶部操作栏 */}
      <div className="card">
        <div className="card-body flex items-end flex-wrap gap-3">
          <div>
            <label className="label">图片类型</label>
            <select
              className="input w-40"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">全部类型</option>
              {IMAGE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">来源</label>
            <select
              className="input w-32"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              {SOURCE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <button onClick={applyFilter} className="btn-secondary">
            筛选
          </button>
          <div className="flex-1" />
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
            className="btn-primary"
          >
            {uploading ? '上传中...' : '上传图片'}
          </button>
        </div>
      </div>

      {error && (
        <div className="card border-red-200 bg-red-50">
          <div className="card-body text-sm text-red-700">{error}</div>
        </div>
      )}

      {/* 网格 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {assets.map((a) => (
          <div key={a.id} className="card overflow-hidden flex flex-col">
            <div className="aspect-square bg-slate-100 flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url}
                alt={a.fileName}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-3 flex flex-col gap-1 text-xs flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="badge-blue">{a.type}</span>
                <span className="badge-gray">
                  {a.source === 'ai_generated' ? 'AI生成' : '手动上传'}
                </span>
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
                    onClick={() => navigator.clipboard?.writeText(a.prompt)}
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
                <button
                  onClick={() => remove(a.id)}
                  className="text-red-600 hover:underline ml-auto"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        ))}
        {assets.length === 0 && (
          <div className="col-span-full card">
            <div className="card-body text-center text-sm text-slate-400 py-8">
              暂无素材
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
