'use client';

/**
 * v0.18-DISCUSS · 讨论工具（平台原生聊天室）
 *
 * 与平台同一套视觉语言（slate/brand 配色 + lucide 图标 + card/input/btn-primary）。
 * 身份直接用平台登录用户（由 server 注入 currentUser），无需再"加入聊天室"。
 *
 * 实时：短轮询（2s）增量拉取 id>lastId 的新消息，轻量、零额外基础设施，
 * 完全匹配团队内部讨论用量。窗口不可见时暂停轮询省资源。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Loader2, MessagesSquare, RefreshCw } from 'lucide-react';

interface DiscussMsg {
  id: number;
  username: string;
  role: string;
  content: string;
  createdAt: string;
}

export default function DiscussClient({
  currentUser,
}: {
  currentUser: { username: string; role: string };
}) {
  const [messages, setMessages] = useState<DiscussMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastIdRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const ingest = useCallback((incoming: DiscussMsg[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const merged = [...prev];
      for (const m of incoming) {
        if (!seen.has(m.id)) merged.push(m);
        if (m.id > lastIdRef.current) lastIdRef.current = m.id;
      }
      return merged;
    });
  }, []);

  // 初次加载
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/discuss/messages?limit=80', { cache: 'no-store' });
        const j = await r.json();
        if (cancelled) return;
        if (j.ok) {
          ingest(j.messages);
          requestAnimationFrame(() => scrollToBottom(false));
          // 增加延时滚动兜底，确保在 DOM 彻底渲染并排版完毕后，滚动条能精准落到底部
          setTimeout(() => scrollToBottom(false), 50);
          setTimeout(() => scrollToBottom(false), 200);
        } else {
          setError(j.error || '加载失败');
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ingest, scrollToBottom]);

  // 短轮询增量
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const poll = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const r = await fetch(`/api/discuss/messages?afterId=${lastIdRef.current}`, {
          cache: 'no-store',
        });
        const j = await r.json();
        if (j.ok && Array.isArray(j.messages) && j.messages.length > 0) {
          const wasAtBottom = atBottomRef.current;
          ingest(j.messages);
          if (wasAtBottom) requestAnimationFrame(() => scrollToBottom(true));
        }
      } catch {
        /* 静默，下一轮重试 */
      }
    };
    timer = setInterval(poll, 2000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [ingest, scrollToBottom]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    try {
      const r = await fetch('/api/discuss/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const j = await r.json();
      if (!j.ok) {
        setError(j.error || '发送失败');
        return;
      }
      setDraft('');
      ingest([j.message]);
      atBottomRef.current = true;
      requestAnimationFrame(() => scrollToBottom(true));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="max-w-3xl mx-auto h-[calc(100vh-3.5rem)] flex flex-col p-3 sm:p-4">
      {/* 头部 */}
      <header className="flex items-center gap-2 pb-3">
        <MessagesSquare size={20} className="text-brand-600 dark:text-brand-400" />
        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">讨论工具</h1>
        <span className="text-xs text-slate-400 ml-1">团队内部实时讨论</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
          {currentUser.username}
          {currentUser.role === 'admin' && (
            <span className="text-[10px] font-mono uppercase px-1 py-0.5 rounded bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-300">
              admin
            </span>
          )}
        </span>
      </header>

      {/* 消息区 */}
      <div className="flex-1 min-h-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col overflow-hidden">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto p-4 space-y-3"
        >
          {loading ? (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
              <Loader2 className="animate-spin mr-2" size={16} /> 加载中…
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
              <MessagesSquare size={28} className="opacity-40" />
              还没有消息，开始第一条讨论吧 ✨
            </div>
          ) : (
            messages.map((m) => {
              const mine = m.username === currentUser.username;
              return (
                <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-1.5 mb-0.5 px-1">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {mine ? '我' : m.username}
                    </span>
                    {m.role === 'admin' && (
                      <span className="text-[9px] font-mono uppercase px-1 rounded bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-300">
                        admin
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400">{fmtTime(m.createdAt)}</span>
                  </div>
                  <div
                    className={[
                      'max-w-[78%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words',
                      mine
                        ? 'bg-brand-600 text-white rounded-br-sm'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-sm',
                    ].join(' ')}
                  >
                    {m.content}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 输入区 */}
        <div className="border-t border-slate-200 dark:border-slate-800 p-3">
          {error && (
            <div className="text-xs text-red-600 dark:text-red-400 mb-2">{error}</div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              className="input flex-1 resize-none max-h-32 text-sm"
              rows={1}
              placeholder="输入消息，Enter 发送，Shift+Enter 换行"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={sending}
            />
            <button
              onClick={send}
              disabled={sending || !draft.trim()}
              className="btn-primary inline-flex items-center gap-1.5 shrink-0"
            >
              {sending ? <Loader2 className="animate-spin" size={15} /> : <Send size={15} />}
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const p = (n: number) => String(n).padStart(2, '0');
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  return sameDay ? hm : `${p(d.getMonth() + 1)}-${p(d.getDate())} ${hm}`;
}
