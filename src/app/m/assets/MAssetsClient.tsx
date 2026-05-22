'use client';

import { useRef, useState } from 'react';
import { useToast } from '@/components/m/Toast';
import { copyAll } from '@/lib/clipboard';
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

export default function MAssetsClient({ initial }: { initial: Asset[] }) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState('');
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<Asset | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const filtered = filter ? items.filter((a) => a.type === filter) : items;

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', filter || '封面图');
      const res = await fetch('/api/assets/upload', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '上传失败');
      setItems((arr) => [j.asset, ...arr]);
      toast.show('已上传', 'success');
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function del(id: string) {
    if (!confirm('删除？')) return;
    const res = await fetch(`/api/assets/${id}`, { method: 'DELETE' });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      toast.show(j.error || '删除失败', 'error');
      return;
    }
    setItems((arr) => arr.filter((a) => a.id !== id));
    setPreview(null);
    toast.show('已删除', 'success');
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-2">
        <select
          className="m-input"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">全部类型</option>
          {IMAGE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full rounded-lg bg-brand-600 text-white font-medium py-2.5 active:bg-brand-700 disabled:opacity-60"
        >
          {uploading ? '上传中...' : '📤 上传图片'}
        </button>
      </div>

      <div className="text-xs text-slate-500 px-1">共 {filtered.length} 张</div>

      <div className="grid grid-cols-2 gap-2">
        {filtered.map((a) => (
          <div
            key={a.id}
            onClick={() => setPreview(a)}
            className="rounded-xl bg-white border border-slate-200 overflow-hidden active:opacity-80"
          >
            <div className="aspect-square bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url}
                alt={a.fileName}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-2 text-xs space-y-1">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="badge-blue">{a.type}</span>
                <span className="text-slate-400">
                  {a.source === 'ai_generated' ? 'AI' : '上传'}
                </span>
              </div>
              <div className="text-slate-500 truncate">
                {a.platform || '-'} / {a.category || '-'}
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-2 rounded-xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-400">
            暂无素材
          </div>
        )}
      </div>

      {/* 预览大图 */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex flex-col"
          onClick={() => setPreview(null)}
        >
          <div className="flex-1 flex items-center justify-center p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.url}
              alt=""
              className="max-w-full max-h-full"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div
            className="bg-white rounded-t-2xl p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="badge-blue">{preview.type}</span>
              <span className="badge-gray">
                {preview.source === 'ai_generated' ? 'AI 生成' : '手动上传'}
              </span>
              {preview.platform && (
                <span className="badge-gray">{preview.platform}</span>
              )}
              {preview.category && (
                <span className="badge-gray">{preview.category}</span>
              )}
            </div>
            {preview.prompt && (
              <div>
                <div className="text-xs text-slate-500 mb-1">提示词</div>
                <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                  {preview.prompt}
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {preview.prompt && (
                <button
                  onClick={async () => {
                    const ok = await copyAll(preview.prompt);
                    toast.show(ok ? '提示词已复制' : '复制失败', ok ? 'success' : 'error');
                  }}
                  className="rounded-md border border-slate-300 text-xs py-2.5"
                >
                  复制提示词
                </button>
              )}
              <a
                href={preview.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-slate-300 text-xs py-2.5 text-center bg-white text-slate-700 active:bg-slate-50"
              >
                打开原图
              </a>
              <button
                onClick={() => del(preview.id)}
                className="rounded-md border border-red-300 text-red-600 text-xs py-2.5 active:bg-red-50"
              >
                删除
              </button>
            </div>
            <button
              onClick={() => setPreview(null)}
              className="w-full rounded-md bg-slate-100 text-slate-700 text-sm py-2.5"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
