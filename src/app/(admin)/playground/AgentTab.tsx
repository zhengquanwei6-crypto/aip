'use client';

// v0.11 B8 · AgentTab — 即时 Agent 对话面板
//
// 功能：
//   - 选 8 个 agent 之一（顶部 chip + 描述）
//   - agent.systemPrompt 只读折叠展示
//   - user textarea
//   - 「发送」按钮
//   - 对话历史区
//
// 调用 POST /api/playground/agent/chat（与 /api/agents/[slug]/chat 等价 LLM，但写
// AIOutput.type='playground:agent' 不污染 AgentDrawer 的历史）

import { useMemo, useState } from 'react';
import {
  Send,
  Loader2,
  Bot,
  Copy,
  RotateCcw,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from 'lucide-react';
import clsx from 'clsx';
import { toast } from '@/lib/toast';
import type { AgentSummary } from './PlaygroundClient';

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  latencyMs?: number;
  error?: string;
}

interface Props {
  agents: AgentSummary[];
}

export default function AgentTab({ agents }: Props) {
  const [slug, setSlug] = useState<string>(() => agents[0]?.slug ?? '');
  // 每个 agent 一个独立 history，slug 切换时各自保留
  const [historyMap, setHistoryMap] = useState<Record<string, ChatTurn[]>>({});
  const [user, setUser] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [systemOpen, setSystemOpen] = useState<boolean>(false);

  const currentAgent = useMemo(() => agents.find((a) => a.slug === slug) ?? null, [agents, slug]);
  const history = historyMap[slug] ?? [];

  function setHistoryFor(s: string, next: ChatTurn[] | ((prev: ChatTurn[]) => ChatTurn[])) {
    setHistoryMap((m) => {
      const prev = m[s] ?? [];
      const value = typeof next === 'function' ? (next as (p: ChatTurn[]) => ChatTurn[])(prev) : next;
      return { ...m, [s]: value };
    });
  }

  function clearHistory() {
    if (history.length === 0) return;
    if (!confirm(`清空 ${currentAgent?.name ?? slug} 的对话历史？`)) return;
    setHistoryFor(slug, []);
  }

  async function send(reuseUser?: string) {
    if (!slug || !currentAgent) {
      toast.error('请先选一个 Agent');
      return;
    }
    const msg = (reuseUser ?? user).trim();
    if (!msg) {
      toast.error('message 不能为空');
      return;
    }
    setLoading(true);
    const userTurn: ChatTurn = { role: 'user', content: msg };
    setHistoryFor(slug, (h) => [...h, userTurn]);
    if (!reuseUser) setUser('');

    const messagesPayload = [
      ...history.map((t) => ({ role: t.role, content: t.content })),
      { role: 'user' as const, content: msg },
    ];

    try {
      const res = await fetch('/api/playground/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, messages: messagesPayload }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        const errMsg = j?.error || `HTTP ${res.status}`;
        toast.error('Agent 调用失败：' + String(errMsg).slice(0, 200));
        setHistoryFor(slug, (h) => [...h, { role: 'assistant', content: '', error: String(errMsg) }]);
      } else {
        setHistoryFor(slug, (h) => [
          ...h,
          {
            role: 'assistant',
            content: String(j.content ?? j.output ?? ''),
            model: j.model,
            latencyMs: j.latencyMs,
          },
        ]);
      }
    } catch (e) {
      const m = (e as Error).message || '网络错误';
      toast.error('请求异常：' + m);
      setHistoryFor(slug, (h) => [...h, { role: 'assistant', content: '', error: m }]);
    } finally {
      setLoading(false);
    }
  }

  async function copyContent(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('已复制');
    } catch {
      toast.error('复制失败');
    }
  }

  function regenerate() {
    let lastUserIdx = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i]!.role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;
    const m = history[lastUserIdx]!.content;
    setHistoryFor(slug, (h) => h.slice(0, lastUserIdx));
    void send(m);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4">
      {/* 左：agent 选择 + system prompt */}
      <aside className="space-y-3 lg:sticky lg:top-[72px] lg:self-start">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <Bot size={14} aria-hidden="true" />
            <span>选择 Agent · 共 {agents.length}</span>
          </div>

          <div data-agent-slug-list className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {agents.map((a) => {
              const active = a.slug === slug;
              return (
                <button
                  key={a.slug}
                  type="button"
                  data-agent-slug={a.slug}
                  onClick={() => setSlug(a.slug)}
                  aria-pressed={active}
                  title={a.description}
                  className={clsx(
                    'rounded-md border px-2 py-1.5 text-xs text-left transition-colors',
                    active
                      ? 'border-brand-500 bg-brand-50 text-brand-700 font-medium dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800',
                  )}
                >
                  <div className="flex items-center gap-1">
                    <span aria-hidden="true">{a.icon}</span>
                    <span className="truncate">{a.name}</span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500 truncate">
                    {a.slug}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {currentAgent && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <button
              type="button"
              onClick={() => setSystemOpen((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              aria-expanded={systemOpen}
            >
              <span className="flex items-center gap-1.5">
                <span>System Prompt（只读）</span>
                <span className="text-slate-400">·</span>
                <span className="font-mono text-[10px] text-slate-400">
                  {currentAgent.systemPrompt.length} 字
                </span>
              </span>
              {systemOpen ? (
                <ChevronUp size={12} aria-hidden="true" />
              ) : (
                <ChevronDown size={12} aria-hidden="true" />
              )}
            </button>
            {systemOpen && (
              <pre className="px-3 py-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 max-h-72 overflow-y-auto bg-slate-50 dark:bg-slate-950/50 whitespace-pre-wrap break-words border-t border-slate-200 dark:border-slate-800">
                {currentAgent.systemPrompt}
              </pre>
            )}
            <div className="border-t border-slate-200 dark:border-slate-800 px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400">
              <div className="font-medium text-slate-600 dark:text-slate-300">{currentAgent.name}</div>
              <div className="mt-0.5">{currentAgent.description}</div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={clearHistory}
          disabled={loading || history.length === 0}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
        >
          <Trash2 size={12} aria-hidden="true" />
          清空 {currentAgent?.name ?? '当前 agent'} 历史（{history.length}）
        </button>
      </aside>

      {/* 右：对话区 */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col min-h-[60vh]">
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3" data-agent-history>
          {history.length === 0 && (
            <div className="text-center text-sm text-slate-400 dark:text-slate-500 mt-12">
              <Bot size={24} className="mx-auto mb-2 opacity-50" aria-hidden="true" />
              选择一个 Agent，输入消息开始对话
            </div>
          )}
          {history.map((t, i) => (
            <Bubble
              key={i}
              turn={t}
              onCopy={() => void copyContent(t.content)}
              onRegenerate={t.role === 'assistant' && i === history.length - 1 ? regenerate : undefined}
            />
          ))}
          {loading && (
            <div className="text-xs text-slate-400 dark:text-slate-500 inline-flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              {currentAgent?.name ?? 'Agent'} 正在思考…
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 p-3 sm:p-4 bg-slate-50/50 dark:bg-slate-900/40">
          <textarea
            data-agent-user
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder={`向 ${currentAgent?.name ?? 'Agent'} 提问…（Cmd/Ctrl+Enter 发送）`}
            rows={3}
            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2 py-1.5 leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500"
            disabled={loading}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="text-[11px] text-slate-400 dark:text-slate-500">
              {currentAgent ? `${currentAgent.icon} ${currentAgent.name}` : '未选'} · {history.length} 条消息
            </div>
            <button
              type="button"
              data-agent-send
              onClick={() => void send()}
              disabled={loading || !user.trim() || !slug}
              className="inline-flex items-center gap-2 rounded-md bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 px-4 py-1.5 text-sm text-white font-medium transition-colors"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Send size={14} aria-hidden="true" />
              )}
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({
  turn,
  onCopy,
  onRegenerate,
}: {
  turn: ChatTurn;
  onCopy: () => void;
  onRegenerate?: () => void;
}) {
  const isUser = turn.role === 'user';
  return (
    <div className={'flex ' + (isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={
          'max-w-[88%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ' +
          (isUser
            ? 'bg-brand-600 text-white'
            : turn.error
              ? 'bg-red-50 dark:bg-red-900/30 text-red-900 dark:text-red-100 border border-red-200 dark:border-red-800'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100')
        }
      >
        {turn.error ? (
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div className="break-all">{turn.error}</div>
          </div>
        ) : (
          <div>{turn.content}</div>
        )}
        {!isUser && !turn.error && (turn.model || turn.latencyMs) && (
          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-3">
            {turn.model && <span title="model">{turn.model}</span>}
            {turn.latencyMs !== undefined && (
              <span title="latency">{(turn.latencyMs / 1000).toFixed(2)}s</span>
            )}
            <span className="ml-auto inline-flex items-center gap-1">
              <button
                type="button"
                onClick={onCopy}
                className="inline-flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400"
                title="复制"
              >
                <Copy size={11} aria-hidden="true" />
                复制
              </button>
              {onRegenerate && (
                <button
                  type="button"
                  onClick={onRegenerate}
                  className="inline-flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400"
                  title="重发"
                >
                  <RotateCcw size={11} aria-hidden="true" />
                  重发
                </button>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
