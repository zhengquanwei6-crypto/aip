'use client';

import { useState } from 'react';
import { IMAGE_TYPES } from '@/lib/constants';
import { toast } from '@/lib/toast';
import SimpleListShell from '@/components/SimpleListShell';
import { bulkSerial } from '@/components/ListShell';

interface Preset {
  id: string;
  name: string;
  styleKeywords: string;
  negativePrompt: string;
  size: string;
  imageType: string;
  isDefault: boolean;
}

const EMPTY: Preset = {
  id: '',
  name: '',
  styleKeywords: '',
  negativePrompt: '',
  size: '1024x1536',
  imageType: '封面图',
  isDefault: false,
};

export default function PresetsClient({ initial }: { initial: Preset[] }) {
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<Preset | null>(null);

  async function save(p: Preset) {
    if (!p.name.trim() || !p.styleKeywords.trim()) {
      toast.error('请填写名称和风格关键词');
      return;
    }
    try {
      const isNew = !p.id;
      const url = isNew ? '/api/image-presets' : `/api/image-presets/${p.id}`;
      const method = isNew ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '保存失败');
      const item: Preset = {
        ...j.item,
        negativePrompt: j.item.negativePrompt ?? '',
      };
      setItems((arr) => {
        let next = isNew ? [item, ...arr] : arr.map((x) => (x.id === p.id ? item : x));
        if (item.isDefault) {
          next = next.map((x) =>
            x.id === item.id ? x : { ...x, isDefault: false },
          );
        }
        return next;
      });
      setEditing(null);
      toast.success('已保存');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function del(id: string) {
    if (!confirm('删除此预设？')) return;
    const res = await fetch(`/api/image-presets/${id}`, { method: 'DELETE' });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      toast.error(j.error || '删除失败');
      return;
    }
    setItems((arr) => arr.filter((x) => x.id !== id));
    toast.success('已删除');
  }

  return (
    <>
      <SimpleListShell<Preset>
        items={items}
        getId={(p) => p.id}
        storageKey="list:presets"
        searchPlaceholder="搜索预设名称 / 风格 / 类型"
        searchKeys={['name', 'styleKeywords', 'imageType', 'size']}
        toolbar={
          <>
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              图片样式预设
            </span>
            <div className="flex-1" />
            <button
              onClick={() => setEditing({ ...EMPTY })}
              className="btn-primary text-sm"
            >
              ➕ 新增预设
            </button>
          </>
        }
        onToastSuccess={(m) => toast.success(m)}
        onToastError={(m) => toast.error(m)}
        bulkDelete={{
          confirmText: (n) => `确认删除已选 ${n} 个预设？`,
          run: async (ids) => {
            const r = await bulkSerial(ids, async (id) => {
              const res = await fetch(`/api/image-presets/${id}`, {
                method: 'DELETE',
              });
              const j = await res.json().catch(() => ({}));
              if (!res.ok || !j.ok) throw new Error(j.error || '删除失败');
            });
            const failedIds = new Set(r.failed.map((f) => f.id));
            setItems((arr) =>
              arr.filter((x) => !ids.includes(x.id) || failedIds.has(x.id)),
            );
            if (r.failed.length === 0)
              return { ok: true, message: `已删除 ${r.ok} 个预设` };
            return {
              ok: false,
              message: `部分失败：成功 ${r.ok} / 失败 ${r.failed.length}`,
            };
          },
        }}
      >
        {(filtered, helpers) => (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((p) => (
              <div
                key={p.id}
                className={
                  'card flex flex-col relative ' +
                  (helpers.isSelected(p.id) ? 'ring-2 ring-brand-500' : '')
                }
              >
                <label
                  className={
                    'absolute top-2 left-2 z-10 inline-flex items-center justify-center w-6 h-6 rounded border bg-white/90 dark:bg-slate-900/90 cursor-pointer ' +
                    (helpers.isSelected(p.id)
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-slate-300 dark:border-slate-600')
                  }
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={helpers.isSelected(p.id)}
                    onChange={() => helpers.toggle(p.id)}
                  />
                  {helpers.isSelected(p.id) ? '✓' : ''}
                </label>
                <div className="card-body flex-1 space-y-2 pl-12">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                      {p.name}
                    </h3>
                    {p.isDefault && <span className="badge-blue">默认</span>}
                    <span className="badge-gray">{p.imageType}</span>
                    <span className="badge-gray">{p.size}</span>
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {p.styleKeywords}
                  </div>
                  {p.negativePrompt && (
                    <div className="text-xs text-slate-400 leading-relaxed">
                      负向：{p.negativePrompt}
                    </div>
                  )}
                </div>
                <div className="px-5 pb-4 flex items-center gap-3 text-sm">
                  <button
                    onClick={() => setEditing(p)}
                    className="text-brand-600 hover:underline"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => del(p.id)}
                    className="text-red-600 hover:underline ml-auto"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SimpleListShell>

      {editing && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-lg p-5 w-full max-w-lg space-y-3 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold">{editing.id ? '编辑' : '新增'}预设</h3>
            <Field label="名称">
              <input
                className="input"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="例：小红书简约白底"
              />
            </Field>
            <Field label="风格关键词（正向）">
              <textarea
                className="input min-h-[100px]"
                value={editing.styleKeywords}
                onChange={(e) =>
                  setEditing({ ...editing, styleKeywords: e.target.value })
                }
              />
            </Field>
            <Field label="负向提示词（可选）">
              <textarea
                className="input min-h-[60px]"
                value={editing.negativePrompt}
                onChange={(e) =>
                  setEditing({ ...editing, negativePrompt: e.target.value })
                }
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="图片类型">
                <select
                  className="input"
                  value={editing.imageType}
                  onChange={(e) =>
                    setEditing({ ...editing, imageType: e.target.value })
                  }
                >
                  {IMAGE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="尺寸">
                <input
                  className="input"
                  value={editing.size}
                  onChange={(e) =>
                    setEditing({ ...editing, size: e.target.value })
                  }
                />
              </Field>
            </div>
            <label className="flex items-center gap-3 p-2 rounded border border-slate-200 dark:border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={editing.isDefault}
                onChange={(e) =>
                  setEditing({ ...editing, isDefault: e.target.checked })
                }
                className="w-4 h-4"
              />
              <span className="text-sm">设为默认（图片生成时自动套用）</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setEditing(null)} className="btn-secondary">
                取消
              </button>
              <button onClick={() => save(editing)} className="btn-primary">
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
