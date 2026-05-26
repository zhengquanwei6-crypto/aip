'use client';

/**
 * <KeyOverrideSelector>
 *
 * 低调的右上角小工具，让用户主动指定本页 LLM/IMAGE key。
 *  - 默认折叠成"⚙️ 高级"小按钮
 *  - 展开后两个下拉（仅显示 active 的 key）
 *  - 选择存到 localStorage：keyOverride:{scope}:{kind}
 *  - 选"默认"则恢复走系统池
 *  - 提供 useKeyOverride(scope) hook 给上层读取当前选择
 */

import { useEffect, useState } from 'react';
import { Settings2, Check, ChevronDown } from 'lucide-react';

export type KeyKind = 'llm' | 'image';

export interface KeyItem {
  id: string;
  label: string;
  model: string;
  isDefault: boolean;
}

interface KeyResp {
  ok: boolean;
  keys: { llm: KeyItem[]; image: KeyItem[] };
}

const STORAGE_PREFIX = 'keyOverride:';

function readStored(scope: string, kind: KeyKind): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${scope}:${kind}`);
  } catch { return null; }
}

function writeStored(scope: string, kind: KeyKind, value: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (value) localStorage.setItem(`${STORAGE_PREFIX}${scope}:${kind}`, value);
    else localStorage.removeItem(`${STORAGE_PREFIX}${scope}:${kind}`);
  } catch { /* ignore */ }
}

/** Hook：读取当前页 keyOverride（给调用方 fetch 时塞 body.keyOverride） */
export function useKeyOverride(scope: string): { llm: string | null; image: string | null } {
  const [override, setOverride] = useState<{ llm: string | null; image: string | null }>({ llm: null, image: null });
  useEffect(() => {
    setOverride({ llm: readStored(scope, 'llm'), image: readStored(scope, 'image') });
    function onStorage(e: StorageEvent) {
      if (e.key && e.key.startsWith(`${STORAGE_PREFIX}${scope}:`)) {
        setOverride({ llm: readStored(scope, 'llm'), image: readStored(scope, 'image') });
      }
    }
    window.addEventListener('storage', onStorage);
    // 自定义事件用于同 tab 内多个组件同步
    function onCustom() {
      setOverride({ llm: readStored(scope, 'llm'), image: readStored(scope, 'image') });
    }
    window.addEventListener('keyOverrideChange', onCustom);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('keyOverrideChange', onCustom);
    };
  }, [scope]);
  return override;
}

export interface KeyOverrideSelectorProps {
  /** 唯一标识本页（如 'xiaohongshu', 'search', 'chat:api-doctor'）；用于 localStorage key */
  scope: string;
  /** 显示哪些下拉 */
  show?: KeyKind[];
  /** 自定义类名（决定挂载位置） */
  className?: string;
}

export function KeyOverrideSelector({ scope, show = ['llm', 'image'], className = '' }: KeyOverrideSelectorProps) {
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState<KeyResp['keys'] | null>(null);
  const [llmSel, setLlmSel] = useState<string | null>(null);
  const [imageSel, setImageSel] = useState<string | null>(null);

  useEffect(() => {
    setLlmSel(readStored(scope, 'llm'));
    setImageSel(readStored(scope, 'image'));
  }, [scope]);

  useEffect(() => {
    if (!open || keys) return;
    void fetch('/api/api-keys/list')
      .then((r) => r.json())
      .then((j: KeyResp) => { if (j.ok) setKeys(j.keys); })
      .catch(() => { /* silent */ });
  }, [open, keys]);

  function setKind(kind: KeyKind, id: string | null) {
    if (kind === 'llm') setLlmSel(id);
    else setImageSel(id);
    writeStored(scope, kind, id);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('keyOverrideChange'));
    }
  }

  // 是否有任意覆盖在生效（决定主按钮样式）
  const hasOverride = (show.includes('llm') && !!llmSel) || (show.includes('image') && !!imageSel);

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
          hasOverride
            ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 text-amber-800 dark:text-amber-200'
            : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700 hover:border-slate-300'
        }`}
        title={hasOverride ? '本页已指定 API key' : '选择本页用哪个 API key'}
      >
        <Settings2 size={12} />
        <span className="hidden sm:inline">{hasOverride ? 'API: 已指定' : 'API'}</span>
        <ChevronDown size={10} />
      </button>

      {open && (
        <>
          {/* 点外部关闭 */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-20 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-3 space-y-3">
            <div className="text-xs text-slate-500 leading-relaxed">
              选择本页本次使用哪个 API key。<br />留空 / 选「默认」走系统优先级池。<br />仅对本页有效（按页面记忆）。
            </div>

            {show.includes('llm') && (
              <KindBlock
                title="文本/聊天 (LLM)"
                items={keys?.llm || []}
                selected={llmSel}
                onSelect={(id) => setKind('llm', id)}
              />
            )}

            {show.includes('image') && (
              <KindBlock
                title="出图 (IMAGE)"
                items={keys?.image || []}
                selected={imageSel}
                onSelect={(id) => setKind('image', id)}
              />
            )}

            <div className="border-t border-slate-100 dark:border-slate-800 pt-2 flex justify-between items-center">
              <button
                type="button"
                onClick={() => {
                  setKind('llm', null);
                  setKind('image', null);
                }}
                className="text-xs text-slate-500 hover:text-slate-700 hover:underline"
              >
                全部恢复默认
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs btn-secondary"
              >
                完成
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KindBlock({
  title, items, selected, onSelect,
}: { title: string; items: KeyItem[]; selected: string | null; onSelect: (id: string | null) => void; }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{title}</div>
      {items.length === 0 ? (
        <div className="text-xs text-slate-400">无可用 key</div>
      ) : (
        <ul className="space-y-1">
          <li>
            <button
              type="button"
              onClick={() => onSelect(null)}
              className={`w-full text-left text-xs px-2 py-1 rounded flex items-center gap-2 ${
                !selected ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {!selected && <Check size={10} />}
              <span>默认（按优先级自动选）</span>
            </button>
          </li>
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => onSelect(it.id)}
                className={`w-full text-left text-xs px-2 py-1 rounded flex items-center gap-2 ${
                  selected === it.id ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
                title={`model: ${it.model}`}
              >
                {selected === it.id ? <Check size={10} /> : <span className="w-[10px]" />}
                <span className="flex-1 truncate">{it.label}</span>
                {it.isDefault && <span className="text-[10px] text-slate-400">默认</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
