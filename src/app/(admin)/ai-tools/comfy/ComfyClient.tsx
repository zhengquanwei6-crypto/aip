'use client';

/**
 * v0.17-C5 · /ai-tools/comfy · ComfyUI 工作流面板
 *
 * 布局：3 个面板 + 顶部状态条
 *
 *   [ ComfyUI 状态条 ]  GPU / VRAM / 队列 / 节点数 / 当前 baseUrl
 *   ┌─────────────────────────┬──────────────────────────────────┐
 *   │ 左：模板选择 + 参数表单   │ 右：实时进度 + 输出图               │
 *   │                          │                                  │
 *   │ - 4 模板 chip 选         │ - 当前节点 / step                 │
 *   │ - 自动生成参数控件       │ - 中间预览图（binary frame）       │
 *   │ - "AI 帮我填" 按钮       │ - 完成时显示成品图                 │
 *   │ - "AI 直接生成工作流"    │                                  │
 *   │   高级模式 (C6)          │                                  │
 *   │ - 提交按钮               │                                  │
 *   └─────────────────────────┴──────────────────────────────────┘
 *
 * 设计原则：
 *   - 一切提交前可预览 vars / workflow JSON
 *   - 失败错误必透传（不藏进 toast）
 *   - 中间预览图实时换，让用户感觉到机器在跑
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  Wand2,
  Sparkles,
  Cpu,
  Zap,
  Image as ImageIcon,
  Upload,
  Eye,
  RefreshCw,
  Clock,
  RotateCw,
} from 'lucide-react';
import { toast } from '@/lib/toast';

interface TemplateVar {
  key: string;
  label: string;
  type: 'string' | 'int' | 'float' | 'enum' | 'longText';
  options?: string[];
  default?: string | number;
  hint: string;
  min?: number;
  max?: number;
}

interface TemplateMeta {
  slug: string;
  label: string;
  category: 'fast' | 'quality' | 'controlnet' | 'postprocess';
  description: string;
  expectedSec: number;
  vars: TemplateVar[];
}

interface StatusResp {
  ok: boolean;
  baseUrl?: string;
  authConfigured?: boolean;
  stats?: {
    comfyVersion: string;
    gpuName: string;
    vramTotalMb: number;
    vramFreeMb: number;
  };
  queue?: { running: number; pending: number; currentPromptId?: string };
  nodeCount?: number;
  installed?: {
    ckpts?: string[];
    unets?: string[];
    loras?: string[];
    controlnets?: string[];
    vaes?: string[];
  };
  error?: string;
}

interface ProgressEvent {
  type: string;
  data: any;
}

const CATEGORY_LABEL: Record<string, string> = {
  fast: '极速',
  quality: '高质量',
  controlnet: '线稿引导',
  postprocess: '后处理',
};

export default function ComfyClient() {
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [activeSlug, setActiveSlug] = useState<string>('z-image-turbo-1step');
  const [vars, setVars] = useState<Record<string, string | number>>({});
  const [userIntent, setUserIntent] = useState('');
  const [llmFilling, setLlmFilling] = useState(false);
  const [llmReason, setLlmReason] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [promptId, setPromptId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    currentNode?: string;
    step?: number;
    totalSteps?: number;
    previewDataUrl?: string;
    history: ProgressEvent[];
  }>({ history: [] });
  const [resultImages, setResultImages] = useState<
    { filename: string; subfolder: string; type: string; nodeId: string }[]
  >([]);
  const [runError, setRunError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollFallbackRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // v0.17-CF3: 防 SSE done / poll fallback / execution_success 三路重复 applyOutputs
  const appliedOutputsRef = useRef<boolean>(false);

  // C6 advanced mode
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeIntent, setComposeIntent] = useState('');
  const [composing, setComposing] = useState(false);
  const [composedWorkflow, setComposedWorkflow] = useState<unknown>(null);
  const [composeExplanation, setComposeExplanation] = useState<string | null>(null);
  const [composeIterations, setComposeIterations] = useState<number>(0);
  const [composeError, setComposeError] = useState<string | null>(null);

  // C8 history
  interface HistoryItem {
    promptId: string;
    templateSlug?: string;
    model?: string;
    vars?: Record<string, unknown>;
    status: 'submitted' | 'running' | 'success' | 'error';
    outputs?: Record<string, Array<{ filename?: string; subfolder?: string; type?: string }>>;
    submittedAt?: string;
    completedAt?: string;
  }
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const r = await fetch('/api/comfyui/history?limit=30', { cache: 'no-store' });
      const j = await r.json();
      if (j.ok && Array.isArray(j.items)) setHistory(j.items);
    } catch {
      /* silent — history is non-critical */
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // 当 promptId 变化（提交了新任务）时刷新一下 history（这样新任务会出现在列表里）
  useEffect(() => {
    if (!promptId) return;
    const t = setTimeout(() => fetchHistory(), 1500);
    return () => clearTimeout(t);
  }, [promptId, fetchHistory]);

  // 用户点 history 里的某条 → 把 vars 填回左边表单
  function reuseHistory(item: HistoryItem) {
    if (item.templateSlug && item.templateSlug !== '(custom)') {
      setActiveSlug(item.templateSlug);
      // 等 activeTemplate 切换完，再填 vars（用 setTimeout 等下个 tick）
      setTimeout(() => {
        if (item.vars) {
          setVars(item.vars as Record<string, string | number>);
        }
      }, 0);
      toast.success(`已恢复 ${item.templateSlug} 的参数`);
    } else {
      toast.error('自定义 workflow 暂不支持一键复用，请展开"高级模式"手贴 JSON');
    }
  }

  // 用户点 history 里某条的成品图 → 直接预览（不重跑）
  function viewHistoryOutputs(item: HistoryItem) {
    setRunError(null);
    setPromptId(item.promptId);
    const flat: typeof resultImages = [];
    for (const [nodeId, list] of Object.entries(item.outputs || {})) {
      for (const img of list) {
        flat.push({
          filename: img.filename || '',
          subfolder: img.subfolder || '',
          type: img.type || 'output',
          nodeId,
        });
      }
    }
    setResultImages(flat); appliedOutputsRef.current = true;
  }

  // ===== 加载状态 + 模板 =====

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const r = await fetch('/api/comfyui/status', { cache: 'no-store' });
      const j = (await r.json()) as StatusResp;
      setStatus(j);
    } catch (e) {
      setStatus({ ok: false, error: (e as Error).message });
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetch('/api/comfyui/templates')
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && Array.isArray(j.templates)) setTemplates(j.templates);
      });
  }, [fetchStatus]);

  // ===== 切模板时填默认值 =====

  const activeTemplate = useMemo(
    () => templates.find((t) => t.slug === activeSlug) || null,
    [templates, activeSlug],
  );

  useEffect(() => {
    if (!activeTemplate) return;
    const next: Record<string, string | number> = {};
    for (const v of activeTemplate.vars) {
      next[v.key] = (v.default ?? '') as string | number;
    }
    setVars(next);
    setLlmReason(null);
  }, [activeTemplate]);

  // ===== AI 帮我填 (C3) =====

  async function llmFill() {
    if (!userIntent.trim() || !activeTemplate) return;
    setLlmFilling(true);
    setLlmReason(null);
    try {
      const r = await fetch('/api/comfyui/llm-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIntent: userIntent.trim(),
          forceTemplateSlug: activeTemplate.slug,
        }),
      });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error || 'LLM 填空失败');
        return;
      }
      setVars(j.vars);
      setLlmReason(j.reason || null);
      toast.success('AI 已填好参数，请检查后提交');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLlmFilling(false);
    }
  }

  // ===== 提交 + SSE 进度 =====

  function disconnectStream() {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (pollFallbackRef.current) {
      clearInterval(pollFallbackRef.current);
      pollFallbackRef.current = null;
    }
  }

  async function submit(opts?: { customWorkflow?: unknown }) {
    setSubmitting(true);
    setProgress({ history: [] });
    setResultImages([]);
    setRunError(null);
    setPromptId(null);
    appliedOutputsRef.current = false; // CF3: 新一轮重置

    try {
      const body = opts?.customWorkflow
        ? { workflow: opts.customWorkflow }
        : { templateSlug: activeSlug, vars };
      const r = await fetch('/api/comfyui/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.ok) {
        // 模型缺失 — 给详细的清单 + 安装指引
        if (Array.isArray(j.missingModels) && j.missingModels.length > 0) {
          const lines = j.missingModels.map(
            (m: { node: string; classType: string; field: string; required: string }) =>
              `  · 节点 #${m.node} (${m.classType}) 字段 ${m.field} 需要：${m.required}`,
          );
          const detailed =
            `${j.error}\n${lines.join("\n")}\n\n${j.hint || ""}`;
          setRunError(detailed);
          toast.error("ComfyUI 缺少必需模型，详见右侧");
          return;
        }
        setRunError(j.error || '提交失败');
        toast.error(j.error || '提交失败');
        return;
      }
      setPromptId(j.promptId);
      // 立刻订阅 SSE
      subscribeToProgress(j.promptId);
      // v0.17-CF4: 提交即并行轮询 (不依赖 SSE onerror)
      startResultPollFallback(j.promptId);
    } catch (e) {
      setRunError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function subscribeToProgress(pid: string) {
    disconnectStream();
    const es = new EventSource(`/api/comfyui/progress/${encodeURIComponent(pid)}`);
    eventSourceRef.current = es;

    // 把 outputs（来自 done 事件或 /result）拍平成图片数组并显示
    const applyOutputs = (outputs: Record<string, any[]> | undefined) => {
      if (appliedOutputsRef.current) return; // CF3: 已应用过, 忽略后续触发
      if (!outputs) return;
      const flat: typeof resultImages = [];
      for (const [nodeId, list] of Object.entries(outputs)) {
        if (Array.isArray(list)) {
          for (const img of list) flat.push({ ...img, nodeId });
        }
      }
      if (flat.length) setResultImages(flat); appliedOutputsRef.current = true;
    };

    const handler = (eventType: string) => (e: MessageEvent) => {
      let data: any = null;
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      setProgress((p) => ({ ...p, history: [...p.history, { type: eventType, data }] }));

      if (eventType === 'executing') {
        setProgress((p) => ({ ...p, currentNode: data?.node ?? undefined }));
      } else if (eventType === 'progress') {
        setProgress((p) => ({
          ...p,
          step: data?.value,
          totalSteps: data?.max,
        }));
      } else if (eventType === 'preview') {
        setProgress((p) => ({ ...p, previewDataUrl: data?.dataUrl }));
      } else if (eventType === 'done') {
        // C9：服务端（WS 或轮询兜底）已确认完成，直接带 outputs。
        if (data?.status === 'error') {
          setRunError(
            data?.exception_message
              ? `节点 ${data?.node_id ?? '?'} (${data?.node_type ?? '?'}) 报错：${data.exception_message}`
              : '生成失败（ComfyUI execution_error）',
          );
          disconnectStream();
          return;
        }
        // success — outputs 直接用；若为空再退回 /result 拉一次
        if (data?.outputs && Object.keys(data.outputs).length > 0) {
          applyOutputs(data.outputs);
          disconnectStream();
        } else {
          fetch(`/api/comfyui/result/${encodeURIComponent(pid)}`, { cache: 'no-store' })
            .then((r) => r.json())
            .then((j) => {
              if (j.ok) applyOutputs(j.outputs);
            })
            .catch((err) => setRunError((err as Error).message))
            .finally(() => disconnectStream());
        }
      } else if (eventType === 'execution_error') {
        // 兼容：done 没来但收到旧式 error
        setRunError(
          `节点 ${data?.node_id ?? '?'} (${data?.node_type ?? '?'}) 报错：${
            data?.exception_message ?? 'unknown'
          }`,
        );
        disconnectStream();
      } else if (eventType === 'execution_success') {
        // 兼容旧前端路径：done 没带 outputs 时回退拉 /result
        fetch(`/api/comfyui/result/${encodeURIComponent(pid)}`, { cache: 'no-store' })
          .then((r) => r.json())
          .then((j) => {
            if (j.ok) applyOutputs(j.outputs);
          })
          .catch((err) => setRunError((err as Error).message))
          .finally(() => disconnectStream());
      }
    };

    [
      'status',
      'executing',
      'progress',
      'executed',
      'preview',
      'execution_start',
      'execution_cached',
      'execution_success',
      'execution_error',
      'done',
    ].forEach((k) => es.addEventListener(k, handler(k)));

    es.onerror = () => {
      // 不要立刻报错 — 完成后服务端会主动 close。
      // 但如果是真的连接挂了，启动前端侧轮询兜底，保证最终能拿到图。
      startResultPollFallback(pid);
    };
  }

  // 前端侧最后一道兜底：若 SSE 整个挂了，直接轮询 /result 直到拿到图。
  function startResultPollFallback(pid: string) {
    // v0.17-CF4: 提交即并行轮询 — 不再仅在 SSE onerror 时启动
    if (pollFallbackRef.current) return;
    let tries = 0;
    const tick = async () => {
      tries += 1;
      if (tries > 200 || appliedOutputsRef.current) {
        if (pollFallbackRef.current) clearInterval(pollFallbackRef.current);
        pollFallbackRef.current = null;
        return;
      }
      try {
        const r = await fetch(`/api/comfyui/result/${encodeURIComponent(pid)}`, { cache: 'no-store' });
        const j = await r.json();
        if (j.ok && j.status === 'success' && j.outputs && Object.keys(j.outputs).length > 0) {
          const flat: typeof resultImages = [];
          for (const [nodeId, list] of Object.entries(j.outputs as Record<string, any[]>)) {
            if (Array.isArray(list)) for (const img of list) flat.push({ ...img, nodeId });
          }
          if (flat.length && !appliedOutputsRef.current) {
            setResultImages(flat); appliedOutputsRef.current = true;
          }
          if (pollFallbackRef.current) clearInterval(pollFallbackRef.current);
          pollFallbackRef.current = null;
          disconnectStream();
        } else if (j.ok && j.status === 'error') {
          setRunError('生成失败（ComfyUI execution_error）');
          if (pollFallbackRef.current) clearInterval(pollFallbackRef.current);
          pollFallbackRef.current = null;
          disconnectStream();
        }
      } catch {
        /* keep trying */
      }
    };
    setTimeout(tick, 1500);
    pollFallbackRef.current = setInterval(tick, 3000);
  }

  useEffect(() => {
    return () => disconnectStream();
  }, []);

  // ===== AI 直接生成工作流 (C6) =====

  async function composeNow() {
    if (!composeIntent.trim()) return;
    setComposing(true);
    setComposedWorkflow(null);
    setComposeExplanation(null);
    setComposeError(null);
    try {
      const r = await fetch('/api/comfyui/llm-compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIntent: composeIntent.trim() }),
      });
      const j = await r.json();
      setComposeIterations(j.iterations || 0);
      if (!j.ok) {
        setComposeError(
          (j.error || 'compose 失败') +
            (j.errorHistory?.length ? '\n\n校验错误：\n' + j.errorHistory.join('\n') : ''),
        );
        return;
      }
      setComposedWorkflow(j.workflow);
      setComposeExplanation(j.explanation || null);
      toast.success(`AI 在 ${j.iterations} 轮内生成了 workflow`);
    } catch (e) {
      setComposeError((e as Error).message);
    } finally {
      setComposing(false);
    }
  }

  function runComposed() {
    if (!composedWorkflow) return;
    submit({ customWorkflow: composedWorkflow });
  }

  // ===== 渲染 =====

  return (
    <div className="max-w-6xl mx-auto p-3 sm:p-4 space-y-4">
      {/* 顶部 · 状态条 */}
      <header className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center gap-2">
          <Cpu size={18} className="text-brand-600 dark:text-brand-400" />
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            ComfyUI · 远程工作流
          </h1>
          <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded border border-brand-300 text-brand-600 dark:text-brand-400">
            v0.17
          </span>
          <button
            onClick={fetchStatus}
            className="ml-auto text-xs inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            disabled={statusLoading}
          >
            <RefreshCw size={12} className={statusLoading ? 'animate-spin' : ''} /> 刷新
          </button>
        </div>
        {statusLoading && !status ? (
          <div className="mt-3 text-xs text-slate-500">连接中...</div>
        ) : !status?.ok ? (
          <div className="mt-3 text-xs text-red-600 dark:text-red-400">
            ✗ {status?.error || '连接失败'}
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <Stat label="ComfyUI" value={status.stats?.comfyVersion ?? '?'} />
            <Stat label="GPU" value={status.stats?.gpuName?.replace(/cudaMallocAsync.*/, '').trim() ?? '?'} />
            <Stat
              label="VRAM"
              value={`${(status.stats?.vramFreeMb ?? 0).toLocaleString()} / ${(status.stats?.vramTotalMb ?? 0).toLocaleString()} MB`}
            />
            <Stat
              label="队列"
              value={`${status.queue?.running ?? 0} 跑 · ${status.queue?.pending ?? 0} 等`}
              accent={
                (status.queue?.running ?? 0) + (status.queue?.pending ?? 0) > 0
              }
            />
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 左 · 模板选择 + 参数表单 */}
        <div className="space-y-4">
          {/* 模板 chip */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-2">
              工作流模板
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {templates.map((t) => (
                <button
                  key={t.slug}
                  onClick={() => setActiveSlug(t.slug)}
                  className={`text-left px-2.5 py-2 rounded-lg border text-xs transition-colors ${
                    activeSlug === t.slug
                      ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
                      : 'border-slate-200 dark:border-slate-700 hover:border-brand-300'
                  }`}
                >
                  <div className="font-semibold flex items-center justify-between">
                    <span>{t.label}</span>
                    <span className="font-mono text-[10px] text-slate-400">
                      ~{t.expectedSec}s
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {CATEGORY_LABEL[t.category] ?? t.category} · {t.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* AI 帮我填 */}
          {activeTemplate && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
              <div className="text-xs text-slate-600 dark:text-slate-400 font-medium flex items-center gap-2">
                <Wand2 size={12} className="text-brand-500" />
                AI 帮我填参数
                <span className="text-[10px] text-slate-400 ml-auto">
                  让 LLM 根据你的需求自动选参数
                </span>
              </div>
              <textarea
                className="input w-full"
                rows={2}
                placeholder="例：莫兰迪色冬日早餐桌，3:4，要质感"
                value={userIntent}
                onChange={(e) => setUserIntent(e.target.value)}
                disabled={llmFilling}
              />
              <button
                onClick={llmFill}
                disabled={llmFilling || !userIntent.trim()}
                className="btn-primary w-full inline-flex items-center justify-center gap-2"
              >
                {llmFilling ? (
                  <>
                    <Loader2 className="animate-spin" size={14} /> AI 思考中...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} /> 让 AI 填这套参数
                  </>
                )}
              </button>
              {llmReason && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed border-l-2 border-brand-300 pl-2">
                  💡 {llmReason}
                </div>
              )}
            </div>
          )}

          {/* 参数表单 */}
          {activeTemplate && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
              <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                参数 · {activeTemplate.label}
              </div>
              {activeTemplate.vars.map((v) => (
                <VarField
                  key={v.key}
                  spec={v}
                  value={vars[v.key]}
                  onChange={(val) =>
                    setVars((s) => ({ ...s, [v.key]: val }))
                  }
                />
              ))}

              <button
                onClick={() => submit()}
                disabled={submitting || !status?.ok}
                className="btn-primary w-full inline-flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" size={14} /> 提交中...
                  </>
                ) : promptId ? (
                  <>
                    <Zap size={14} /> 再跑一次
                  </>
                ) : (
                  <>
                    <Zap size={14} /> 提交 · 预计 {activeTemplate.expectedSec}s
                  </>
                )}
              </button>
            </div>
          )}

          {/* AI 直接生成完整 workflow (C6) */}
          <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/40 dark:bg-purple-900/10 p-4">
            <button
              onClick={() => setComposeOpen((o) => !o)}
              className="text-xs font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-2 w-full"
            >
              <Sparkles size={12} />
              高级模式 · AI 直接生成完整 workflow
              <span className="ml-auto text-[10px] font-normal text-purple-500">
                {composeOpen ? '收起 ▴' : '展开 ▾'}
              </span>
            </button>
            {composeOpen && (
              <div className="mt-3 space-y-2">
                <textarea
                  className="input w-full"
                  rows={3}
                  placeholder="例：先用 Z-Image 出一张 1024x1024，再 Upscale 2x，最后 FaceDetailer 修脸"
                  value={composeIntent}
                  onChange={(e) => setComposeIntent(e.target.value)}
                  disabled={composing}
                />
                <button
                  onClick={composeNow}
                  disabled={composing || !composeIntent.trim()}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-purple-400 bg-purple-600 hover:bg-purple-700 text-white font-semibold inline-flex items-center justify-center gap-2"
                >
                  {composing ? (
                    <>
                      <Loader2 className="animate-spin" size={12} />
                      生成中（含校验自纠回路，最多 3 轮 ~ 1.5 分钟）...
                    </>
                  ) : (
                    <>
                      <Sparkles size={12} /> 让 AI 拼装 workflow
                    </>
                  )}
                </button>
                {composeError && (
                  <div className="text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-2 rounded whitespace-pre-wrap">
                    ✗ {composeError}
                  </div>
                )}
                {composedWorkflow ? (
                  <div className="space-y-2">
                    <div className="text-[11px] text-slate-600 dark:text-slate-300">
                      自纠 {composeIterations} 轮通过 ✓
                    </div>
                    {composeExplanation && (
                      <div className="text-xs text-slate-700 dark:text-slate-200 border-l-2 border-purple-400 pl-2 py-1 leading-relaxed">
                        {composeExplanation}
                      </div>
                    )}
                    <details>
                      <summary className="text-[11px] text-slate-500 cursor-pointer">
                        查看 workflow JSON
                      </summary>
                      <pre className="mt-1 text-[10px] text-slate-700 dark:text-slate-200 font-mono whitespace-pre-wrap break-words bg-slate-50 dark:bg-slate-900 p-2 rounded max-h-60 overflow-auto">
                        {JSON.stringify(composedWorkflow, null, 2)}
                      </pre>
                    </details>
                    <button
                      onClick={runComposed}
                      disabled={submitting}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-purple-400 bg-white hover:bg-purple-50 text-purple-700 font-semibold inline-flex items-center justify-center gap-2"
                    >
                      <Zap size={12} /> 跑这个 workflow
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* 右 · 进度 + 输出 */}
        <div className="space-y-4">
          {!promptId && !runError && (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-xs text-slate-500">
              提交一个工作流后，进度和输出图会显示在这里。
            </div>
          )}

          {runError && (
            <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap">
              ✗ {runError}
            </div>
          )}

          {promptId && !resultImages.length && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
              <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2 flex-wrap">
                <Loader2 className="animate-spin text-brand-500" size={14} />
                <span>
                  prompt_id <span className="font-mono">{promptId.slice(0, 12)}</span>
                </span>
                {progress.currentNode && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">
                    node {progress.currentNode}
                  </span>
                )}
                {progress.totalSteps && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">
                    step {progress.step ?? 0}/{progress.totalSteps}
                  </span>
                )}
              </div>

              {progress.totalSteps && (
                <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
                  <div
                    className="h-full bg-brand-500 transition-all"
                    style={{
                      width: `${Math.min(100, ((progress.step ?? 0) / progress.totalSteps) * 100)}%`,
                    }}
                  />
                </div>
              )}

              {progress.previewDataUrl && (
                <div className="mt-2">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">
                    实时预览（中间步骤）
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={progress.previewDataUrl}
                    alt="comfy preview"
                    className="rounded border border-slate-200 dark:border-slate-700 max-w-full"
                  />
                </div>
              )}
            </div>
          )}

          {resultImages.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
              <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
                <Eye size={12} />
                成品 · {resultImages.length} 张
                <span className="ml-auto font-mono text-[10px] text-slate-400">
                  {promptId?.slice(0, 12)}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {resultImages.map((img, i) => {
                  const url = `/api/comfyui/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${encodeURIComponent(img.type)}`;
                  return (
                    <a key={i} href={url} target="_blank" rel="noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={img.filename}
                        className="w-full rounded border border-slate-200 dark:border-slate-700 hover:border-brand-400 transition-colors"
                      />
                      <div className="mt-1 text-[10px] font-mono text-slate-500 truncate">
                        {img.filename}
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* 装了的模型简短清单 */}
          {status?.installed && (
            <details className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <summary className="text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                这台 ComfyUI 装了什么 · {status.nodeCount?.toLocaleString()} 个 node class
              </summary>
              <div className="mt-3 space-y-2 text-[11px]">
                <InstalledRow label="checkpoints" items={status.installed.ckpts} />
                <InstalledRow label="unets / flux" items={status.installed.unets} />
                <InstalledRow label="vaes" items={status.installed.vaes} />
                <InstalledRow label="loras" items={status.installed.loras} />
                <InstalledRow label="controlnets" items={status.installed.controlnets} />
              </div>
            </details>
          )}

          {/* 历史记录 · 持久化到 DB，刷新页面也在 */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={12} className="text-slate-500" />
              <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                历史任务 · 最近 30 条
              </span>
              <button
                onClick={fetchHistory}
                disabled={historyLoading}
                className="ml-auto text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                title="刷新"
              >
                <RefreshCw size={10} className={historyLoading ? 'animate-spin' : ''} />
                刷新
              </button>
            </div>

            {history.length === 0 ? (
              <div className="text-[11px] text-slate-400 py-3 text-center">
                {historyLoading ? '加载中...' : '还没有历史记录。提交一个工作流后会自动记录。'}
              </div>
            ) : (
              <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                {history.map((h) => (
                  <HistoryRow
                    key={h.promptId}
                    item={h}
                    onReuse={() => reuseHistory(h)}
                    onView={() => viewHistoryOutputs(h)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== 子组件 =====

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] text-slate-400 uppercase tracking-wider">
        {label}
      </div>
      <div
        className={`text-sm font-semibold ${accent ? 'text-brand-600 dark:text-brand-400' : 'text-slate-700 dark:text-slate-200'}`}
      >
        {value}
      </div>
    </div>
  );
}

function VarField({
  spec,
  value,
  onChange,
}: {
  spec: TemplateVar;
  value: string | number | undefined;
  onChange: (v: string | number) => void;
}) {
  return (
    <div>
      <label className="text-xs text-slate-600 dark:text-slate-400 font-medium flex items-center gap-2">
        {spec.label}
        <span className="text-[10px] font-mono text-slate-400">
          {spec.type}
          {spec.min !== undefined && spec.max !== undefined && ` ${spec.min}–${spec.max}`}
        </span>
      </label>
      {spec.type === 'longText' ? (
        <textarea
          className="input mt-1 w-full"
          rows={3}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : spec.type === 'enum' ? (
        <select
          className="input mt-1 w-full"
          value={String(value ?? spec.options?.[0] ?? '')}
          onChange={(e) => onChange(e.target.value)}
        >
          {spec.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="input mt-1 w-full"
          type={spec.type === 'int' || spec.type === 'float' ? 'number' : 'text'}
          step={spec.type === 'float' ? '0.1' : undefined}
          value={String(value ?? '')}
          onChange={(e) => {
            if (spec.type === 'int') {
              const n = Number.parseInt(e.target.value, 10);
              onChange(Number.isFinite(n) ? n : 0);
            } else if (spec.type === 'float') {
              const n = Number.parseFloat(e.target.value);
              onChange(Number.isFinite(n) ? n : 0);
            } else {
              onChange(e.target.value);
            }
          }}
        />
      )}
      <div className="text-[10px] text-slate-400 mt-0.5">{spec.hint}</div>
    </div>
  );
}

function InstalledRow({
  label,
  items,
}: {
  label: string;
  items?: string[];
}) {
  if (!items?.length) return null;
  return (
    <div>
      <span className="text-slate-500 dark:text-slate-400 font-mono">{label}</span>
      <span className="ml-2 font-mono text-slate-700 dark:text-slate-200">
        {items.length} 个
      </span>
      <div className="mt-0.5 ml-1 text-slate-500 dark:text-slate-400 font-mono text-[10px] leading-snug break-all">
        {items.slice(0, 5).join(', ')}
        {items.length > 5 && ` ... (+${items.length - 5})`}
      </div>
    </div>
  );
}

function HistoryRow({
  item,
  onReuse,
  onView,
}: {
  item: {
    promptId: string;
    templateSlug?: string;
    status: 'submitted' | 'running' | 'success' | 'error';
    vars?: Record<string, unknown>;
    outputs?: Record<string, Array<{ filename?: string }>>;
    submittedAt?: string;
  };
  onReuse: () => void;
  onView: () => void;
}) {
  const t =
    item.submittedAt && new Date(item.submittedAt);
  const tLabel =
    t && !isNaN(t.getTime())
      ? t.toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '?';
  const promptText =
    typeof item.vars?.prompt === 'string'
      ? (item.vars.prompt as string).slice(0, 60)
      : '';
  const hasOutputs = Object.values(item.outputs || {}).some((v) => v.length > 0);
  const statusBadge = {
    submitted: { label: '提交中', cls: 'bg-slate-100 dark:bg-slate-800 text-slate-500' },
    running: { label: '运行中', cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
    success: { label: '完成', cls: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' },
    error: { label: '失败', cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
  }[item.status] || { label: '?', cls: 'bg-slate-100' };

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 p-2 text-[11px] flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${statusBadge.cls}`}>
            {statusBadge.label}
          </span>
          <span className="font-mono text-slate-500">{item.templateSlug}</span>
          <span className="text-slate-400 ml-auto">{tLabel}</span>
        </div>
        {promptText && (
          <div className="mt-0.5 text-slate-600 dark:text-slate-300 truncate" title={String(item.vars?.prompt || '')}>
            {promptText}
          </div>
        )}
        <div className="font-mono text-[10px] text-slate-400 truncate">
          {item.promptId.slice(0, 16)}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {hasOutputs && (
          <button
            onClick={onView}
            className="p-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
            title="查看成品"
          >
            <Eye size={11} />
          </button>
        )}
        <button
          onClick={onReuse}
          className="p-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
          title="复用参数"
        >
          <RotateCw size={11} />
        </button>
      </div>
    </div>
  );
}
