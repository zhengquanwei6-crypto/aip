'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AdapterConfig } from '@/lib/adapter-types';
import { toast } from '@/lib/toast';

interface Props {
  initialAdapters: AdapterConfig[];
}

export default function AdaptersClient({ initialAdapters }: Props) {
  const [adapters, setAdapters] = useState(initialAdapters);
  const [busySlug, setBusySlug] = useState<string | null>(null);

  async function refresh() {
    const r = await fetch('/api/adapters');
    const j = await r.json();
    if (j.ok) setAdapters(j.adapters);
  }

  async function toggleEnabled(slug: string, current: boolean) {
    setBusySlug(slug);
    try {
      const target = adapters.find((a) => a.slug === slug);
      if (!target) return;
      const next = { ...target, enabled: !current };
      const r = await fetch(`/api/adapters/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || '保存失败');
      await refresh();
      toast.success(current ? `已停用 ${slug}` : `已启用 ${slug}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusySlug(null);
    }
  }

  async function remove(slug: string) {
    if (!confirm(`删除 adapter "${slug}"？此操作不可恢复。`)) return;
    setBusySlug(slug);
    try {
      const r = await fetch(`/api/adapters/${slug}`, { method: 'DELETE' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || '删除失败');
      await refresh();
      toast.success(`已删除 ${slug}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusySlug(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-slate-500">
          共 <span className="font-medium text-slate-700 dark:text-slate-300">{adapters.length}</span> 个 adapter
        </div>
        <Link href="/adapters/new" className="btn-primary text-sm">+ 新建 adapter</Link>
      </div>

      {adapters.length === 0 && (
        <div className="card">
          <div className="card-body py-12 text-center text-sm text-slate-400">
            暂无 adapter。点击「新建 adapter」从一份 API 文档开始。
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {adapters.map((a) => (
          <div key={a.slug} className="card">
            <div className="card-body space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{a.name}</span>
                    <span className={a.flow.type === 'sync' ? 'badge-blue' : 'badge-purple'}>
                      {a.flow.type === 'sync' ? '同步' : '异步轮询'}
                    </span>
                    <span className={a.enabled ? 'badge-green' : 'badge-gray'}>
                      {a.enabled ? '启用' : '停用'}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500 truncate">slug: {a.slug}</div>
                  <div className="mt-1 text-xs text-slate-500 truncate">{a.baseUrl}</div>
                  {a.description && (
                    <div className="mt-2 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{a.description}</div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Link href={`/adapters/${a.slug}`} className="btn-secondary text-xs px-2 py-1">编辑</Link>
                <button
                  onClick={() => toggleEnabled(a.slug, a.enabled)}
                  disabled={busySlug === a.slug}
                  className="btn-secondary text-xs px-2 py-1"
                >
                  {a.enabled ? '停用' : '启用'}
                </button>
                <button
                  onClick={() => remove(a.slug)}
                  disabled={busySlug === a.slug}
                  className="btn-danger text-xs px-2 py-1 ml-auto"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
