'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Copy, Trash2, RefreshCw, ChevronDown, ChevronUp, Target } from 'lucide-react';
import ListShell, { bulkSerial } from '@/components/ListShell';
import { copyAll } from '@/lib/clipboard';
import { toast } from '@/lib/toast';

interface HistoryRow {
  id: string;
  type: string;
  input: string;
  output: string;
  model: string;
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  text: '文案',
  image: '图片',
  image_prompt: '图片提示词',
  suggestion: '运营建议',
};

const TYPE_BADGE: Record<string, string> = {
  text: 'badge-blue',
  image: 'badge-yellow',
  image_prompt: 'badge-purple',
  suggestion: 'badge-green',
};

const TYPE_FILTER_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'text', label: '文案' },
  { value: 'image', label: '图片' },
  { value: 'image_prompt', label: '图片提示词' },
  { value: 'suggestion', label: '运营建议' },
  // v0.9 b3：跨 type 的虚拟筛选（input 含 "via":"publish-director" 的所有条目）
  { value: '__publish_director__', label: '🎯 发布导演（publish-director）' },
];

/** v0.9 b3：检测是否来自 publish-director（看 input JSON 是否含 via:"publish-director"） */
function isPublishDirector(row: HistoryRow): boolean {
  if (!row.input) return false;
  return row.input.includes('"via":"publish-director"');
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', { hour12: false });
  } catch {
    return iso;
  }
}

function preview(text: string, max = 120): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

export default function HistoryClient({
  initial,
}: {
  initial: HistoryRow[];
}) {
  const [rows, setRows] = useState<HistoryRow[]>(initial);
  const [expandedInput, setExpandedInput] = useState<Set<string>>(new Set());
  const [expandedOutput, setExpandedOutput] = useState<Set<string>>(new Set());

  function toggleInput(id: string) {
    setExpandedInput((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleOutput(id: string) {
    setExpandedOutput((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copyOne(text: string, label: string) {
    const ok = await copyAll(text);
    if (ok) toast.success(`已复制${label}`);
    else toast.error('复制失败');
  }

  async function deleteOne(id: string) {
    if (!window.confirm('确认删除这条历史记录？')) return;
    try {
      const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '删除失败');
      setRows((arr) => arr.filter((x) => x.id !== id));
      toast.success('已删除');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-body">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">
            AI 输出历史
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            按类型筛选，最多展示最近 500 条。可以复制 output、批量删除、跳到「文案生成」重新出一版。
          </p>
        </div>
      </div>

      <ListShell<HistoryRow>
        items={rows}
        getId={(r) => r.id}
        storageKey="list:history"
        searchPlaceholder="搜索 input / output / model"
        searchKeys={['input', 'output', 'model']}
        filters={[
          {
            key: 'type',
            label: '类型',
            options: TYPE_FILTER_OPTIONS,
            predicate: (r, v) => {
              if (v === '__publish_director__') return isPublishDirector(r);
              return r.type === v;
            },
          },
        ]}
        viewModes={['card']}
        pageSize={50}
        emptyState="暂无历史记录。生成文案或图片后会自动记录。"
        emptyAfterFilterState="按当前筛选没有匹配的历史记录"
        onToastSuccess={(m) => toast.success(m)}
        onToastError={(m) => toast.error(m)}
        cardGridClassName="space-y-3"
        bulk={[
          {
            key: 'copy-output',
            label: '复制 output',
            icon: <Copy size={14} />,
            run: async (ids, items) => {
              const text = items
                .map((it) => {
                  const head = `--- ${TYPE_LABEL[it.type] ?? it.type} · ${fmtDate(it.createdAt)} ---`;
                  return `${head}\n${it.output}`;
                })
                .join('\n\n');
              const ok = await copyAll(text);
              return ok
                ? { ok: true, message: `已复制 ${ids.length} 条 output` }
                : { ok: false, message: '复制到剪贴板失败' };
            },
            clearOnDone: false,
          },
          {
            key: 'delete',
            label: '批量删除',
            icon: <Trash2 size={14} />,
            destructive: true,
            run: async (ids) => {
              const r = await bulkSerial(ids, async (id) => {
                const res = await fetch(`/api/history/${id}`, {
                  method: 'DELETE',
                });
                const j = await res.json();
                if (!res.ok || !j.ok) throw new Error(j.error || '删除失败');
              });
              setRows((arr) =>
                arr.filter((x) => !(ids.includes(x.id) && !r.failed.find((f) => f.id === x.id))),
              );
              if (r.failed.length === 0) {
                return { ok: true, message: `已删除 ${r.ok} 条` };
              }
              return {
                ok: false,
                message: `部分失败：成功 ${r.ok} / 失败 ${r.failed.length}`,
              };
            },
          },
        ]}
        renderCard={(it) => {
          const inputOpen = expandedInput.has(it.id);
          const outputOpen = expandedOutput.has(it.id);
          const fromPublishDirector = isPublishDirector(it);
          // v0.9 b3：解析 publish-director 的 stylePrompt 输出展示
          let pubDirStyleSummary: string | null = null;
          let pubDirImageOptions: any = null;
          let pubDirSeriesPlan: string | null = null;
          if (fromPublishDirector) {
            try {
              const inp = JSON.parse(it.input);
              if (inp?.imageOptions) pubDirImageOptions = inp.imageOptions;
            } catch {
              /* ignore */
            }
            if (it.type === 'image_prompt') {
              try {
                const out = JSON.parse(it.output);
                if (typeof out?.styleSummary === 'string') pubDirStyleSummary = out.styleSummary;
                if (typeof out?.seriesPlan === 'string') pubDirSeriesPlan = out.seriesPlan;
              } catch {
                /* ignore */
              }
            }
          }
          return (
            <div className="card">
              <div className="card-body space-y-3 pl-8">
                {/* 顶部 meta */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={TYPE_BADGE[it.type] ?? 'badge-gray'}>
                    {TYPE_LABEL[it.type] ?? it.type}
                  </span>
                  {fromPublishDirector && (
                    <span className="badge-yellow inline-flex items-center gap-1">
                      <Target size={10} />
                      publish-director
                    </span>
                  )}
                  {it.model && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      {it.model}
                    </span>
                  )}
                  <span className="text-xs text-slate-400 ml-auto">
                    {fmtDate(it.createdAt)}
                  </span>
                </div>

                {/* v0.9 b3：publish-director 摘要（styleSummary + 图片选项 + seriesPlan） */}
                {fromPublishDirector && (pubDirStyleSummary || pubDirImageOptions || pubDirSeriesPlan) && (
                  <div className="text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded p-2 space-y-1">
                    {pubDirStyleSummary && (
                      <div>
                        <span className="text-amber-700 dark:text-amber-300 font-medium">风格说明：</span>
                        <span className="text-slate-700 dark:text-slate-200">{pubDirStyleSummary}</span>
                      </div>
                    )}
                    {pubDirSeriesPlan && (
                      <div>
                        <span className="text-amber-700 dark:text-amber-300 font-medium">系列编排：</span>
                        <span className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{pubDirSeriesPlan}</span>
                      </div>
                    )}
                    {pubDirImageOptions && (
                      <div className="text-slate-600 dark:text-slate-400 font-mono">
                        opts: n={pubDirImageOptions.n ?? 1}
                        {pubDirImageOptions.asSeries ? ' · series' : ''}
                        {pubDirImageOptions.primaryColor ? ` · primary=${pubDirImageOptions.primaryColor}` : ''}
                        {pubDirImageOptions.accentColor ? ` · accent=${pubDirImageOptions.accentColor}` : ''}
                        {pubDirImageOptions.textLanguage ? ` · text=${pubDirImageOptions.textLanguage}` : ''}
                      </div>
                    )}
                  </div>
                )}

                {/* input */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      输入
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copyOne(it.input, '输入')}
                        className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1"
                      >
                        <Copy size={12} />
                        复制 input
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleInput(it.id)}
                        className="text-xs text-slate-500 hover:underline inline-flex items-center gap-1"
                      >
                        {inputOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {inputOpen ? '折叠' : '展开'}
                      </button>
                    </div>
                  </div>
                  <div
                    className={
                      'text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded p-2 whitespace-pre-wrap break-words font-mono ' +
                      (inputOpen ? '' : 'line-clamp-4')
                    }
                  >
                    {inputOpen ? it.input : preview(it.input, 400)}
                  </div>
                </div>

                {/* output */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      输出
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => copyOne(it.output, '输出')}
                        className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1"
                      >
                        <Copy size={12} />
                        复制 output
                      </button>
                      <Link
                        href={`/content?prefill=${it.id}`}
                        className="text-xs text-emerald-600 hover:underline inline-flex items-center gap-1"
                        title="带这条历史跳到文案生成页"
                      >
                        <RefreshCw size={12} />
                        重新生成
                      </Link>
                      <button
                        type="button"
                        onClick={() => deleteOne(it.id)}
                        className="text-xs text-red-600 hover:underline inline-flex items-center gap-1"
                      >
                        <Trash2 size={12} />
                        删除
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleOutput(it.id)}
                        className="text-xs text-slate-500 hover:underline inline-flex items-center gap-1"
                      >
                        {outputOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {outputOpen ? '折叠' : '展开'}
                      </button>
                    </div>
                  </div>
                  <div
                    className={
                      'text-xs text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 rounded p-2 whitespace-pre-wrap break-words font-mono ' +
                      (outputOpen ? '' : 'line-clamp-6')
                    }
                  >
                    {outputOpen ? it.output : preview(it.output, 600)}
                  </div>
                </div>
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}
