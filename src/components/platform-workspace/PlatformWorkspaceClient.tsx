'use client';

/**
 * <PlatformWorkspaceClient> v0.13
 *
 * 工作流：
 *   idle → (可选 ✨ 润色 → 抽屉确认) → 一键生成 → 关键问题问答（轮 1）
 *     → 用户答 → AI 决定补问 1-2 个（轮 2 可选）→ 用户答 → 真正生成
 *
 * 5 张图：第 1 张 t2i + 后 4 张并发 i2i（基于第 1 张），保证风格统一
 */

import { useState, useEffect } from 'react';
import { KeyOverrideSelector, useKeyOverride } from '@/components/key-override/KeyOverrideSelector';
import {
  Loader2, Copy, Download, RefreshCw, Check, X, AlertCircle, ImageOff,
  ChevronDown, ChevronUp, Clock, ChevronLeft, ChevronRight, Sparkles, ArrowRight,
} from 'lucide-react';

type PlatformSlug = 'xiaohongshu-operator' | 'xianyu-operator' | 'qianniu-operator';

export interface PlatformWorkspaceProps {
  slug: PlatformSlug;
  title: string;
  icon: string;
  placeholder: string;
  expectSize: string;
}

interface PageWithImage {
  pageTitle?: string; mainText?: string; subText?: string;
  layout?: string; color?: string; material?: string;
  imagePrompt?: string;
  imageUrl?: string; imageError?: string;
  assetId?: string;
  mode?: 't2i' | 'i2i';
}

interface SelfCheckItem { question: string; passed: boolean; note?: string; }

interface BuildResponse {
  ok: boolean; partialSuccess?: boolean; platform?: string; pipeline?: string;
  text?: {
    pages?: PageWithImage[]; titles?: string[]; title?: string;
    body?: string; tags?: string[]; commentHook?: string; dmKeyword?: string;
    negotiationReplies?: string[]; priceTag?: string; sellingPoint?: string;
    sellingPoints?: string[]; marketingPoints?: string[]; targetUsers?: string[];
    mainSellingPoint?: string; selfCheck?: SelfCheckItem[]; styleSummary?: string;
  };
  successCount?: number; totalImages?: number;
  timing?: { llmMs: number; imgPipelineMs: number; coverMs?: number; totalMs: number };
  error?: string; stage?: string; model?: string;
}

interface ClarifyQuestion {
  id: string;
  question: string;
  type: 'choice' | 'text';
  options?: string[];
  allowCustom?: boolean;
}

const PAGE_FUNCTIONS: Record<PlatformSlug, string[]> = {
  'xiaohongshu-operator': ['封面｜吸引点击', '痛点｜共鸣', '思路｜专业', '结果｜对比', '转化｜引导'],
  'xianyu-operator': ['主图｜点击率', '细节｜特写', '场景｜真实', '对比/规格', '诚信｜说明'],
  'qianniu-operator': ['主图｜点击', '卖点图', '规格图', '场景图', '信任图'],
};

type Phase = 'idle' | 'polishing' | 'polishReview' | 'clarifying' | 'generating' | 'done';

export function PlatformWorkspaceClient(props: PlatformWorkspaceProps) {
  const keyOverride = useKeyOverride(props.slug);

  const [topic, setTopic] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BuildResponse | null>(null);
  const [activeImageIdx, setActiveImageIdx] = useState<number | null>(null);

  // 润色
  const [polishOpen, setPolishOpen] = useState(false);
  const [polished, setPolished] = useState('');
  const [polishLoading, setPolishLoading] = useState(false);

  // 问答
  const [clarifyOpen, setClarifyOpen] = useState(false);
  const [clarifyRound, setClarifyRound] = useState(1);
  const [clarifyQuestions, setClarifyQuestions] = useState<ClarifyQuestion[]>([]);
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<string, string>>({});
  const [clarifyLoading, setClarifyLoading] = useState(false);

  // 最近生成
  interface RecentItem { id: string; topic: string; title: string; titles: string[]; body: string; tags: string[]; images: { url: string; ok: boolean }[]; createdAt: string; }
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [recentOpen, setRecentOpen] = useState(false);
  const [recentLoading, setRecentLoading] = useState(false);

  async function loadRecent() {
    setRecentLoading(true);
    try {
      const r = await fetch(`/api/agents/${props.slug}/recent?limit=10`);
      const j = await r.json();
      if (j.ok) setRecent(j.items as RecentItem[]);
    } catch {/* ignore */}
    finally { setRecentLoading(false); }
  }
  useEffect(() => { void loadRecent(); }, [props.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // 翻页
  function gotoPrev() {
    const pages = result?.text?.pages;
    if (activeImageIdx === null || !pages) return;
    setActiveImageIdx((idx) => (idx === null ? null : (idx - 1 + pages.length) % pages.length));
  }
  function gotoNext() {
    const pages = result?.text?.pages;
    if (activeImageIdx === null || !pages) return;
    setActiveImageIdx((idx) => (idx === null ? null : (idx + 1) % pages.length));
  }
  useEffect(() => {
    if (activeImageIdx === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); gotoPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); gotoNext(); }
      else if (e.key === 'Escape') setActiveImageIdx(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeImageIdx, result]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 润色 ───
  async function runPolish() {
    if (!topic.trim()) return;
    setPolishLoading(true); setPolished(''); setPolishOpen(true);
    try {
      const r = await fetch(`/api/agents/${props.slug}/polish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), keyOverride }),
      });
      const j = await r.json();
      if (j.ok) setPolished(j.polished);
      else setError(j.error || '润色失败');
    } catch (e) { setError((e as Error).message); }
    finally { setPolishLoading(false); }
  }
  function acceptPolish() {
    if (polished) setTopic(polished);
    setPolishOpen(false);
  }
  function cancelPolish() { setPolishOpen(false); }

  // ─── 一键生成入口 → 先问答 ───
  async function onGenerateClick() {
    if (!topic.trim()) return;
    setPhase('clarifying'); setError(null); setResult(null);
    setClarifyAnswers({}); setClarifyQuestions([]); setClarifyRound(1);
    setClarifyOpen(true); setClarifyLoading(true);
    try {
      const r = await fetch(`/api/agents/${props.slug}/clarify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), round: 1, keyOverride }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || '获取关键问题失败');
      if (j.done || (j.questions && j.questions.length === 0)) {
        // 没问题直接生成
        setClarifyOpen(false);
        await runBuildAll({});
      } else {
        setClarifyQuestions(j.questions);
      }
    } catch (e) {
      setError((e as Error).message);
      setPhase('idle'); setClarifyOpen(false);
    } finally { setClarifyLoading(false); }
  }

  async function submitClarifyRound() {
    setClarifyLoading(true);
    try {
      // 第一轮答完，让 AI 决定要不要补问
      if (clarifyRound === 1) {
        const r = await fetch(`/api/agents/${props.slug}/clarify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: topic.trim(), round: 2, previousAnswers: clarifyAnswers, keyOverride }),
        });
        const j = await r.json();
        if (j.ok && Array.isArray(j.questions) && j.questions.length > 0) {
          setClarifyQuestions(j.questions);
          setClarifyRound(2);
          return; // 等用户填第二轮
        }
      }
      // 已经够了或者第二轮答完 → 真正生成
      setClarifyOpen(false);
      await runBuildAll(clarifyAnswers);
    } catch (e) {
      setError((e as Error).message);
      setPhase('idle'); setClarifyOpen(false);
    } finally { setClarifyLoading(false); }
  }

  function skipClarify() {
    setClarifyOpen(false);
    void runBuildAll(clarifyAnswers);
  }

  async function runBuildAll(answers: Record<string, string>) {
    setPhase('generating'); setStage('正在写脚本...');
    const t1 = setTimeout(() => setStage('正在生成第 1 张封面...'), 8000);
    const t2 = setTimeout(() => setStage('封面完成，正在并发生成后 4 张 i2i...'), 50000);
    const t3 = setTimeout(() => setStage('裁剪到平台规范...'), 110000);
    try {
      const r = await fetch(`/api/agents/${props.slug}/build-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), clarifyAnswers: answers, keyOverride }),
      });
      const j = (await r.json()) as BuildResponse;
      [t1, t2, t3].forEach(clearTimeout);
      if (!j.ok) {
        setError(`${j.stage ? `[${j.stage}] ` : ''}${j.error || '生成失败'}`);
      }
      setResult(j); setPhase('done');
      void loadRecent();
    } catch (e) {
      [t1, t2, t3].forEach(clearTimeout);
      setError((e as Error).message); setPhase('idle');
    } finally { setStage(''); }
  }

  // ─── 复制/下载 ───
  function copyText(text: string, label: string) {
    void navigator.clipboard.writeText(text).then(() => alert(`已复制：${label}`), () => alert('复制失败'));
  }
  function copyAllContent() {
    const t = result?.text;
    if (!t) return;
    const lines: string[] = [];
    if (t.titles && t.titles.length > 0) { lines.push('【标题候选】'); t.titles.forEach((s, i) => lines.push(`${i+1}. ${s}`)); }
    if (t.title) lines.push(`【标题】\n${t.title}`);
    if (t.body) lines.push(`\n【正文】\n${t.body}`);
    if (t.sellingPoints?.length) lines.push(`\n【卖点】\n${t.sellingPoints.map(s => '· ' + s).join('\n')}`);
    if (t.marketingPoints?.length) lines.push(`\n【营销点】\n${t.marketingPoints.map(s => '· ' + s).join('\n')}`);
    if (t.tags?.length) lines.push(`\n【标签】\n${t.tags.map(s => '#' + s).join(' ')}`);
    if (t.commentHook) lines.push(`\n【评论引导】${t.commentHook}`);
    if (t.dmKeyword) lines.push(`【私信关键词】${t.dmKeyword}`);
    copyText(lines.join('\n'), '全部文案');
  }
  function downloadImage(url: string, idx: number) {
    const a = document.createElement('a');
    a.href = url; a.download = `${props.slug}-${idx + 1}-${url.split('/').pop()}`; a.click();
  }
  function loadOldOne(item: RecentItem) {
    setResult({
      ok: true, platform: props.slug.replace('-operator', ''),
      successCount: item.images.filter(i => i.ok).length, totalImages: item.images.length || 5,
      text: {
        pages: item.images.map((img) => ({ pageTitle: '', mainText: '', imageUrl: img.ok ? img.url : undefined, imageError: img.ok ? undefined : '此图未生成' })),
        titles: item.titles, title: item.title, body: item.body, tags: item.tags,
      },
    } as BuildResponse);
    setTopic(item.topic || ''); setPhase('done');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const t = result?.text; const pageFns = PAGE_FUNCTIONS[props.slug];
  const passedCount = t?.selfCheck?.filter(s => s.passed).length || 0;
  const totalCheck = t?.selfCheck?.length || 0;
  const isLoading = phase === 'polishing' || phase === 'clarifying' || phase === 'generating';

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 bg-slate-50/50 dark:bg-slate-950/20 rounded-3xl border border-slate-100 dark:border-slate-900/60 shadow-sm">
      {/* 头部信息 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-900/50">
        <div className="flex items-center gap-3">
          <span className="text-4xl filter drop-shadow-md">{props.icon}</span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">{props.title}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              主题描述 → <span className="text-purple-500 font-semibold">✨ 智能润色</span> → 选项澄清 → 产出 5 张系列连环图（{props.expectSize}）
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
          <KeyOverrideSelector scope={props.slug} show={['llm', 'image']} />
        </div>
      </div>

      {/* 输入控制台 */}
      <div className="relative rounded-2xl border border-slate-200/60 dark:border-slate-850 bg-white dark:bg-slate-900 shadow-sm overflow-hidden transition-all focus-within:ring-2 focus-within:ring-brand-500/20 focus-within:border-brand-500">
        <div className="p-4 space-y-4">
          <div className="relative">
            <textarea
              className="w-full bg-transparent border-0 resize-none min-h-[110px] text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:ring-0 focus:outline-none leading-relaxed"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={props.placeholder}
              disabled={isLoading}
            />
            {/* 右下角 ✨ 润色按钮 */}
            <button
              type="button"
              onClick={runPolish}
              disabled={isLoading || !topic.trim() || polishLoading}
              className="absolute right-0 bottom-0 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/55 dark:bg-purple-950/20 text-purple-700 dark:text-purple-400 hover:bg-purple-100/80 dark:hover:bg-purple-900/30 disabled:opacity-40 transition-all duration-200"
              title="让 AI 把你的描述加工得更具体"
            >
              {polishLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              <span>AI 智能润色</span>
            </button>
          </div>
          
          <div className="h-px bg-slate-100 dark:bg-slate-800/80"></div>
          
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={onGenerateClick}
              disabled={isLoading || !topic.trim()}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 text-white font-semibold text-sm flex items-center gap-2 hover:opacity-95 shadow-md shadow-brand-500/10 active:scale-[0.98] disabled:opacity-50 transition-all duration-200"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin" size={14} />
                  <span>{stage || '正在处理数据...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>一键生成 5 张同源画卷</span>
                </>
              )}
            </button>
            {result && !isLoading && (
              <button
                onClick={() => onGenerateClick()}
                className="px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs inline-flex items-center gap-1.5 hover:bg-slate-100 transition-all"
              >
                <RefreshCw size={13} />
                <span>重新生成</span>
              </button>
            )}
            {result?.ok && t && !isLoading && (
              <button
                onClick={copyAllContent}
                className="px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs inline-flex items-center gap-1.5 hover:bg-slate-100 transition-all"
              >
                <Copy size={13} />
                <span>复制完整文案</span>
              </button>
            )}
          </div>
        </div>

        {/* 顶部加载状态进度条 */}
        {isLoading && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-brand-500 to-indigo-500 animate-infinite-loading w-1/3 rounded-full"></div>
          </div>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/50 p-3 rounded-2xl flex items-center gap-2 shadow-sm">
          <AlertCircle size={15} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}
      
      {result?.partialSuccess && (
        <div className="text-sm text-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/50 p-3 rounded-2xl flex items-center gap-2 shadow-sm">
          <AlertCircle size={15} className="shrink-0" />
          <span>部分图片生成失败（已生成 {result.successCount}/{result.totalImages} 张）</span>
        </div>
      )}


      {/* 润色预览抽屉 */}
      {polishOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={cancelPolish}>
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-2xl w-full m-4 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold flex items-center gap-1"><Sparkles size={16} className="text-purple-500" /> AI 润色预览</h2>
            <div className="space-y-2 text-sm">
              <div>
                <div className="text-xs text-slate-500 mb-1">原始输入</div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded p-2">{topic}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">润色后</div>
                {polishLoading ? (
                  <div className="bg-slate-50 dark:bg-slate-800 rounded p-2 inline-flex items-center gap-2 text-slate-400">
                    <Loader2 size={14} className="animate-spin" /> 润色中...
                  </div>
                ) : (
                  <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded p-2 leading-relaxed">{polished || '(空)'}</div>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <button onClick={cancelPolish} className="btn-secondary text-sm">取消</button>
              <button onClick={runPolish} disabled={polishLoading} className="btn-secondary text-sm inline-flex items-center gap-1">
                <RefreshCw size={12} /> 再调一版
              </button>
              <button onClick={acceptPolish} disabled={!polished || polishLoading} className="btn-primary text-sm inline-flex items-center gap-1">
                <Check size={12} /> 接受并替换
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 关键问题问答抽屉 */}
      {clarifyOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={() => { /* 不允许点空白关闭，避免误操作 */ }}>
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-3xl w-full m-4 p-4 space-y-3 max-h-[85vh] overflow-y-auto">
            <h2 className="font-semibold flex items-center gap-1">
              <ArrowRight size={16} className="text-blue-500" />
              关键问题（第 {clarifyRound} 轮）
              <span className="text-xs text-slate-500 ml-2">回答后 AI 会按你的偏好生成统一风格的 5 张图</span>
            </h2>
            {clarifyLoading ? (
              <div className="text-sm text-slate-500 inline-flex items-center gap-2 py-8 justify-center w-full">
                <Loader2 size={14} className="animate-spin" /> AI 思考中...
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {clarifyQuestions.map((q) => (
                    <ClarifyQuestionRow
                      key={q.id}
                      question={q}
                      answer={clarifyAnswers[q.id] || ''}
                      onChange={(v) => setClarifyAnswers({ ...clarifyAnswers, [q.id]: v })}
                    />
                  ))}
                </div>
                <div className="flex gap-2 justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button onClick={skipClarify} className="btn-secondary text-sm">跳过直接生成</button>
                  <button
                    onClick={submitClarifyRound}
                    disabled={clarifyQuestions.some(q => !clarifyAnswers[q.id])}
                    className="btn-primary text-sm inline-flex items-center gap-1"
                  >
                    {clarifyRound === 1 ? '继续 →' : '开始生成'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 最近生成 */}
      <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setRecentOpen(o => !o)}
          className="w-full px-5 py-4 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-slate-400" />
            <span className="font-bold text-sm text-slate-700 dark:text-slate-300">最近生成历史（{recent.length}）</span>
            {recentLoading && <Loader2 size={12} className="animate-spin text-slate-400" />}
          </div>
          {recentOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </button>
        {recentOpen && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-800">
            {recent.length === 0 ? (
              <div className="text-xs text-slate-400 text-center py-6">还没有生成过笔记内容</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {recent.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => loadOldOne(item)}
                    className="text-left border border-slate-200/80 dark:border-slate-800 rounded-xl p-3 hover:border-brand-500/50 hover:bg-slate-50/50 dark:hover:bg-slate-850/50 transition-all flex gap-3 items-center group"
                  >
                    {item.images[0]?.ok && item.images[0]?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.images[0].url} alt="" className="w-12 h-12 object-cover rounded-lg flex-shrink-0 group-hover:scale-105 transition-transform duration-250" />
                    ) : (
                      <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] text-slate-400 font-bold">无图</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-250 truncate group-hover:text-brand-600 transition-colors">{item.title || item.topic || '(无标题)'}</div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1.5">
                        <span>{new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false })}</span>
                        <span>•</span>
                        <span>{item.images.filter(i => i.ok).length} 张图</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 结果区 */}
      {result?.ok && t?.pages && (
        <>
          <div className="rounded-2xl border border-slate-200/60 dark:border-slate-855 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <span>🎨 5 张图画组合</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 font-bold">已生成</span>
              </h2>
              {result.timing && (
                <span className="text-xs text-slate-450 dark:text-slate-500">
                  耗时：文案 {(result.timing.llmMs / 1000).toFixed(1)}s · 图画 {(result.timing.imgPipelineMs / 1000).toFixed(1)}s
                  {result.pipeline && ` (${result.pipeline})`}
                </span>
              )}
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {t.pages.map((p, i) => (
                  <div
                    key={i}
                    className="space-y-2 cursor-pointer group"
                    onClick={() => p.imageUrl && setActiveImageIdx(i)}
                  >
                    <div className="aspect-[3/4] bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden relative shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt={`第 ${i + 1} 张`} className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 p-2">
                          <div className="text-center"><ImageOff size={20} className="mx-auto mb-1.5 text-slate-350" /><span className="text-[10px]">{p.imageError || '生成失败'}</span></div>
                        </div>
                      )}
                      <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold flex items-center justify-center">{i + 1}</div>
                      {p.mode && <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm text-white text-[9px] font-medium tracking-wider uppercase">{p.mode}</div>}
                    </div>
                    <div className="px-1 space-y-0.5">
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-300 leading-snug truncate group-hover:text-brand-600 transition-colors">{pageFns[i]}</div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate" title={p.pageTitle}>{p.pageTitle || '暂无大字文案'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card">
              <div className="card-header"><h2 className="font-semibold">📝 文案</h2></div>
              <div className="card-body space-y-3 text-sm">
                {t.titles && t.titles.length > 0 && (
                  <div>
                    <div className="text-xs text-slate-500 mb-1">标题候选（5 个）</div>
                    <ul className="space-y-1">
                      {t.titles.map((s, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-slate-400 text-xs">{i + 1}.</span>
                          <span className="flex-1">{s}</span>
                          <button onClick={() => copyText(s, `标题 ${i + 1}`)} className="text-slate-400 hover:text-slate-600"><Copy size={12} /></button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {t.title && <div><div className="text-xs text-slate-500 mb-1">商品标题</div><div className="font-medium">{t.title}</div></div>}
                {t.mainSellingPoint && <div className="bg-amber-50 dark:bg-amber-950/30 rounded p-2"><div className="text-xs text-amber-700 dark:text-amber-300 mb-0.5">主推卖点</div><div className="text-sm font-medium">{t.mainSellingPoint}</div></div>}
                {t.body && <div><div className="text-xs text-slate-500 mb-1">正文</div><div className="whitespace-pre-wrap leading-relaxed">{t.body}</div></div>}
                {t.sellingPoints?.length ? (<div><div className="text-xs text-slate-500 mb-1">卖点</div><ul className="list-disc list-inside space-y-1">{t.sellingPoints.map((s, i) => <li key={i}>{s}</li>)}</ul></div>) : null}
                {t.marketingPoints?.length ? (<div><div className="text-xs text-slate-500 mb-1">营销点</div><div className="flex flex-wrap gap-1">{t.marketingPoints.map((s, i) => (<span key={i} className="text-xs px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200">{s}</span>))}</div></div>) : null}
                {t.targetUsers?.length ? (<div><div className="text-xs text-slate-500 mb-1">适合人群</div><div className="flex flex-wrap gap-1">{t.targetUsers.map((s, i) => (<span key={i} className="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30">{s}</span>))}</div></div>) : null}
                {t.tags?.length ? (<div><div className="text-xs text-slate-500 mb-1">话题标签</div><div className="flex flex-wrap gap-1">{t.tags.map((tag, i) => (<span key={i} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">#{tag}</span>))}</div></div>) : null}
                {(t.commentHook || t.dmKeyword) && (<div className="bg-emerald-50 dark:bg-emerald-950/30 rounded p-2 text-xs">{t.commentHook && <div>💬 评论引导：{t.commentHook}</div>}{t.dmKeyword && <div className="mt-1">📨 私信关键词：<span className="font-mono font-medium">{t.dmKeyword}</span></div>}</div>)}
                {t.negotiationReplies?.length ? (<div><div className="text-xs text-slate-500 mb-1">议价话术</div><ol className="list-decimal list-inside space-y-1">{t.negotiationReplies.map((s, i) => <li key={i}>{s}</li>)}</ol></div>) : null}
                {t.styleSummary && <div className="text-xs text-slate-500 italic border-t border-slate-100 dark:border-slate-800 pt-2">🎨 {t.styleSummary}</div>}
              </div>
            </div>

            <div className="space-y-4">
              {t.selfCheck && t.selfCheck.length > 0 && (
                <div className="card">
                  <div className="card-header flex items-center justify-between"><h2 className="font-semibold">✅ 合规自检</h2><span className="text-xs text-slate-500">{passedCount}/{totalCheck} 通过</span></div>
                  <div className="card-body">
                    <ul className="space-y-1.5 text-xs">
                      {t.selfCheck.map((c, i) => (
                        <li key={i} className="flex items-start gap-2">
                          {c.passed ? <Check size={14} className="text-emerald-600 flex-shrink-0 mt-0.5" /> : <X size={14} className="text-red-500 flex-shrink-0 mt-0.5" />}
                          <div className="flex-1"><div>{c.question}</div>{c.note && <div className="text-[10px] text-slate-500">{c.note}</div>}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {activeImageIdx !== null && t.pages?.[activeImageIdx] && (
                <div className="card">
                  <div className="card-header flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button onClick={gotoPrev} className="btn-secondary p-1" title="上一张（←）"><ChevronLeft size={14} /></button>
                      <h2 className="font-semibold">第 {activeImageIdx + 1} / {t.pages.length} 张：{pageFns[activeImageIdx]}</h2>
                      <button onClick={gotoNext} className="btn-secondary p-1" title="下一张（→）"><ChevronRight size={14} /></button>
                    </div>
                    <div className="flex gap-1">
                      {t.pages[activeImageIdx].imageUrl && (
                        <button onClick={() => downloadImage(t.pages![activeImageIdx].imageUrl!, activeImageIdx)} className="btn-secondary text-xs inline-flex items-center gap-1"><Download size={12} /> 下载</button>
                      )}
                      <button onClick={() => setActiveImageIdx(null)} className="btn-secondary text-xs">关闭（Esc）</button>
                    </div>
                  </div>
                  <div className="card-body space-y-2 text-xs">
                    {t.pages[activeImageIdx].imageUrl && (
                      <div className="relative group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={t.pages[activeImageIdx].imageUrl} alt="" className="w-full rounded" />
                        <button onClick={gotoPrev} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"><ChevronLeft size={20} /></button>
                        <button onClick={gotoNext} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"><ChevronRight size={20} /></button>
                        <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">{activeImageIdx + 1} / {t.pages.length}</div>
                      </div>
                    )}
                    {t.pages[activeImageIdx].pageTitle && <div><span className="text-slate-500">大字标题：</span>{t.pages[activeImageIdx].pageTitle}</div>}
                    {t.pages[activeImageIdx].mainText && <div><span className="text-slate-500">主文案：</span>{t.pages[activeImageIdx].mainText}</div>}
                    {t.pages[activeImageIdx].subText && <div><span className="text-slate-500">辅助：</span>{t.pages[activeImageIdx].subText}</div>}
                    {t.pages[activeImageIdx].layout && <div><span className="text-slate-500">版式：</span>{t.pages[activeImageIdx].layout}</div>}
                    {t.pages[activeImageIdx].color && <div><span className="text-slate-500">配色：</span>{t.pages[activeImageIdx].color}</div>}
                    {t.pages[activeImageIdx].material && <div><span className="text-slate-500">素材：</span>{t.pages[activeImageIdx].material}</div>}
                    {t.pages[activeImageIdx].mode && <div className="text-slate-500">模式：{t.pages[activeImageIdx].mode}</div>}
                    {t.pages[activeImageIdx].imagePrompt && (
                      <details className="text-slate-500"><summary className="cursor-pointer">生图提示词</summary><div className="mt-1 leading-relaxed bg-slate-50 dark:bg-slate-800 p-2 rounded">{t.pages[activeImageIdx].imagePrompt}</div></details>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ClarifyQuestionRow({
  question, answer, onChange,
}: { question: ClarifyQuestion; answer: string; onChange: (v: string) => void }) {
  const isCustom = question.type === 'choice' && answer && question.options && !question.options.includes(answer);
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium">{question.question}</div>
      {question.type === 'choice' && question.options ? (
        <div className="flex flex-wrap gap-2">
          {question.options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                answer === opt
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'border-slate-300 dark:border-slate-600 hover:border-blue-400'
              }`}
            >
              {opt}
            </button>
          ))}
          {question.allowCustom !== false && (
            <input
              type="text"
              placeholder="自定义..."
              value={isCustom ? answer : ''}
              onChange={(e) => onChange(e.target.value)}
              className="input flex-1 text-xs px-2 py-1 min-w-[120px]"
            />
          )}
        </div>
      ) : (
        <textarea
          value={answer}
          onChange={(e) => onChange(e.target.value)}
          className="input text-sm min-h-[60px]"
          placeholder="自由填写..."
        />
      )}
    </div>
  );
}
