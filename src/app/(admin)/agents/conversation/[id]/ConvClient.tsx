'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Send, ArrowLeft } from 'lucide-react';
import { KeyOverrideSelector, useKeyOverride } from '@/components/key-override/KeyOverrideSelector';
import Link from 'next/link';

interface Msg { id?: string; role: 'user' | 'assistant'; content: string; model?: string | null; createdAt?: string; }
interface AgentMeta { slug: string; name: string; icon: string; }

export default function ConvClient({ id }: { id: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [agentSlug, setAgentSlug] = useState<string>('');
  const keyOverride = useKeyOverride(agentSlug ? `chat:${agentSlug}` : 'chat:unknown');
  const [agentMeta, setAgentMeta] = useState<AgentMeta | null>(null);
  const [title, setTitle] = useState<string>('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scroll = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void load();
    void fetch('/api/agents/list').then((r) => r.json()).then((j) => {
      if (j?.ok && agentSlug) {
        const m = (j.agents as AgentMeta[]).find((a) => a.slug === agentSlug);
        if (m) setAgentMeta(m);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (agentSlug) {
      void fetch('/api/agents/list').then((r) => r.json()).then((j) => {
        if (j?.ok) {
          const m = (j.agents as AgentMeta[]).find((a) => a.slug === agentSlug);
          if (m) setAgentMeta(m);
        }
      });
    }
  }, [agentSlug]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/conversations/${id}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || '加载失败');
      setMsgs(j.conversation.messages);
      setAgentSlug(j.conversation.agentSlug);
      setTitle(j.conversation.title);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, pending]);

  async function send() {
    const t = input.trim();
    if (!t || pending) return;
    const newMsgs: Msg[] = [...msgs, { role: 'user', content: t }];
    setMsgs(newMsgs); setInput(''); setPending(true); setErr(null);
    try {
      const r = await fetch(`/api/agents/${agentSlug}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMsgs.map((m) => ({ role: m.role, content: m.content })),
          conversationId: id,
          keyOverride,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setMsgs([...newMsgs, { role: 'assistant', content: j.content, model: j.model }]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-3 h-[calc(100vh-100px)] flex flex-col">
      <div className="flex items-center gap-2">
        <Link href="/workspace?tab=history" className="text-sm text-slate-500 hover:underline inline-flex items-center gap-1">
          <ArrowLeft size={14} /> 返回历史
        </Link>
      </div>
      <div className="card">
        <div className="card-body py-3 flex items-center gap-2">
          <span className="text-2xl">{agentMeta?.icon || '🤖'}</span>
          <div>
            <div className="font-semibold">{agentMeta?.name || agentSlug}</div>
            <div className="text-xs text-slate-500">{title}</div>
          </div>
        </div>
      </div>

      <div ref={scroll} className="flex-1 overflow-y-auto space-y-3 px-1">
        {loading ? (
          <div className="text-sm text-slate-500 text-center py-8 inline-flex items-center gap-2"><Loader2 className="animate-spin" size={14}/> 加载中...</div>
        ) : msgs.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-8">无消息</div>
        ) : msgs.map((m, i) => (
          <div key={i} className={`text-sm ${m.role === 'user' ? 'ml-8 bg-blue-50 dark:bg-blue-900/30' : 'mr-8 bg-slate-50 dark:bg-slate-800/60'} rounded-lg px-3 py-2`}>
            <div className="whitespace-pre-wrap break-words">{m.content}</div>
            {m.model && <div className="text-[10px] text-slate-400 mt-1">{m.model}</div>}
          </div>
        ))}
        {pending && <div className="mr-8 bg-slate-50 dark:bg-slate-800/60 rounded-lg px-3 py-2 text-sm text-slate-500 inline-flex items-center gap-2"><Loader2 className="animate-spin" size={14}/> 思考中…</div>}
        {err && <div className="text-xs bg-red-50 text-red-700 rounded p-2">{err}</div>}
      </div>

      {!loading && agentSlug && (
        <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex gap-2">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }}}
            className="input flex-1"
            placeholder="继续这次对话..."
            disabled={pending}
          />
          <button type="submit" disabled={pending || !input.trim()} className="btn-primary inline-flex items-center"><Send size={16}/></button>
        </form>
      )}
    </div>
  );
}
