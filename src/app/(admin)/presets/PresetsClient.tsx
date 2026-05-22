'use client';

import { useState } from 'react';
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

export default function PresetsClient({ initial }: { initial: Preset[] }) {
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<Preset | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function show(s: string) {
    setMsg(s);
    setTimeout(() => setMsg(null), 2000);
  }

  async function save(p: Preset) {
    if (!p.name.trim() || !p.styleKeywords.trim()) {
      show('请填写名称和风格关键词');
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
      show('已保存');
    } catch (e) {
      show((e as Error).message);
    }
  }

  async function del(id: string) {
    if (!confirm('删除此预设？')) return;
    const res = await fetch(`/api/image-presets/${id}`, { method: 'DELETE' });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      show(j.error || '删除失败');
      return;
    }
    setItems((arr) => arr.filter((x) => x.id !== id));
    show('已删除');
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-body flex items-center justify-between">
          <div>
            <h2 className="font-semibold">图片样式预设</h2>
            <div className="text-xs text-slate-400 mt-1">
              在「图片生成」页选预设可一键填充风格关键词、尺寸、负向词
            </div>
          </div>
          <div className="flex items-center gap-3">
            {msg && <span className="text-sm text-emerald-600">{msg}</span>}
            <button
              onClick={() => setEditing({ ...EMPTY })}
              className="btn-primary"
            >
              ➕ 新增预设
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((p) => (
          <div key={p.id} className="card flex flex-col">
            <div className="card-body flex-1 space-y-2">
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
        {items.length === 0 && (
          <div className="col-span-full card">
            <div className="card-body text-center text-slate-400 py-8">
              暂无预设，点右上角新增
            </div>
          </div>
        )}
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="bg-white rounded-lg p-5 w-full max-w-lg space-y-3 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold">{editing.id ? '编辑' : '新增'}预设</h3>
            <Field label="名称">
              <input
                className="input"
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
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
            <label className="flex items-center gap-3 p-2 rounded border border-slate-200 cursor-pointer">
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
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
