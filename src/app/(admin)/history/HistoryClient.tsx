'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  ChevronLeft,
  Clipboard,
  Copy,
  FileText,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';

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
  'platform-build': '平台产出',
  'platform-build-5img': '平台产出 5 图',
  'ai-search': 'AI 搜索',
  'ai-analysis': 'AI 分析',
  'prompt-gen': '提示词生成',
  'playground:image': 'Playground 图片',
  'playground:llm': 'Playground 文案',
  'playground:agent': 'Playground Agent',
};

function isPublishDirector(row: HistoryRow) {
  return row.input.includes('"via":"publish-director"');
}

function isChatType(row: HistoryRow) {
  return row.type.startsWith('chat-');
}

function typeLabel(row: HistoryRow) {
  if (isChatType(row)) return 'AI 对话';
  if (isPublishDirector(row)) return '发布导演';
  return TYPE_LABEL[row.type] ?? (row.type || '未知类型');
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return iso;
  }
}

function preview(text: string, max = 110) {
  const compact = prettyText(text).replace(/\s+/g, ' ').trim();
  return compact.length > max ? `${compact.slice(0, max)}...` : compact;
}

function prettyText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length < 20_000) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}

export default function HistoryClient({ initial }: { initial: HistoryRow[] }) {
  const [rows, setRows] = useState<HistoryRow[]>(initial);
  const [activeId, setActiveId] = useState(initial[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [mobileDetail, setMobileDetail] = useState(false);

  const chips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = isChatType(row) ? '__chat__' : isPublishDirector(row) ? '__publish__' : row.type;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [
      { value: '', label: '全部', count: rows.length },
      ...Array.from(counts.entries()).map(([value, count]) => ({
        value,
        label:
          value === '__chat__'
            ? 'AI 对话'
            : value === '__publish__'
              ? '发布导演'
              : TYPE_LABEL[value] ?? value,
        count,
      })),
    ];
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter) {
        if (filter === '__chat__' && !isChatType(row)) return false;
        else if (filter === '__publish__' && !isPublishDirector(row)) return false;
        else if (filter !== '__chat__' && filter !== '__publish__' && row.type !== filter) return false;
      }
      if (!needle) return true;
      return (
        row.input.toLowerCase().includes(needle) ||
        row.output.toLowerCase().includes(needle) ||
        row.model.toLowerCase().includes(needle) ||
        typeLabel(row).toLowerCase().includes(needle)
      );
    });
  }, [rows, filter, query]);

  const active = rows.find((row) => row.id === activeId) ?? filtered[0] ?? null;

  async function copyText(text: string, label: string) {
    const ok = await copyAll(text);
    if (ok) toast.success(`已复制${label}`);
    else toast.error('复制失败');
  }

  async function deleteOne(id: string) {
    if (!window.confirm('确认删除这条历史记录？此操作不可撤销。')) return;
    try {
      const response = await fetch(`/api/history/${id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || '删除失败');
      setRows((current) => current.filter((row) => row.id !== id));
      if (activeId === id) setActiveId('');
      toast.success('历史记录已删除');
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <div className="page-shell">
      <header className="command-panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-bold text-cyan-200">
              <span className="pulse-dot" aria-hidden />
              资产 / 历史
            </div>
            <h1 className="mt-4 text-3xl font-black leading-tight text-white sm:text-4xl">历史记录</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              用左侧快速定位生成记录，右侧查看完整输入输出。这里保留旧能力，但视觉和交互统一到新的工作台体系。
            </p>
          </div>
          <button type="button" onClick={() => window.location.reload()} className="command-rail btn-primary bg-white text-slate-950 hover:bg-slate-200">
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </button>
        </div>
      </header>

      <section className="command-toolbar">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input command-input pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索输入、输出、模型或类型"
          />
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {chips.map((chip) => (
            <button
              key={chip.value}
              type="button"
              onClick={() => setFilter(chip.value)}
              className={
                'inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ' +
                (filter === chip.value
                  ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                  : 'border-slate-200 bg-white/70 text-slate-600 hover:border-cyan-300 hover:text-cyan-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300 dark:hover:border-cyan-800')
              }
            >
              {chip.label}
              <span className="font-mono tabular-nums opacity-70">{chip.count}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside
          className={
            'command-glass overflow-hidden lg:max-h-[calc(100vh-240px)] lg:overflow-y-auto ' +
            (mobileDetail ? 'hidden lg:block' : '')
          }
          aria-label="历史记录列表"
        >
          {filtered.length === 0 ? (
            <div className="command-empty border-0">没有匹配的历史记录</div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((row) => {
                const selected = active?.id === row.id;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveId(row.id);
                        setMobileDetail(true);
                      }}
                      className={
                        'block w-full border-l-2 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60 ' +
                        (selected
                          ? 'border-cyan-500 bg-cyan-50/60 dark:bg-cyan-950/20'
                          : 'border-transparent')
                      }
                    >
                      <div className="flex items-center gap-2">
                        <span className="badge-gray">{typeLabel(row)}</span>
                        {isPublishDirector(row) && <Sparkles className="h-3.5 w-3.5 text-amber-500" />}
                        <span className="ml-auto text-[11px] text-slate-400">{fmtDate(row.createdAt)}</span>
                      </div>
                      <div className="mt-2 line-clamp-2 text-sm text-slate-700 dark:text-slate-200">
                        {preview(row.output || row.input) || '空输出'}
                      </div>
                      <div className="mt-2 truncate text-xs text-slate-400">{row.model || '未记录模型'}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className={(mobileDetail ? '' : 'hidden lg:block') + ' min-w-0'}>
          {active ? (
            <div className="command-glass overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setMobileDetail(false)}
                  className="btn-secondary px-3 py-1.5 text-xs lg:hidden"
                >
                  <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                  返回
                </button>
                <span className="badge-blue">{typeLabel(active)}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{fmtDate(active.createdAt)}</span>
                <span className="ml-auto truncate text-xs text-slate-400">{active.model || '未记录模型'}</span>
              </div>

              <div className="grid gap-4 p-4 xl:grid-cols-2">
                <RecordBlock
                  title="输入"
                  icon={<Clipboard className="h-4 w-4" />}
                  text={prettyText(active.input)}
                  onCopy={() => copyText(active.input, '输入')}
                />
                <RecordBlock
                  title="输出"
                  icon={<FileText className="h-4 w-4" />}
                  text={prettyText(active.output)}
                  onCopy={() => copyText(active.output, '输出')}
                />
              </div>

              <div className="flex flex-wrap gap-2 border-t border-slate-200 p-4 dark:border-slate-800">
                <button type="button" onClick={() => copyText(active.output, '输出')} className="btn-primary">
                  <Copy className="mr-2 h-4 w-4" />
                  复制输出
                </button>
                <button type="button" onClick={() => copyText(active.input, '输入')} className="btn-secondary">
                  <Copy className="mr-2 h-4 w-4" />
                  复制输入
                </button>
                <button type="button" onClick={() => deleteOne(active.id)} className="btn-danger ml-auto">
                  <Trash2 className="mr-2 h-4 w-4" />
                  删除
                </button>
              </div>
            </div>
          ) : (
            <div className="command-empty">请选择一条历史记录</div>
          )}
        </section>
      </section>
    </div>
  );
}

function RecordBlock({
  title,
  icon,
  text,
  onCopy,
}: {
  title: string;
  icon: ReactNode;
  text: string;
  onCopy: () => void;
}) {
  return (
    <div className="command-glass">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-800 dark:text-slate-200">
        {icon}
        {title}
        <button
          type="button"
          onClick={onCopy}
          className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white hover:text-slate-900 dark:hover:bg-slate-950 dark:hover:text-white"
          aria-label={`复制${title}`}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
      <pre className="max-h-[52vh] overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-5 text-slate-700 dark:text-slate-300">
        {text || '无内容'}
      </pre>
    </div>
  );
}
