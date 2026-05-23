'use client';

import { useState } from 'react';
import { Trash2, Send } from 'lucide-react';
import { copyAll, buildXhsBundle, buildXianyuBundle } from '@/lib/clipboard';
import { toast } from '@/lib/toast';
import ListShell, { bulkSerial } from '@/components/ListShell';

interface Item {
  id: string;
  type: 'post' | 'product';
  platform: string;
  title: string;
  body: string;
  coverText?: string;
  tags?: string;
  cta?: string;
  priceTier?: string;
  status: string;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  reviewed: '已审核',
  published: '已发布',
};

const PLATFORM_FILTER_OPTIONS = [
  { value: '', label: '全部平台' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'xianyu', label: '闲鱼' },
];

const TYPE_FILTER_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'post', label: '小红书笔记' },
  { value: 'product', label: '闲鱼商品' },
];

const STATUS_FILTER_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'reviewed', label: '已审核' },
  { value: 'published', label: '已发布' },
];

export default function ContentsClient({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState<Item[]>(initial);

  async function copyItem(it: Item) {
    const text =
      it.type === 'post'
        ? buildXhsBundle({
            title: it.title,
            body: it.body,
            tags: it.tags ? it.tags.split(',').filter(Boolean) : [],
            coverText: it.coverText,
            cta: it.cta,
          })
        : buildXianyuBundle({
            title: it.title,
            description: it.body,
            coverText: it.coverText,
          });
    const ok = await copyAll(text);
    if (ok) toast.success('已复制完整内容');
    else toast.error('复制失败');
  }

  async function setItemStatus(it: Item, status: string) {
    const res = await fetch(`/api/contents/${it.type}/${it.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      toast.error(j.error || '保存失败');
      return;
    }
    setItems((arr) =>
      arr.map((x) =>
        x.id === it.id && x.type === it.type ? { ...x, status } : x,
      ),
    );
  }

  async function delItem(it: Item) {
    if (!confirm('确定删除？')) return;
    const res = await fetch(`/api/contents/${it.type}/${it.id}`, {
      method: 'DELETE',
    });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      toast.error(j.error || '删除失败');
      return;
    }
    setItems((arr) =>
      arr.filter((x) => !(x.id === it.id && x.type === it.type)),
    );
    toast.success('已删除');
  }

  // ListShell 用 id 区分；同一 id 在 post/product 间不会冲突（cuid），保险起见拼前缀
  const augmented = items.map((it) => ({ ...it, _key: `${it.type}:${it.id}` }));

  return (
    <ListShell<typeof augmented[number]>
      items={augmented}
      getId={(it) => it._key}
      storageKey="list:contents"
      title={
        <span className="text-slate-700 dark:text-slate-200">内容仓库</span>
      }
      searchPlaceholder="搜索标题或正文"
      searchKeys={['title', 'body']}
      filters={[
        {
          key: 'type',
          label: '类型',
          options: TYPE_FILTER_OPTIONS,
          predicate: (it, v) => it.type === v,
        },
        {
          key: 'platform',
          label: '平台',
          options: PLATFORM_FILTER_OPTIONS,
          predicate: (it, v) => it.platform === v,
        },
        {
          key: 'status',
          label: '状态',
          options: STATUS_FILTER_OPTIONS,
          predicate: (it, v) => it.status === v,
        },
      ]}
      viewModes={['card']}
      pageSize={60}
      emptyState="尚无内容。先去 /content 生成一条吧。"
      onToastSuccess={(m) => toast.success(m)}
      onToastError={(m) => toast.error(m)}
      bulk={[
        {
          key: 'publish',
          label: '改为已发布',
          icon: <Send size={14} />,
          run: async (keys) => {
            const targets = augmented.filter((x) => keys.includes(x._key));
            const r = await bulkSerial(
              targets.map((t) => t._key),
              async (k) => {
                const it = targets.find((x) => x._key === k)!;
                const res = await fetch(`/api/contents/${it.type}/${it.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: 'published' }),
                });
                const j = await res.json().catch(() => ({}));
                if (!res.ok || !j.ok) throw new Error(j.error || '保存失败');
                setItems((arr) =>
                  arr.map((x) =>
                    x.id === it.id && x.type === it.type
                      ? { ...x, status: 'published' }
                      : x,
                  ),
                );
              },
            );
            if (r.failed.length === 0)
              return { ok: true, message: `已批量设为已发布（${r.ok} 项）` };
            return {
              ok: false,
              message: `部分失败：成功 ${r.ok} / 失败 ${r.failed.length}`,
            };
          },
        },
        {
          key: 'delete',
          label: '批量删除',
          icon: <Trash2 size={14} />,
          destructive: true,
          confirmText: '确认删除已选内容？此操作不可撤销。',
          run: async (keys) => {
            const targets = augmented.filter((x) => keys.includes(x._key));
            const r = await bulkSerial(
              targets.map((t) => t._key),
              async (k) => {
                const it = targets.find((x) => x._key === k)!;
                const res = await fetch(`/api/contents/${it.type}/${it.id}`, {
                  method: 'DELETE',
                });
                const j = await res.json().catch(() => ({}));
                if (!res.ok || !j.ok) throw new Error(j.error || '删除失败');
              },
            );
            const failedKeys = new Set(r.failed.map((f) => f.id));
            setItems((arr) =>
              arr.filter((x) => {
                const k = `${x.type}:${x.id}`;
                if (!keys.includes(k)) return true;
                return failedKeys.has(k);
              }),
            );
            if (r.failed.length === 0)
              return { ok: true, message: `已删除 ${r.ok} 条` };
            return {
              ok: false,
              message: `部分失败：成功 ${r.ok} / 失败 ${r.failed.length}`,
            };
          },
        },
      ]}
      cardGridClassName="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
      renderCard={(it) => {
        const platLabel =
          it.platform === 'xiaohongshu' ? '小红书' : '闲鱼';
        const stripColor =
          it.platform === 'xiaohongshu' ? 'bg-rose-500' : 'bg-amber-500';
        const date = new Date(it.createdAt).toLocaleString('zh-CN');
        return (
          <div className="card relative overflow-hidden flex flex-col h-full">
            <div
              className={`absolute top-0 left-0 bottom-0 w-1 ${stripColor}`}
            />
            <div className="card-body pl-12 flex-1 flex flex-col">
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span
                  className={
                    it.platform === 'xiaohongshu' ? 'badge-red' : 'badge-yellow'
                  }
                >
                  {platLabel}
                </span>
                <span className="badge-gray">
                  {it.type === 'post' ? '笔记' : '商品'}
                </span>
                <span className="badge-blue">
                  {STATUS_LABEL[it.status] ?? it.status}
                </span>
                <span className="text-slate-400 ml-auto">{date}</span>
              </div>
              <h3 className="mt-2 font-semibold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2">
                {it.title}
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-4 whitespace-pre-wrap">
                {it.body}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => copyItem(it)}
                  className="btn-primary text-xs px-3 py-1.5"
                >
                  📋 一键复制
                </button>
                <select
                  value={it.status}
                  onChange={(e) => setItemStatus(it, e.target.value)}
                  className="input text-xs py-1 w-24"
                >
                  <option value="draft">草稿</option>
                  <option value="reviewed">已审核</option>
                  <option value="published">已发布</option>
                </select>
                <button
                  onClick={() => delItem(it)}
                  className="text-red-600 hover:underline text-xs ml-auto"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        );
      }}
    />
  );
}
