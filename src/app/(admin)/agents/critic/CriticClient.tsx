'use client';

/**
 * v0.16-H2.3 · /agents/critic · 作品诊断师
 *
 * 用户场景: 上传一张作品 → vision LLM 多轮诊断 + 图上画批注 + 风格匹配度
 */

import { useState, useRef, useEffect } from 'react';
import { Loader2, Upload, Send, Image as ImageIcon, ThumbsUp, ThumbsDown, X, AlertTriangle } from 'lucide-react';
import { toast } from '@/lib/toast';

type Severity = 'high' | 'medium' | 'low';

interface Comment {
  x: number;
  y: number;
  w: number;
  h: number;
  severity: Severity;
  label?: string;
  message?: string;
  index?: number;
}

interface Reply {
  score: number;
  comments: Comment[];
  suggestion: string;
}

interface StyleMatch {
  score: number;
  paletteScore: number;
  compositionScore: number;
}

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  reply?: Reply;
  overlayDataUrl?: string;
  styleMatch?: StyleMatch;
}

const SEVERITY_COLOR: Record<Severity, string> = {
  high: 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300',
  medium: 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300',
  low: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300',
};

const SEVERITY_DOT: Record<Severity, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-emerald-500',
};

export default function CriticClient() {
  const [imageDataUrl, setImageDataUrl] = useState<string>('');
  const [conversationId, setConversationId] = useState<string>('');
  const [platform, setPlatform] = useState<string>('general');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [visionAvailable, setVisionAvailable] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  function handleFile(f: File) {
    if (f.size > 10 * 1024 * 1024) {
      toast.error('图片不能超过 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(String(reader.result));
      setConversationId('');
      setTurns([]);
    };
    reader.readAsDataURL(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  }

  async function send() {
    const msg = input.trim();
    if (!msg) return;
    if (!imageDataUrl) {
      toast.error('请先上传图片');
      return;
    }
    setBusy(true);
    setInput('');
    const newUserTurn: Turn = { role: 'user', content: msg };
    setTurns((arr) => [...arr, newUserTurn]);

    try {
      const r = await fetch('/api/agents/critic/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversationId || undefined,
          imageDataUrl,
          userMessage: msg,
          platform,
        }),
      });
      const j = await r.json();
      if (!j.ok) {
        if (j.visionAvailable === false) {
          setVisionAvailable(false);
          toast.error(j.error || 'Vision 功能不可用');
        } else {
          toast.error(j.error || '诊断失败');
        }
        setTurns((arr) => [...arr, { role: 'assistant', content: '✗ ' + (j.error || '失败') }]);
      } else {
        setVisionAvailable(true);
        if (j.conversationId) setConversationId(j.conversationId);
        setTurns((arr) => [
          ...arr,
          {
            role: 'assistant',
            content: j.reply.suggestion,
            reply: j.reply,
            overlayDataUrl: j.overlayDataUrl,
            styleMatch: j.styleMatch,
          },
        ]);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function feedback(vote: 'helpful' | 'unhelpful') {
    if (!conversationId) return;
    try {
      await fetch('/api/agents/critic/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, vote }),
      });
      toast.success('已记录');
    } catch { /* */ }
  }

  function reset() {
    if (!confirm('清空当前诊断会话？')) return;
    setImageDataUrl('');
    setConversationId('');
    setTurns([]);
    setInput('');
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns]);

  const lastAssistant = [...turns].reverse().find((t) => t.role === 'assistant' && t.reply);
  const displayImage = lastAssistant?.overlayDataUrl || imageDataUrl;

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-4 space-y-4">
      <header className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center gap-2 mb-1">
          <ImageIcon size={20} className="text-brand-600 dark:text-brand-400" />
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            🩺 作品诊断师 · Critic
          </h1>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          上传作品 → vision LLM 多轮诊断 → 图上画批注 + 风格基因匹配度
        </p>
      </header>

      {visionAvailable === false && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-300">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold mb-1">Vision LLM 未配置</div>
              <p className="text-xs">
                当前 LLM 池没有支持视觉的 key。请在 <a href="/settings" className="underline">/settings</a> 添加一条 model 含 <code className="px-1 rounded bg-amber-100 dark:bg-amber-800/40 font-mono">gpt-4o</code> / <code className="px-1 rounded bg-amber-100 dark:bg-amber-800/40 font-mono">claude-3</code> / <code className="px-1 rounded bg-amber-100 dark:bg-amber-800/40 font-mono">qwen-vl</code> / <code className="px-1 rounded bg-amber-100 dark:bg-amber-800/40 font-mono">gemini</code> 的 key。
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 左侧: 图片区 */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">📷 作品 {lastAssistant?.overlayDataUrl && <span className="text-xs text-slate-500">(含批注框)</span>}</h3>
            {imageDataUrl && (
              <button onClick={reset} className="text-xs text-slate-500 hover:text-red-600 inline-flex items-center gap-1">
                <X size={12} /> 重新上传
              </button>
            )}
          </div>

          {!imageDataUrl ? (
            <div
              className="aspect-square rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center cursor-pointer hover:border-brand-400 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <Upload size={32} className="text-slate-400 mb-2" />
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300">点击或拖拽上传作品</div>
              <div className="text-xs text-slate-500 mt-1">PNG / JPG ≤ 10MB</div>
            </div>
          ) : (
            <img src={displayImage} alt="作品" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 max-h-[600px] object-contain bg-slate-50 dark:bg-slate-950" />
          )}

          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />

          {/* 平台选择 */}
          {imageDataUrl && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-slate-500">平台调性:</span>
              <select
                className="input text-xs flex-1"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                disabled={busy || turns.length > 0}
              >
                <option value="general">通用</option>
                <option value="xiaohongshu">小红书</option>
                <option value="xianyu">闲鱼</option>
                <option value="qianniu">千牛</option>
              </select>
            </div>
          )}

          {/* 得分 + 风格匹配 */}
          {lastAssistant?.reply && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <ScoreCard label="整体得分" score={lastAssistant.reply.score} accent="from-brand-400 to-brand-600" />
              {lastAssistant.styleMatch && (
                <ScoreCard
                  label="风格基因匹配度"
                  score={lastAssistant.styleMatch.score}
                  detail={`色板 ${lastAssistant.styleMatch.paletteScore}% · 构图 ${lastAssistant.styleMatch.compositionScore}%`}
                  accent="from-emerald-400 to-emerald-600"
                />
              )}
            </div>
          )}

          {/* 批注列表 */}
          {lastAssistant?.reply?.comments && lastAssistant.reply.comments.length > 0 && (
            <div className="mt-3 space-y-2">
              <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">批注 ({lastAssistant.reply.comments.length})</h4>
              {lastAssistant.reply.comments.map((c, i) => (
                <div key={i} className={`text-xs rounded-lg border-l-4 p-2 ${SEVERITY_COLOR[c.severity]}`}>
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className={`w-4 h-4 rounded-full ${SEVERITY_DOT[c.severity]} text-white text-[10px] flex items-center justify-center font-mono`}>{c.index}</span>
                    <span className="font-mono text-[10px] opacity-70">{c.label}</span>
                    <span className="ml-auto text-[10px] opacity-60">{c.severity}</span>
                  </div>
                  <p className="leading-relaxed">{c.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右侧: 对话区 */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col h-[700px]">
          <h3 className="text-sm font-semibold mb-2">💬 多轮诊断</h3>

          <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 mb-3 pr-2">
            {turns.length === 0 && (
              <div className="text-xs text-slate-500 text-center py-8">
                {imageDataUrl ? (
                  <>
                    试试问: <br />
                    "这张你觉得怎么样？" <br />
                    "标题字号合适吗？" <br />
                    "整体配色和小红书调性匹配吗？"
                  </>
                ) : '上传图片后开始对话'}
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                  t.role === 'user'
                    ? 'bg-brand-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                }`}>
                  {t.role === 'assistant' && t.reply && (
                    <div className="text-[10px] opacity-70 mb-1">得分 {t.reply.score} · {t.reply.comments.length} 条批注</div>
                  )}
                  <div className="leading-relaxed whitespace-pre-wrap">{t.content}</div>
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2 text-sm">
                  <Loader2 size={14} className="animate-spin inline mr-2" />诊断中…
                </div>
              </div>
            )}
          </div>

          {conversationId && turns.length >= 2 && (
            <div className="flex items-center gap-2 mb-2 text-xs">
              <span className="text-slate-500">这次诊断有用吗?</span>
              <button onClick={() => feedback('helpful')} className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 inline-flex items-center gap-1">
                <ThumbsUp size={11} /> 有用
              </button>
              <button onClick={() => feedback('unhelpful')} className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-900/20 inline-flex items-center gap-1">
                <ThumbsDown size={11} /> 没帮到
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <input
              className="input flex-1"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !busy) send(); }}
              placeholder={imageDataUrl ? "问一句, 比如'整体得分多少?'" : '请先上传图片'}
              disabled={busy || !imageDataUrl}
            />
            <button onClick={send} disabled={busy || !input.trim() || !imageDataUrl} className="btn-primary inline-flex items-center gap-1">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {busy ? '...' : '发送'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreCard({ label, score, detail, accent }: { label: string; score: number; detail?: string; accent: string }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
      <div className="text-[10px] text-slate-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold bg-gradient-to-r ${accent} bg-clip-text text-transparent`}>
        {score}
        <span className="text-xs text-slate-400 font-normal">/100</span>
      </div>
      {detail && <div className="text-[10px] text-slate-500 mt-1">{detail}</div>}
    </div>
  );
}
