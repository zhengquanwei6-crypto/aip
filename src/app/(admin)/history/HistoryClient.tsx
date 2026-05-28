/**
 * v0.15 · 历史记录 · UI 重做
 *
 * 用户原话：信息杂乱无章，重点信息不突出，UI 以及逻辑推到重建。
 *
 * 新结构：
 *   - 顶部汇总条（按类型分布的 chip 筛选 + 总数）
 *   - 左列紧凑列表（一行一条 · 类型徽标 + 时间 + 输出预览）
 *   - 右列详情面板（type / model / createdAt / 输入 / 输出 + 操作按钮）
 *   - 移动端单栏：列表 → 点击进入详情视图
 */
'use client';

import { useState, useMemo } from 'react';
import {
  Copy,
  Trash2,
  RefreshCw,
  X,
  Search,
  ChevronLeft,
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
  'platform-build-5img': '平台产出·5图',
  'ai-search': 'AI 搜',
  'ai-analysis': 'AI 分析',
};

const TYPE_BADGE: Record<string, string> = {
  text: 'badge-blue',
  image: 'badge-yellow',
  image_prompt: 'badge-purple',
  suggestion: 'badge-green',
  'platform-build': 'badge-pink',
  'platform-build-5img': 'badge-pink',
  'ai-search': 'badge-cyan',
  'ai-analysis': 'badge-orange',
};

function isPublishDirector(row: HistoryRow): boolean {
  if (!row.input) return false;
  return row.input.includes('"via":"publish-director"');
}

function isChatType(row: HistoryRow): boolean {
  return typeof row.type === 'string' && row.type.startsWith('chat-');
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return iso;
  }
}

function shortPreview(text: string, max = 90): string {
  if (!text) return '';
  let t = text.replace(/\s+/g, ' ').trim();
  // 尝试解析 JSON 取关键字段做摘要
  if (t.startsWith('{') && t.length < 4000) {
    try {
      const obj = JSON.parse(t);
      if (typeof obj?.summary === 'string') t = obj.summary;
      else if (typeof obj?.title === 'string') t = obj.title;
      else if (typeof obj?.body === 'string') t = obj.body;
      else if (typeof obj?.coverText === 'string') t = obj.coverText;
      else if (Array.isArray(obj?.titles) && obj.titles[0]) t = obj.titles[0];
      else if (typeof obj?.prompt === 'string') t = obj.prompt;
    } catch {
      /* keep original */
    }
  }
  return t.length > max ? t.slice(0, max) + '…' : t;
}

export default function HistoryClient({ initial }: { initial: HistoryRow[] }) {
  const [rows, setRows] = useState<HistoryRow[]>(initial);
  const [activeId, setActiveId] = useState<string | null>(initial[0]?.id ?? null);
  const [filterType, setFilterType] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const [mobileDetail, setMobileDetail] = useState<boolean>(false);

  // 类型分布 → chip
  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach((r) => {
      const k = isChatType(r) ? '__chat__' : isPublishDirector(r) ? '__pub__' : r.type;
      m[k] = (m[k] ?? 0) + 1;
    });
    return m;
  }, [rows]);

  const chipDefs = useMemo(() => {
    const arr: { value: string; label: string; count: number }[] = [
      { value: '', label: '全部', count: rows.length },
    ];
    Object.entries(typeCounts).forEach(([k, c]) => {
      let label = TYPE_LABEL[k] ?? k;
      if (k === '__chat__') label = '💬 AI 对话';
      else if (k === '__pub__') label = '🎯 发布导演';
      arr.push({ value: k, label, count: c });
    });
    return arr;
  }, [typeCounts, rows.length]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterType) {
        if (filterType === '__chat__' && !isChatType(r)) return false;
        else if (filterType === '__pub__' && !isPublishDirector(r)) return false;
        else if (
          filterType !== '__chat__' &&
          filterType !== '__pub__' &&
          r.type !== filterType
        )
          return false;
      }
      if (query) {
        const q = query.toLowerCase();
        return (
          r.input.toLowerCase().includes(q) ||
          r.output.toLowerCase().includes(q) ||
          (r.model ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rows, filterType, query]);

  const active = useMemo(
    () => rows.find((r) => r.id === activeId) ?? null,
    [rows, activeId],
  );

  async function deleteOne(id: string) {
    if (!confirm('删除这条历史？')) return;
    try {
      const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '删除失败');
      setRows((arr) => arr.filter((r) => r.id !== id));
      if (activeId === id) {
        const next = rows.find((r) => r.id !== id);
        setActiveId(next?.id ?? null);
      }
      toast.success('已删除');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function copyText(text: string, label: string) {
    const ok = await copyAll(text);
    if (ok) toast.success(`已复制${label}`);
    else toast.error('复制失败');
  }

  return (
    <div className="space-y-4">
      {/* 顶部汇总条 */}
      <header className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-3">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400 font-mono">
              history
            </div>
            <div className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-100 mt-0.5">
              共 {rows.length} 条 AI 输出
            </div>
          </div>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索 input / output / model"
              className="text-sm pl-7 pr-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-transparent w-60"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {chipDefs.map((c) => {
            const active = c.value === filterType;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setFilterType(c.value)}
                className={
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors ' +
                  (active
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700')
                }
              >
                {c.label}
                <span className="font-mono tabular-nums opacity-70">{c.count}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* 双栏 */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-4">
        {/* 左列：紧凑列表 */}
        <aside
          className={
            'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto ' +
            (mobileDetail ? 'hidden lg:block' : '')
          }
          aria-label="历史记录列表"
        >
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              没有匹配的记录
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((r) => {
                const active = r.id === activeId;
                const fromPub = isPublishDirector(r);
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveId(r.id);
                        setMobileDetail(true);
                      }}
                      className={
                        'block w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 ' +
                        (active
                          ? 'bg-brand-50/60 dark:bg-brand-900/20 border-l-2 border-brand-600'
                          : 'border-l-2 border-transparent')
                      }
                    >
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className={(TYPE_BADGE[r.type] ?? 'badge-gray') + ' text-[10px]'}>
                          {TYPE_LABEL[r.type] ?? r.type}
                        </span>
                        {fromPub && <span className="badge-yellow text-[10px]">🎯</span>}
                        <span className="ml-auto text-slate-400 tabular-nums">
                          {fmtDate(r.createdAt).slice(5, 16)}
                        </span>
                      </div>
                      <div className="mt-1.5 text-xs text-slate-700 dark:text-slate-200 line-clamp-2 leading-snug">
                        {shortPreview(r.output, 110)}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* 右列：详情 */}
        <section
          className={
            'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ' +
            (mobileDetail ? '' : 'hidden lg:block')
          }
          aria-label="历史记录详情"
        >
          {active ? (
            <div className="flex flex-col h-full">
              <div className="px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setMobileDetail(false)}
                  className="lg:hidden inline-flex items-center gap-1 text-xs text-slate-500"
                >
                  <ChevronLeft size={14} /> 列表
                </button>
                <span className={(TYPE_BADGE[active.type] ?? 'badge-gray') + ' text-[10px]'}>
                  {TYPE_LABEL[active.type] ?? active.type}
                </span>
                {active.model && (
                  <span className="text-[11px] font-mono text-slate-500">{active.model}</span>
                )}
                <span className="text-[11px] text-slate-400 tabular-nums ml-auto">
                  {fmtDate(active.createdAt)}
                </span>
              </div>
              <div className="px-4 sm:px-5 py-4 overflow-y-auto space-y-4">
                <Section title="输入">
                  <pre className="text-xs leading-relaxed whitespace-pre-wrap break-words bg-slate-50 dark:bg-slate-800/50 rounded-md p-3 max-h-72 overflow-y-auto font-mono">
                    {active.input}
                  </pre>
                  <div className="mt-1.5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => copyText(active.input, '输入')}
                      className="text-[11px] text-brand-600 hover:underline inline-flex items-center gap-1"
                    >
                      <Copy size={11} /> 复制 input
                    </button>
                  </div>
                </Section>
                <Section title="输出">
                  <pre className="text-xs leading-relaxed whitespace-pre-wrap break-words bg-slate-50 dark:bg-slate-800/50 rounded-md p-3 max-h-[480px] overflow-y-auto font-mono">
                    {active.output}
                  </pre>
                  <div className="mt-2 flex flex-wrap gap-2 justify-end text-[11px]">
                    <button
                      type="button"
                      onClick={() => copyText(active.output, '输出')}
                      className="text-brand-600 hover:underline inline-flex items-center gap-1"
                    >
                      <Copy size={11} /> 复制 output
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteOne(active.id)}
                      className="text-red-600 hover:underline inline-flex items-center gap-1"
                    >
                      <Trash2 size={11} /> 删除
                    </button>
                  </div>
                </Section>
              </div>
            </div>
          ) : (
            <div className="p-10 text-center text-sm text-slate-400">
              在左侧选一条记录查看详情
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400 font-mono mb-1.5">
        {title}
      </div>
      {children}
    </div>
  );
}
