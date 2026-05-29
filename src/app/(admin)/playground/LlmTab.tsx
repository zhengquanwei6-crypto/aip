'use client';

// v0.11 B8 · LlmTab — 即时 LLM 对话面板
//
// 功能：
//   - 选 LLM key 池里某条（默认 active 第一）
//   - 临时 model 覆盖输入（不写池）
//   - system prompt textarea
//   - user textarea
//   - temperature slider 0..1（默认 0.7）+ max_tokens 输入（默认 4096）
//   - 「发送」按钮
//   - 对话历史区（user / assistant 气泡，assistant 有「重发」「复制」按钮）
//   - 多轮支持：每次 send 把 messages 数组带给后端
//
// 调用 POST /api/playground/llm/chat → { ok, output, model, latencyMs, tokens, keySource, keyLabel }

import { useEffect, useMemo, useState } from 'react';
import {
  Send,
  Loader2,
  Copy,
  RotateCcw,
  Trash2,
  Sparkles,
  Sliders,
  AlertCircle,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import type { ApiKeyRow } from './PlaygroundClient';

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  /** assistant 端反写 */
  model?: string;
  latencyMs?: number;
  tokens?: { prompt?: number; completion?: number; total?: number };
  /** 出错时把 error 文本放这里，气泡会渲染红色 */
  error?: string;
}

interface Props {
  llmKeys: ApiKeyRow[];
}

const DEFAULT_SYSTEM = '';

export default function LlmTab({ llmKeys }: Props) {
  const activeKeys = useMemo(() => llmKeys.filter((k) => k.active), [llmKeys]);

  // 默认选 active 第一条；池为空时设 ''
  const [keyId, setKeyId] = useState<string>(() => {
    if (activeKeys.length > 0) return activeKeys[0]!.id;
    if (llmKeys.length > 0) return llmKeys[0]!.id;
    return '';
  });
  const [modelOverride, setModelOverride] = useState<string>('');
  const [system, setSystem] = useState<string>(DEFAULT_SYSTEM);
  const [user, setUser] = useState<string>('');
  const [temperature, setTemperature] = useState<number>(0.7);
  const [maxTokens, setMaxTokens] = useState<number>(4096);
  // v0.14-z90: RAG 召回开关（启用后从 dao_history 拉相似过往输出当上下文）
  const [ragEnabled, setRagEnabled] = useState<boolean>(false);
  const [lastRagInfo, setLastRagInfo] = useState<{ recalled: number; query: string } | null>(null);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const selectedKey = useMemo(() => llmKeys.find((k) => k.id === keyId) ?? null, [keyId, llmKeys]);

  useEffect(() => {
    // 当用户选了 key 但 modelOverride 还空时，placeholder 显示池里 model
  }, [keyId]);

  function clearHistory() {
    if (history.length === 0) return;
    if (!confirm('清空当前对话历史？')) return;
    setHistory([]);
  }

  async function send(reuseUser?: string) {
    const userMsg = (reuseUser ?? user).trim();
    if (!userMsg) {
      toast.error('user 不能为空');
      return;
    }
    if (llmKeys.length === 0) {
      toast.error('LLM 池为空，请先去 /settings 加一条 provider=llm 的 key');
      return;
    }
    setLoading(true);
    const newUserTurn: ChatTurn = { role: 'user', content: userMsg };
    // 把 user 这条 turn 立刻 append（再加上 assistant 占位，发送过程中显示 loading）
    setHistory((h) => [...h, newUserTurn]);
    if (!reuseUser) setUser('');

    // 构造发给后端的 messages：把当前 history（截到刚加的 user）平铺
    const messagesPayload = [
      ...history.map((t) => ({ role: t.role, content: t.content })),
      { role: 'user' as const, content: userMsg },
    ];
    const reqBody: Record<string, unknown> = {
      messages: messagesPayload,
      temperature,
      max_tokens: maxTokens,
      useRAG: ragEnabled,
    };
    if (keyId) reqBody.keyId = keyId;
    if (modelOverride.trim()) reqBody.model = modelOverride.trim();
    if (system.trim()) reqBody.system = system.trim();

    try {
      const res = await fetch('/api/playground/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        const msg = j?.error || `HTTP ${res.status}`;
        toast.error('LLM 调用失败：' + String(msg).slice(0, 200));
        setHistory((h) => [
          ...h,
          { role: 'assistant', content: '', error: String(msg) },
        ]);
      } else {
        setHistory((h) => [
          ...h,
          {
            role: 'assistant',
            content: String(j.output ?? ''),
            model: j.model,
            latencyMs: j.latencyMs,
            tokens: j.tokens,
          },
        ]);
      }
    } catch (e) {
      const msg = (e as Error).message || '网络错误';
      toast.error('LLM 请求异常：' + msg);
      setHistory((h) => [...h, { role: 'assistant', content: '', error: msg }]);
    } finally {
      setLoading(false);
    }
  }

  async function copyContent(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('已复制到剪贴板');
    } catch {
      toast.error('复制失败');
    }
  }

  function regenerate() {
    // 找最近一个 user turn 重发；同时去掉之后的 assistant
    let lastUserIdx = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i]!.role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;
    const userMsg = history[lastUserIdx]!.content;
    setHistory((h) => h.slice(0, lastUserIdx)); // 截到 user 之前
    void send(userMsg);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4">
      {/* 左：参数 */}
      <aside className="space-y-3 lg:sticky lg:top-[72px] lg:self-start">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <Sliders size={14} aria-hidden="true" />
            <span>调用参数</span>
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              LLM Key（共 {llmKeys.length} 条 · {activeKeys.length} active）
            </label>
            <select
              data-llm-key-select
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2 py-1.5 text-slate-900 dark:text-slate-100"
              disabled={loading}
            >
              {llmKeys.length === 0 && <option value="">（池为空 · 去 /settings 添加）</option>}
              {llmKeys.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label} · {k.model} {k.active ? '' : '（已停用）'}
                </option>
              ))}
            </select>
            {selectedKey && (
              <div className="mt-1 text-[11px] text-slate-400 truncate" title={selectedKey.baseUrl}>
                {selectedKey.baseUrl}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              临时 model（留空使用 key 里的默认）
            </label>
            <input
              type="text"
              value={modelOverride}
              onChange={(e) => setModelOverride(e.target.value)}
              placeholder={selectedKey?.model ?? 'gpt-4o-mini'}
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2 py-1.5"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              System Prompt（可空 · 全局指令）
            </label>
            <textarea
              data-llm-system
              value={system}
              onChange={(e) => setSystem(e.target.value)}
              placeholder="你是一名…"
              rows={3}
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2 py-1.5 font-mono leading-relaxed"
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                temperature: {temperature.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="w-full"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                max_tokens
              </label>
              <input
                type="number"
                min={1}
                max={32000}
                value={maxTokens}
                onChange={(e) => setMaxTokens(Math.max(1, Number(e.target.value) || 4096))}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2 py-1.5"
                disabled={loading}
              />

          {/* v0.14-z90: RAG 召回 toggle */}
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            <label className="flex items-start gap-2 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={ragEnabled}
                onChange={(e) => setRagEnabled(e.target.checked)}
                className="mt-0.5 rounded border-slate-300"
              />
              <span className="flex-1">
                <span className="font-medium text-slate-700 dark:text-slate-200">🧠 启用 RAG 召回历史</span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  从 Zilliz dao_history 拉相似过往对话作上下文（每次自动 top-3）
                </span>
              </span>
            </label>
            {lastRagInfo && (
              <div className="mt-1.5 ml-5 text-[11px] text-emerald-600 dark:text-emerald-400">
                上次召回 {lastRagInfo.recalled} 条 ·{' '}
                <span className="text-slate-500 truncate inline-block max-w-[200px] align-middle" title={lastRagInfo.query}>
                  {lastRagInfo.query}
                </span>
              </div>
            )}
          </div>
            </div>
          </div>

          <button
            type="button"
            onClick={clearHistory}
            disabled={loading || history.length === 0}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            <Trash2 size={12} aria-hidden="true" />
            清空对话历史（{history.length}）
          </button>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-3 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          <div className="font-medium text-slate-600 dark:text-slate-300 mb-1">提示</div>
          <ul className="list-disc pl-4 space-y-1">
            <li>多轮对话已支持：每次发送会带上之前所有 user/assistant 消息</li>
            <li>切换 Key 后立即生效，无需保存</li>
            <li>所有调用记录到 AIOutput type=&apos;playground:llm&apos;，可在 /workspace?tab=history 查看</li>
          </ul>
        </div>
      </aside>

      {/* 右：对话区 */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col min-h-[60vh]">
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3" data-llm-history>
          {history.length === 0 && (
            <div className="text-center text-sm text-slate-400 dark:text-slate-500 mt-12">
              <Sparkles size={24} className="mx-auto mb-2 opacity-50" aria-hidden="true" />
              在下方输入第一条消息开始对话
            </div>
          )}
          {history.map((t, i) => (
            <Bubble
              key={i}
              turn={t}
              loading={false}
              onCopy={() => void copyContent(t.content)}
              onRegenerate={t.role === 'assistant' && i === history.length - 1 ? regenerate : undefined}
            />
          ))}
          {loading && (
            <div className="text-xs text-slate-400 dark:text-slate-500 inline-flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              生成中…
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 p-3 sm:p-4 bg-slate-50/50 dark:bg-slate-900/40">
          <textarea
            data-llm-user
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="输入消息…（Cmd/Ctrl+Enter 发送）"
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
              {history.length} 条消息 · {selectedKey ? selectedKey.label : '未选 key'}
            </div>
            <button
              type="button"
              data-llm-send
              onClick={() => void send()}
              disabled={loading || !user.trim()}
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
  loading,
  onCopy,
  onRegenerate,
}: {
  turn: ChatTurn;
  loading: boolean;
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
          <div>{turn.content || (loading ? '…' : '')}</div>
        )}
        {!isUser && !turn.error && (turn.model || turn.latencyMs) && (
          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-3">
            {turn.model && <span title="model">{turn.model}</span>}
            {turn.latencyMs !== undefined && (
              <span title="latency">{(turn.latencyMs / 1000).toFixed(2)}s</span>
            )}
            {turn.tokens?.total !== undefined && (
              <span title="tokens">{turn.tokens.total} tokens</span>
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
                  title="重新发送上一条 user 消息"
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
