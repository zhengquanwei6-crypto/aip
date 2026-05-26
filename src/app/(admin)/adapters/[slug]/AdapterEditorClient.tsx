'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { AdapterConfig, DryRunResult } from '@/lib/adapter-types';
import { toast } from '@/lib/toast';
import ProgressBar from '@/components/ProgressBar';

interface Props {
  initial: AdapterConfig | null;
  slug: string;
}

const EMPTY_TEMPLATE: AdapterConfig = {
  slug: '',
  name: '',
  baseUrl: 'https://api.example.com/v1',
  auth: { type: 'bearer', headerName: 'Authorization', valueTemplate: 'Bearer {API_KEY}' },
  flow: {
    type: 'sync',
    endpoint: { method: 'POST', path: '/images/generations' },
    request: {
      contentType: 'application/json',
      bodyTemplate: { prompt: '{prompt}', size: '{size}', n: '{n}' },
    },
    response: { imageUrlPath: 'data[*].url', errorPath: 'error.message' },
  },
  enabled: true,
};

const CURL_EXAMPLE = `curl -X POST 'https://api.example.com/v1/images/generations' \\
  -H 'Authorization: Bearer sk-xxx' \\
  -H 'Content-Type: application/json' \\
  -d '{"model":"my-model","prompt":"a cat","size":"1024x1024"}'`;

interface ValidationIssue { path: string; message: string; code: string; }
interface SourceInfo { kind: string; bytes: number; source?: string; }
interface AnalyzeError {
  error: string;
  hint?: string;
  validationIssues?: ValidationIssue[];
  rawOutput?: any;
  sources?: SourceInfo[];
}

type DryRunStage = 'idle' | 'submitting' | 'waiting-task-id' | 'polling' | 'done' | 'fail';

export default function AdapterEditorClient({ initial, slug }: Props) {
  const router = useRouter();
  const isNew = slug === 'new';

  const [config, setConfig] = useState<AdapterConfig>(initial ?? EMPTY_TEMPLATE);
  const [jsonText, setJsonText] = useState(JSON.stringify(initial ?? EMPTY_TEMPLATE, null, 2));
  const [jsonErr, setJsonErr] = useState<string | null>(null);

  const [docUrl, setDocUrl] = useState('');
  const [docText, setDocText] = useState('');
  const [nameHint, setNameHint] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeElapsed, setAnalyzeElapsed] = useState(0);
  const [analyzeSources, setAnalyzeSources] = useState<SourceInfo[] | null>(null);

  const [testApiKey, setTestApiKey] = useState('');
  const [testPrompt, setTestPrompt] = useState('a cute cat sitting on a desk');
  const [testing, setTesting] = useState(false);
  const [testElapsed, setTestElapsed] = useState(0);
  const [testResult, setTestResult] = useState<DryRunResult | null>(null);
  const [testStage, setTestStage] = useState<DryRunStage>('idle');

  const [saving, setSaving] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<AnalyzeError | null>(null);

  // 计时器：分析中
  useEffect(() => {
    if (!analyzing) {
      setAnalyzeElapsed(0);
      return;
    }
    const t = window.setInterval(() => setAnalyzeElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [analyzing]);

  // 计时器：干跑中（同时随时间推进 stage 文字，只是视觉效果）
  const stageRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!testing) {
      setTestElapsed(0);
      if (stageRef.current) {
        clearTimeout(stageRef.current);
        stageRef.current = null;
      }
      return;
    }
    const t = window.setInterval(() => setTestElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [testing]);

  // 加载用户已配置的 IMAGE_API_KEY 作为 testApiKey 默认值
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          const k = j.list.find((row: any) => row.key === 'IMAGE_API_KEY');
          if (k && typeof k.value === 'string' && k.value) {
            setTestApiKey(k.value);
          }
        }
      })
      .catch(() => {});
  }, []);

  function applyJson(text: string) {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      setConfig(parsed);
      setJsonErr(null);
    } catch (e) {
      setJsonErr((e as Error).message);
    }
  }

  function insertCurlExample() {
    setDocText(docText ? docText + '\n\n' + CURL_EXAMPLE : CURL_EXAMPLE);
  }

  async function analyze() {
    if (!docUrl && !docText) {
      toast.error('需要 URL 或文档文本（也可以粘贴 curl 示例）');
      return;
    }
    setAnalyzing(true);
    setAnalyzeError(null);
    setAnalyzeSources(null);
    try {
      const r = await fetch('/api/adapters/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: docUrl || undefined,
          text: docText || undefined,
          nameHint: nameHint || undefined,
        }),
      });
      const j = await r.json();
      if (j.sources) setAnalyzeSources(j.sources);
      if (!j.ok) {
        setAnalyzeError({
          error: j.error || 'LLM 分析失败',
          hint: j.hint,
          validationIssues: j.validationIssues,
          rawOutput: j.rawOutput,
          sources: j.sources,
        });
        if (j.rawOutput && typeof j.rawOutput === 'object') {
          setJsonText(JSON.stringify(j.rawOutput, null, 2));
          setJsonErr('LLM 输出未通过 schema 校验，下方可手动修正后保存');
        }
        toast.error(j.error || 'LLM 分析失败');
        return;
      }
      setConfig(j.adapter);
      setJsonText(JSON.stringify(j.adapter, null, 2));
      setJsonErr(null);
      const sourceMsg =
        j.sources && j.sources.length > 0
          ? ` 抓取来源：${j.sources.map((s: SourceInfo) => `${s.kind}(${s.bytes}字)`).join(' + ')}`
          : '';
      toast.success('LLM 分析完成。' + sourceMsg);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }

  // 估算异步轮询的 maxAttempts
  function estimateMaxAttempts(): number {
    const flow = config?.flow;
    if (flow?.type === 'async-polling') {
      const interval = flow.poll?.intervalMs ?? 4000;
      const timeout = flow.poll?.timeoutMs ?? 600000;
      const m = Math.max(1, Math.floor(timeout / Math.max(interval, 1)));
      return Math.min(m, 200);
    }
    return 30;
  }

  async function dryRun() {
    if (!testApiKey) {
      toast.error('请填写测试用 API key');
      return;
    }
    if (jsonErr && !jsonErr.includes('schema 校验')) {
      toast.error('JSON 不合法，先修一下');
      return;
    }
    setTesting(true);
    setTestResult(null);
    setTestStage('submitting');

    // 视觉阶段推进：3s 后切 waiting-task-id；6s 后切 polling（async-polling 才会停在 polling）
    const t1 = window.setTimeout(() => {
      setTestStage((s) => (s === 'submitting' ? 'waiting-task-id' : s));
    }, 3000);
    const t2 = window.setTimeout(() => {
      setTestStage((s) => (s === 'waiting-task-id' ? 'polling' : s));
    }, 6000);

    try {
      const r = await fetch('/api/adapters/test-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adapter: config,
          apiKey: testApiKey,
          input: { prompt: testPrompt },
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || '测试失败');
      setTestResult(j.result);
      if (j.result?.ok) {
        setTestStage('done');
        toast.success(`干跑通过 · ${j.result.durationMs ?? '–'}ms`);
      } else {
        setTestStage('fail');
        toast.error(`干跑失败：${j.result?.error ?? '未知错误'}`);
      }
    } catch (e) {
      setTestStage('fail');
      toast.error((e as Error).message);
    } finally {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      setTesting(false);
    }
  }

  async function save() {
    if (jsonErr) {
      toast.error('JSON 不合法，无法保存：' + jsonErr);
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(isNew ? '/api/adapters' : `/api/adapters/${slug}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const j = await r.json();
      if (!j.ok) {
        const detail = j.details ? `\n${JSON.stringify(j.details).slice(0, 400)}` : '';
        throw new Error((j.error || '保存失败') + detail);
      }
      toast.success('已保存');
      if (isNew) router.push(`/adapters/${j.adapter.slug}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // 提取 trace 信息
  const pollHistory = (testResult?.trace as any)?.pollHistory as
    | { at: string; ts?: number; status?: string; ok?: boolean }[]
    | undefined;
  const lastError = (testResult?.trace as any)?.lastError as string | undefined;
  const lastSnippet = (testResult?.trace as any)?.lastResponseSnippet as string | undefined;
  const maxAttempts = estimateMaxAttempts();

  // 进度条标签
  let progressLabel = '';
  if (testing) {
    if (testStage === 'submitting') progressLabel = '提交中…';
    else if (testStage === 'waiting-task-id') progressLabel = '等待 taskId…';
    else if (testStage === 'polling') progressLabel = '轮询中…';
    else progressLabel = '处理中…';
  } else if (testStage === 'done') {
    progressLabel = '拿到图片';
  } else if (testStage === 'fail') {
    progressLabel = `失败：${lastError ?? testResult?.error ?? '未知错误'}`;
  }

  // path 提示（错误信息里若包含 "imageUrlPath" / "taskIdPath" / 路径片段就高亮）
  const pathHint = (() => {
    if (!lastError) return null;
    const m = lastError.match(/(?:imageUrlPath|taskIdPath|errorPath|statusPath)[^"]*"([^"]+)"/);
    if (m) return { kind: '字段路径取不到', value: m[1] };
    if (/taskId not found at "(.+?)"/.test(lastError)) {
      return { kind: 'taskId 路径取不到', value: RegExp.$1 };
    }
    if (/no image urls at "(.+?)"/.test(lastError)) {
      return { kind: 'imageUrlPath 取不到', value: RegExp.$1 };
    }
    return null;
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/adapters" className="btn-secondary text-xs px-2 py-1">← 返回列表</Link>
        <h1 className="text-lg font-semibold">{isNew ? '新建 adapter' : `编辑：${config.name || slug}`}</h1>
      </div>

      {analyzeError && (
        <div className="card border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
          <div className="card-body space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 space-y-1">
                <div className="text-sm font-medium text-amber-700 dark:text-amber-300">⚠️ LLM 分析问题</div>
                <div className="text-sm text-amber-700 dark:text-amber-300 break-all">{analyzeError.error}</div>
                {analyzeError.hint && (
                  <div className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">💡 {analyzeError.hint}</div>
                )}
              </div>
              <button onClick={() => setAnalyzeError(null)} className="text-amber-500 hover:text-amber-700 shrink-0">关闭</button>
            </div>
            {analyzeError.sources && analyzeError.sources.length > 0 && (
              <div className="text-[11px] text-amber-700/70 dark:text-amber-400/70">
                LLM 看到的输入：{analyzeError.sources.map((s) => `${s.kind}(${s.bytes}字${s.source ? `, 来自 ${s.source.slice(0, 50)}` : ''})`).join(' · ')}
              </div>
            )}
            {analyzeError.validationIssues && analyzeError.validationIssues.length > 0 && (
              <div className="text-xs space-y-1 bg-white/60 dark:bg-amber-900/30 rounded p-2 border border-amber-200/50">
                <div className="font-medium text-amber-700 dark:text-amber-300">
                  具体校验问题（{analyzeError.validationIssues.length} 处）：
                </div>
                <ul className="list-disc pl-5 text-amber-700 dark:text-amber-300 space-y-0.5">
                  {analyzeError.validationIssues.slice(0, 8).map((i, idx) => (
                    <li key={idx}>
                      <code className="text-[11px] bg-amber-100 dark:bg-amber-900/50 px-1 rounded">
                        {i.path || '(root)'}
                      </code>
                      ：{i.message}
                    </li>
                  ))}
                </ul>
                <div className="text-amber-600 dark:text-amber-400 pt-1">
                  ↓ 下方 JSON 编辑器已填入 LLM 原始输出，可手动修改后保存。
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ① LLM 文档分析 */}
      <div className="card">
        <div className="card-header">
          <div className="font-medium">① 从文档生成（LLM）</div>
          {analyzeSources && (
            <span className="text-[11px] text-slate-500">
              已读取：{analyzeSources.map((s) => `${s.kind}(${s.bytes}字)`).join(' + ')}
            </span>
          )}
        </div>
        <div className="card-body space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              className="input sm:col-span-2"
              placeholder="文档 URL（任何形式都试 — SPA / GitBook / Mintlify 自动 Jina 提取）"
              value={docUrl}
              onChange={(e) => setDocUrl(e.target.value)}
            />
            <input
              className="input"
              placeholder="名称提示（可选）"
              value={nameHint}
              onChange={(e) => setNameHint(e.target.value)}
            />
          </div>

          <div className="relative">
            <textarea
              className="input min-h-[140px] font-mono text-xs"
              placeholder="或粘贴文档内容 / curl 示例 / OpenAPI 片段（自动检测格式）"
              value={docText}
              onChange={(e) => setDocText(e.target.value)}
            />
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={insertCurlExample}
                className="text-[11px] px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                📋 插入 curl 模板
              </button>
              {docText && (
                <button
                  type="button"
                  onClick={() => setDocText('')}
                  className="text-[11px] px-2 py-1 text-slate-500 hover:text-slate-700"
                >
                  清空文档
                </button>
              )}
              <span className="text-[11px] text-slate-500 ml-auto">
                {docText.length} 字
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap pt-1">
            <button onClick={analyze} disabled={analyzing} className="btn-primary text-sm">
              {analyzing ? 'LLM 分析中…' : '🤖 让 LLM 分析'}
            </button>
            <span className="text-xs text-slate-500">使用设置页的 LLM_API_KEY</span>
          </div>
          {analyzing && (
            <ProgressBar
              mode="indeterminate"
              label="正在分析文档…（10–30 秒）"
              elapsed={analyzeElapsed}
            />
          )}

          <div className="text-[11px] text-slate-500 pt-2 leading-relaxed border-t border-slate-100 dark:border-slate-800">
            <div className="font-medium mb-1 text-slate-600 dark:text-slate-400">💡 让分析更准确：</div>
            <ul className="space-y-0.5 list-disc pl-4">
              <li>URL 用<strong>具体接口页</strong>（含 method / path / body），不用文档首页</li>
              <li>SPA 类站点（KIE / OpenAI / Anthropic 文档）会自动尝试 Jina Reader 提取</li>
              <li>最直接：从文档里复制一段 <code>curl -X POST ...</code> 粘到上面文本框</li>
              <li>多个端点 → 一次分析一个，每个保存为一个 adapter</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ② JSON 编辑 */}
      <div className="card">
        <div className="card-header">
          <div className="font-medium">② Adapter 配置（JSON）</div>
          {jsonErr && <span className="badge-yellow text-xs">需手动修正</span>}
        </div>
        <div className="card-body">
          <textarea
            className="input font-mono text-xs min-h-[360px]"
            spellCheck={false}
            value={jsonText}
            onChange={(e) => applyJson(e.target.value)}
          />
          {jsonErr && <div className="mt-2 text-xs text-amber-700 dark:text-amber-400">{jsonErr}</div>}
        </div>
      </div>

      {/* ③ 干跑测试 */}
      <div className="card">
        <div className="card-header">
          <div className="font-medium">③ 干跑测试</div>
        </div>
        <div className="card-body space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              className="input font-mono text-xs"
              placeholder="测试用 API key（留空则按 设置页 → ApiKey 池 顺序自动 fallback）"
              value={testApiKey}
              onChange={(e) => setTestApiKey(e.target.value)}
            />
            <input
              className="input"
              placeholder="测试 prompt（默认: a cute cat sitting on a desk）"
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.target.value)}
            />
          </div>
          <div>
            <button onClick={dryRun} disabled={testing} className="btn-secondary text-sm">
              {testing ? '测试中… (最长 90s)' : '🚀 发送真实请求测试'}
            </button>
          </div>

          {/* 进度条：开始 indeterminate，拿到 pollHistory 后切 determinate */}
          {testing && (!pollHistory || pollHistory.length === 0) && (
            <ProgressBar
              mode="indeterminate"
              label={progressLabel || '干跑测试中…'}
              elapsed={testElapsed}
            />
          )}
          {testing && pollHistory && pollHistory.length > 0 && (
            <ProgressBar
              mode="determinate"
              value={pollHistory.length}
              max={maxAttempts}
              label={`轮询中（${pollHistory.length}/${maxAttempts}）`}
              elapsed={testElapsed}
            />
          )}
          {!testing && pollHistory && pollHistory.length > 0 && (
            <ProgressBar
              mode="determinate"
              value={pollHistory.length}
              max={maxAttempts}
              label={
                testStage === 'fail'
                  ? `失败 · 共轮询 ${pollHistory.length} 次`
                  : `轮询完成 ${pollHistory.length}/${maxAttempts} 次`
              }
            />
          )}

          {/* 失败诊断：高亮 lastError + path 提示 */}
          {!testing && testStage === 'fail' && (lastError || pathHint || lastSnippet) && (
            <div className="rounded border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-800 p-2 space-y-1.5">
              <div className="text-xs font-medium text-rose-700 dark:text-rose-300">
                ✗ 失败诊断
              </div>
              {lastError && (
                <div className="text-xs text-rose-700 dark:text-rose-300 break-all">
                  {lastError}
                </div>
              )}
              {pathHint && (
                <div className="text-[11px] text-rose-600 dark:text-rose-400">
                  {pathHint.kind}：<code className="px-1 rounded bg-rose-100 dark:bg-rose-900/50">{pathHint.value}</code>
                  {' '}（在「② Adapter 配置」里检查 JSONPath）
                </div>
              )}
              {lastSnippet && (
                <details>
                  <summary className="text-[11px] text-rose-500 cursor-pointer">查看最近响应片段</summary>
                  <pre className="mt-1 text-[11px] bg-white/60 dark:bg-rose-950/60 p-2 rounded overflow-auto max-h-40 whitespace-pre-wrap break-all">{lastSnippet}</pre>
                </details>
              )}
            </div>
          )}

          {testResult && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <div className={testResult.ok ? 'badge-green' : 'badge-red'}>
                  {testResult.ok ? `✓ 成功 ${testResult.durationMs ?? ''}ms` : `✗ 失败：${testResult.error ?? ''}`}
                </div>
                {(testResult as { keySource?: string }).keySource && (
                  <span className="text-[11px] text-slate-500">key 来源: {(testResult as { keySource?: string }).keySource}</span>
                )}
              </div>
              {testResult.imageUrls && testResult.imageUrls.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-4 gap-2">
                  {testResult.imageUrls.map((u, i) => (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img key={i} src={u} alt={`result-${i}`}
                      className="w-full aspect-square object-cover rounded border border-slate-200" />
                  ))}
                </div>
              )}

              {/* pollHistory 时间轴卡片 */}
              {pollHistory && pollHistory.length > 0 && (
                <div className="rounded border border-slate-200 dark:border-slate-700 p-2 space-y-1">
                  <div className="text-xs text-slate-500">轮询时间轴（{pollHistory.length}）</div>
                  <ol className="space-y-0.5 max-h-48 overflow-auto">
                    {pollHistory.map((h, i) => {
                      const ok = h.ok !== false;
                      const time = h.at ? new Date(h.at).toLocaleTimeString('zh-CN') : `#${i + 1}`;
                      return (
                        <li
                          key={i}
                          className="flex items-center gap-2 text-[11px] tabular-nums"
                        >
                          <span className={ok ? 'text-emerald-600' : 'text-rose-600'}>
                            {ok ? '✓' : '✗'}
                          </span>
                          <span className="text-slate-400 w-20">{time}</span>
                          <span className="text-slate-700 dark:text-slate-300">
                            status=<code className="px-1 rounded bg-slate-100 dark:bg-slate-800">{h.status || '(空)'}</code>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}

              <details>
                <summary className="text-xs text-slate-500 cursor-pointer">查看 trace（请求 / 响应 / 轮询历史）</summary>
                <pre className="mt-2 text-[11px] bg-slate-50 dark:bg-slate-900 p-2 rounded overflow-auto max-h-96">{JSON.stringify(testResult.trace, null, 2)}</pre>
              </details>
            </div>
          )}
        </div>
      </div>

      {/* ④ 保存 */}
      <div className="flex items-center gap-2 pb-8">
        <button onClick={save} disabled={saving || !!jsonErr} className="btn-primary">
          {saving ? '保存中…' : isNew ? '保存为新 adapter' : '保存修改'}
        </button>
        <span className="text-xs text-slate-500">
          slug: <code className="text-xs">{config.slug || '(未填)'}</code>
        </span>
      </div>
    </div>
  );
}
