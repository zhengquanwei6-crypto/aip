'use client';

import { useState } from 'react';
import { useToast } from '@/components/m/Toast';
import { IMAGE_TYPES } from '@/lib/constants';

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

export default function MPresetsClient({ initial }: { initial: Preset[] }) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<Preset | null>(null);

  async function save(p: Preset) {
    if (!p.name.trim() || !p.styleKeywords.trim()) {
      toast.show('请填写名称和风格关键词', 'error');
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
      // 如果设为默认，需要把别的设为非默认
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
      toast.show('已保存', 'success');
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }

  async function del(id: string) {
    if (!confirm('删除此预设？')) return;
    const res = await fetch(`/api/image-presets/${id}`, { method: 'DELETE' });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      toast.show(j.error || '删除失败', 'error');
      return;
    }
    setItems((arr) => arr.filter((x) => x.id !== id));
    toast.show('已删除', 'success');
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => setEditing({ ...EMPTY })}
        className="w-full rounded-lg bg-brand-600 text-white font-medium py-3 active:bg-brand-700"
      >
        ➕ 新增图片预设
      </button>

      {items.map((p) => (
        <div
          key={p.id}
          className="rounded-xl bg-white border border-slate-200 p-3 space-y-2"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-slate-800">{p.name}</h3>
            {p.isDefault && <span className="badge-blue">默认</span>}
            <span className="badge-gray">{p.imageType}</span>
            <span className="badge-gray">{p.size}</span>
          </div>
          <div className="text-sm text-slate-600 leading-relaxed">
            {p.styleKeywords}
          </div>
          {p.negativePrompt && (
            <div className="text-xs text-slate-400">
              负向：{p.negativePrompt}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setEditing(p)}
              className="flex-1 rounded-md border border-slate-300 text-xs py-2 active:bg-slate-50"
            >
              编辑
            </button>
            <button
              onClick={() => del(p.id)}
              className="flex-1 rounded-md border border-red-300 text-red-600 text-xs py-2 active:bg-red-50"
            >
              删除
            </button>
          </div>
        </div>
      ))}

      {items.length === 0 && (
        <div className="rounded-xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-400">
          暂无预设
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end"
          onClick={() => setEditing(null)}
        >
          <div
            className="bg-white rounded-t-2xl p-4 w-full space-y-3 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold">{editing.id ? '编辑' : '新增'}预设</h3>
            <Field label="名称">
              <input
                className="m-input"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="如：小红书简约白底"
              />
            </Field>
            <Field label="风格关键词（正向）">
              <textarea
                className="m-input min-h-[80px]"
                value={editing.styleKeywords}
                onChange={(e) =>
                  setEditing({ ...editing, styleKeywords: e.target.value })
                }
                placeholder="简约现代、高级感、清爽白底..."
              />
            </Field>
            <Field label="负向提示词（可选）">
              <textarea
                className="m-input min-h-[60px]"
                value={editing.negativePrompt}
                onChange={(e) =>
                  setEditing({ ...editing, negativePrompt: e.target.value })
                }
                placeholder="low quality, blurry..."
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="图片类型">
                <select
                  className="m-input"
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
                  className="m-input"
                  value={editing.size}
                  onChange={(e) =>
                    setEditing({ ...editing, size: e.target.value })
                  }
                  placeholder="1024x1536"
                />
              </Field>
            </div>
            <label className="flex items-center gap-3 p-2 rounded border border-slate-200">
              <input
                type="checkbox"
                checked={editing.isDefault}
                onChange={(e) =>
                  setEditing({ ...editing, isDefault: e.target.checked })
                }
                className="w-5 h-5"
              />
              <span className="text-sm">设为默认（图片生成时自动套用）</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setEditing(null)}
                className="rounded-lg border border-slate-300 text-slate-700 font-medium py-3"
              >
                取消
              </button>
              <button
                onClick={() => save(editing)}
                className="rounded-lg bg-brand-600 text-white font-medium py-3"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
