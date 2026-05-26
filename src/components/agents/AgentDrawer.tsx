'use client';

/**
 * <AgentDrawer> — 站内 agent 侧边栏 chat
 *
 * 用法：
 *   <AgentLauncher slug="api-doctor" />
 * 或直接：
 *   <AgentDrawer slug="api-doctor" open={...} onClose={...} />
 *
 * 设计：
 *   - 右侧滑出抽屉，宽度 420px（移动端全屏）
 *   - 简单 user/assistant 气泡，不做流式
 *   - 第一条消息可以是 prefill（用 prefill prop）
 *   - 错误用全局 toast（v0.11 B4 起统一），不再用 inline error block
 */

import { useEffect, useRef, useState } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import { KeyOverrideSelector, useKeyOverride } from '@/components/key-override/KeyOverrideSelector';
import { toast } from '@/lib/toast';

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  /** 服务端返回的 model，仅 assistant 有 */
  model?: string;
}

export interface AgentDrawerProps {
  slug: string;
  open: boolean;
  onClose: () => void;
  /** 抽屉标题；不传时从 /api/agents/list 拉取 */
  title?: string;
  icon?: string;
  /** 首次打开时自动填进输入框（不会自动发送） */
  prefill?: string;
  /** 自动发出的第一条 user 消息（开打就发，不需要用户点） */
  autoFirstMessage?: string;
  /** 服务端 context loader 的额外参数（如 clientId） */
  context?: Record<string, unknown>;
}

export function AgentDrawer({
  slug,
  open,
  onClose,
  title,
  icon,
  prefill,
  autoFirstMessage,
  context,
}: AgentDrawerProps) {
  const keyOverride = useKeyOverride(`chat:${slug}`);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState(prefill ?? '');
  const [pending, setPending] = useState(false);
  // v0.12 任务2：服务端返回的会话 id，后续消息带上以续接
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentAuto = useRef(false);

  useEffect(() => {
    if (open && prefill && turns.length === 0) {
      setInput(prefill);
    }
  }, [open, prefill, turns.length]);

  useEffect(() => {
    if (open && autoFirstMessage && !sentAuto.current && turns.length === 0) {
      sentAuto.current = true;
      void send(autoFirstMessage);
    }
    if (!open) sentAuto.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoFirstMessage]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, pending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    const newTurns: ChatTurn[] = [...turns, { role: 'user', content: trimmed }];
    setTurns(newTurns);
    setInput('');
    setPending(true);
    try {
      const r = await fetch(`/api/agents/${slug}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newTurns.map((t) => ({ role: t.role, content: t.content })),
          context,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      if (j.conversationId) setConversationId(j.conversationId);
      setTurns([...newTurns, { role: 'assistant', content: j.content, model: j.model }]);
    } catch (e) {
      // v0.11 B4: setError → toast.error 统一错误展示
      toast.error(`请求失败：${(e as Error).message}`);
    } finally {
      setPending(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* backdrop */}
      <div
        className="flex-1 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        aria-label="close drawer"
      />
      {/* drawer */}
      <aside className="w-full sm:w-[420px] h-full bg-white dark:bg-slate-900 shadow-xl flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-xl">{icon ?? '🤖'}</span>
            <div>
              <div className="font-semibold">{title ?? slug}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">DO router · 实时回答</div>
            </div>
          </div>
          <KeyOverrideSelector scope={`chat:${slug}`} show={['llm']} className="mr-1" />
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="close"
          >
            <X size={18} />
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {turns.length === 0 && !pending && (
            <div className="text-sm text-slate-500 dark:text-slate-400 text-center mt-12 px-6">
              直接提问吧。比如：
              <ul className="mt-2 space-y-1 text-left text-xs list-disc list-inside">
                <li>「为什么我的 4router-gpt-image-2 报渠道不存在？」</li>
                <li>「帮我看一下这段 curl，能配成 adapter 吗？」</li>
                <li>「我想加个 stable-diffusion-3 的中转，怎么开始？」</li>
              </ul>
            </div>
          )}
          {turns.map((t, i) => (
            <div
              key={i}
              className={`text-sm ${
                t.role === 'user'
                  ? 'ml-8 bg-blue-50 dark:bg-blue-900/30 rounded-lg px-3 py-2'
                  : 'mr-8 bg-slate-50 dark:bg-slate-800/60 rounded-lg px-3 py-2'
              }`}
            >
              <div className="whitespace-pre-wrap break-words">{t.content}</div>
              {t.model && <div className="text-[10px] text-slate-400 mt-1">model: {t.model}</div>}
            </div>
          ))}
          {pending && (
            <div className="mr-8 bg-slate-50 dark:bg-slate-800/60 rounded-lg px-3 py-2 text-sm text-slate-500 dark:text-slate-400 inline-flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> 思考中…
            </div>
          )}
        </div>

        <form onSubmit={onSubmit} className="border-t border-slate-200 dark:border-slate-700 p-3 flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            placeholder="输入问题，Enter 发送，Shift+Enter 换行"
            className="flex-1 resize-none rounded border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            disabled={pending}
          />
          <button
            type="submit"
            disabled={pending || input.trim().length === 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded px-3 py-2 inline-flex items-center"
          >
            <Send size={16} />
          </button>
        </form>
      </aside>
    </div>
  );
}

export interface AgentLauncherProps {
  slug: string;
  /** 默认显示一个浮动按钮；传 inline 时改为内嵌按钮 */
  variant?: 'floating' | 'inline';
  label?: string;
  prefill?: string;
  autoFirstMessage?: string;
  context?: Record<string, unknown>;
}

interface AgentMeta {
  slug: string;
  name: string;
  icon: string;
  description: string;
}

export function AgentLauncher({
  slug,
  variant = 'floating',
  label,
  prefill,
  autoFirstMessage,
  context,
}: AgentLauncherProps) {
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState<AgentMeta | null>(null);

  useEffect(() => {
    void fetch('/api/agents/list')
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) {
          const m = (j.agents as AgentMeta[]).find((a) => a.slug === slug);
          if (m) setMeta(m);
        }
      })
      .catch(() => {});
  }, [slug]);

  const display = meta ? `${meta.icon} ${meta.name}` : (label ?? '问 AI');

  return (
    <>
      {variant === 'floating' ? (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 bg-blue-600 hover:bg-blue-700 text-white shadow-lg rounded-full px-4 py-3 text-sm font-medium inline-flex items-center gap-2"
          aria-label="open agent"
        >
          {display}
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="text-sm bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-md px-3 py-1.5 inline-flex items-center gap-1"
        >
          {display}
        </button>
      )}
      <AgentDrawer
        slug={slug}
        open={open}
        onClose={() => setOpen(false)}
        title={meta?.name}
        icon={meta?.icon}
        prefill={prefill}
        autoFirstMessage={autoFirstMessage}
        context={context}
      />
    </>
  );
}
