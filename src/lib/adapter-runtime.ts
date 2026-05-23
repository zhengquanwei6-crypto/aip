// API 适配器运行时引擎
//
// 三个核心能力：
//   1. 模板插值 — {prompt} {API_KEY} {taskId} {extra.foo} 等
//   2. JSONPath 提取 — "data.foo[0].url" / "data.json>>resultUrls[*]"（双 >> 表示先 JSON.parse 再取）
//   3. 同步/异步执行 — sync 一次返回，async-polling 调度轮询直到 done/fail/timeout
//
// v0.8 Batch 5：trace 增强
//   - pollHistory 每条增加 ts（毫秒）和 ok（boolean）
//   - 顶层 trace 增加 lastError / lastResponseSnippet / durationMs
//   - 失败时 trace 仍会附带（之前已经如此），下游可以透传给前端

import type {
  AdapterConfig,
  AdapterFlow,
  GenerateInput,
  DryRunResult,
} from "./adapter-types";

// ──────────────────────────────────────────────────────────
// 模板插值
// ──────────────────────────────────────────────────────────

export function interpolate(template: unknown, vars: Record<string, unknown>): unknown {
  if (typeof template === "string") {
    return template.replace(/\{([^}]+)\}/g, (m, expr) => {
      const v = readPath(vars, String(expr).trim());
      if (v === undefined || v === null) return m;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
      return JSON.stringify(v);
    });
  }
  if (Array.isArray(template)) {
    return template.map((x) => interpolate(x, vars));
  }
  if (template && typeof template === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(template)) {
      out[k] = interpolate(v, vars);
    }
    return out;
  }
  return template;
}

// ──────────────────────────────────────────────────────────
// JSONPath 提取
// ──────────────────────────────────────────────────────────

export function jsonPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const segments = path.split(">>").map((s) => s.trim());
  let value: unknown = obj;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (i > 0 && typeof value === "string") {
      try { value = JSON.parse(value); } catch { return undefined; }
    }
    value = walk(value, seg);
  }
  return value;
}

function walk(node: unknown, path: string): unknown {
  if (!path) return node;
  const tokens = tokenize(path);
  let cur: unknown = node;
  for (const tok of tokens) {
    if (cur === null || cur === undefined) return undefined;
    if (tok.kind === "key") {
      cur = (cur as any)[tok.name];
    } else if (tok.kind === "index") {
      cur = (cur as any)[tok.idx];
    } else if (tok.kind === "all") {
      if (!Array.isArray(cur)) return undefined;
      const restTokens = tokens.slice(tokens.indexOf(tok) + 1);
      const restPath = tokensToPath(restTokens);
      const arr = cur.map((item) => (restPath ? walk(item, restPath) : item));
      return arr;
    }
  }
  return cur;
}

type Token =
  | { kind: "key"; name: string }
  | { kind: "index"; idx: number }
  | { kind: "all" };

function tokenize(path: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < path.length) {
    if (path[i] === ".") { i++; continue; }
    if (path[i] === "[") {
      const end = path.indexOf("]", i);
      if (end < 0) break;
      const inner = path.slice(i + 1, end).trim();
      if (inner === "*") tokens.push({ kind: "all" });
      else tokens.push({ kind: "index", idx: Number(inner) });
      i = end + 1;
      continue;
    }
    let j = i;
    while (j < path.length && path[j] !== "." && path[j] !== "[") j++;
    if (j > i) tokens.push({ kind: "key", name: path.slice(i, j) });
    i = j;
  }
  return tokens;
}

function tokensToPath(toks: Token[]): string {
  return toks.map((t) => {
    if (t.kind === "key") return "." + t.name;
    if (t.kind === "index") return `[${t.idx}]`;
    return "[*]";
  }).join("").replace(/^\./, "");
}

function readPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as any)[k];
  }, obj);
}

// ──────────────────────────────────────────────────────────
// 主执行函数
// ──────────────────────────────────────────────────────────

interface RunOptions {
  apiKey: string;
  abortSignal?: AbortSignal;
  /** dry-run 时把请求/响应都收集到 trace 里 */
  collectTrace?: boolean;
}

/**
 * trace 内部用对象（运行时持有）。
 * 之所以单独定义而不直接用 DryRunResult["trace"]，是为了能塞 lastError / lastResponseSnippet
 * 这种 schema 没声明的字段（schema 是 nullish + 宽松的）。返回给上层时仍按原 schema 形状返回。
 */
interface TraceCtx {
  submitRequest?: { url: string; headers: Record<string, string>; body?: string };
  submitResponse?: unknown;
  pollHistory: { at: string; ts: number; status?: string; ok: boolean; raw?: unknown }[];
  lastError?: string;
  lastResponseSnippet?: string;
}

function emptyTraceCtx(): TraceCtx { return { pollHistory: [] }; }

function snippet(v: unknown, max = 800): string {
  try {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return s.length > max ? s.slice(0, max) + "...(truncated)" : s;
  } catch {
    return String(v).slice(0, max);
  }
}

export async function runAdapter(
  adapter: AdapterConfig,
  input: GenerateInput,
  opts: RunOptions,
): Promise<DryRunResult> {
  const t0 = Date.now();
  const trace: TraceCtx | undefined = opts.collectTrace ? emptyTraceCtx() : undefined;
  const vars: Record<string, unknown> = {
    API_KEY: opts.apiKey,
    prompt: input.prompt,
    size: input.size ?? "1024x1024",
    n: input.n ?? 1,
    quality: input.quality ?? "standard",
    imageUrl: input.imageUrl ?? "",
    extra: input.extra ?? {},
  };

  try {
    if (adapter.flow.type === "sync") {
      const urls = await runSync(adapter, vars, opts, trace);
      return { ok: true, imageUrls: urls, durationMs: Date.now() - t0, trace: trace as any };
    } else {
      const urls = await runAsyncPolling(adapter, vars, opts, trace);
      return { ok: true, imageUrls: urls, durationMs: Date.now() - t0, trace: trace as any };
    }
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if (trace) trace.lastError = msg;
    return {
      ok: false,
      imageUrls: [],
      durationMs: Date.now() - t0,
      error: msg,
      trace: trace as any,
    };
  }
}

// ──────────────────────────────────────────────────────────
// sync 执行
// ──────────────────────────────────────────────────────────


// BUG-1 retry: gateway blips (e.g. 503 "channel unavailable" from upstream
// proxies like 4router) are common and usually clear within a few seconds.
// Retry on:
//   - 5xx HTTP status
//   - HTTP 200 with body matching gateway-channel-failure patterns
// up to 2 extra times with exponential backoff.
const RETRY_BODY_PATTERNS = [
  /get_channel_failed/i,
  /channel.*not.*available/i,
  /channel.*unavailable/i,
  /no.*available.*channel/i,
  /可用渠道不存在/, // 中文：可用渠道不存在
];
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  signal: AbortSignal | undefined,
  trace: TraceCtx | undefined,
): Promise<Response> {
  const MAX_ATTEMPTS = 3;
  let lastResp: Response | undefined;
  let lastBody: string | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const resp = await fetchWithSignal(url, init, signal);
    // Read body once so we can inspect AND return it via clone.
    let bodyText: string | undefined;
    let shouldRetry = false;
    if (!resp.ok && resp.status >= 500) {
      shouldRetry = true;
    } else if (resp.ok) {
      // Peek body to detect upstream gateway errors that come as HTTP 200.
      try {
        bodyText = await resp.clone().text();
        if (bodyText && RETRY_BODY_PATTERNS.some((re) => re.test(bodyText!))) {
          shouldRetry = true;
        }
      } catch {
        // ignore body read failures
      }
    }
    if (!shouldRetry) return resp;
    lastResp = resp;
    lastBody = bodyText;
    if (attempt < MAX_ATTEMPTS) {
      const backoffMs = 2000 * attempt; // 2s, 4s
      if (trace) {
        const reason = resp.status >= 500
          ? `HTTP ${resp.status}`
          : `gateway error in body: ${(bodyText || "").slice(0, 120)}`;
        trace.lastError = `attempt ${attempt}/${MAX_ATTEMPTS} ${reason}, retrying in ${backoffMs}ms`;
      }
      try {
        await new Promise<void>((res, rej) => {
          const t = setTimeout(res, backoffMs);
          if (signal) {
            signal.addEventListener("abort", () => { clearTimeout(t); rej(new Error("aborted")); }, { once: true });
          }
        });
      } catch {
        return lastResp;
      }
    }
  }
  return lastResp!;
}

async function runSync(
  adapter: AdapterConfig,
  vars: Record<string, unknown>,
  opts: RunOptions,
  trace?: TraceCtx,
): Promise<string[]> {
  if (adapter.flow.type !== "sync") throw new Error("not sync");
  const flow = adapter.flow;
  const { url, headers, body } = buildRequest(adapter, flow.endpoint, flow.request, vars);
  if (trace) trace.submitRequest = { url, headers: redactHeaders(headers), body };

  const resp = await fetchWithRetry(url, {
    method: flow.endpoint.method,
    headers,
    body,
  }, opts.abortSignal, trace);
  const json = await resp.json();
  if (trace) {
    trace.submitResponse = json;
    trace.lastResponseSnippet = snippet(json);
  }

  if (!resp.ok) {
    const errMsg = flow.response.errorPath
      ? String(jsonPath(json, flow.response.errorPath) ?? "request failed")
      : `HTTP ${resp.status}`;
    if (trace) trace.lastError = errMsg;
    throw new Error(errMsg);
  }
  const extracted = jsonPath(json, flow.response.imageUrlPath);
  const urls = normalizeUrls(extracted);
  if (urls.length === 0) {
    const m = `imageUrlPath "${flow.response.imageUrlPath}" 未取到任何 URL`;
    if (trace) trace.lastError = m;
    throw new Error(m);
  }
  return urls;
}

// ──────────────────────────────────────────────────────────
// async-polling 执行
// ──────────────────────────────────────────────────────────

async function runAsyncPolling(
  adapter: AdapterConfig,
  vars: Record<string, unknown>,
  opts: RunOptions,
  trace?: TraceCtx,
): Promise<string[]> {
  if (adapter.flow.type !== "async-polling") throw new Error("not async-polling");
  const flow = adapter.flow;

  // 1. 提交
  const sub = buildRequest(adapter, flow.submit.endpoint, flow.submit.request, vars);
  if (trace) trace.submitRequest = { url: sub.url, headers: redactHeaders(sub.headers), body: sub.body };

  const subResp = await fetchWithSignal(sub.url, {
    method: flow.submit.endpoint.method,
    headers: sub.headers,
    body: sub.body,
  }, opts.abortSignal);
  const subJson = await subResp.json();
  if (trace) {
    trace.submitResponse = subJson;
    trace.lastResponseSnippet = snippet(subJson);
  }

  if (!subResp.ok) {
    const errMsg = flow.submit.response.errorPath
      ? String(jsonPath(subJson, flow.submit.response.errorPath) ?? "submit failed")
      : `HTTP ${subResp.status}`;
    if (trace) trace.lastError = errMsg;
    throw new Error(errMsg);
  }

  const taskId = jsonPath(subJson, flow.submit.response.taskIdPath);
  if (!taskId || typeof taskId !== "string") {
    const m = `taskId not found at "${flow.submit.response.taskIdPath}"`;
    if (trace) trace.lastError = m;
    throw new Error(m);
  }

  // 2. 轮询
  const pollVars = { ...vars, taskId };
  const start = Date.now();
  const intervalMs = flow.poll.intervalMs;
  const timeoutMs = flow.poll.timeoutMs;

  while (Date.now() - start < timeoutMs) {
    if (opts.abortSignal?.aborted) throw new Error("aborted");

    const pollReq = buildRequest(
      adapter,
      flow.poll.endpoint,
      { contentType: "application/json" },
      pollVars,
    );
    const pollResp = await fetchWithSignal(pollReq.url, {
      method: flow.poll.endpoint.method,
      headers: pollReq.headers,
    }, opts.abortSignal);
    const pollJson = await pollResp.json();

    const status = String(jsonPath(pollJson, flow.poll.statusPath) ?? "");
    const isFail = flow.poll.failStatuses.includes(status);
    const isDone = flow.poll.doneStatuses.includes(status);
    const okFlag = !isFail; // 既非失败即视为 ok（含 done / pending）

    if (trace) {
      trace.pollHistory.push({
        at: new Date().toISOString(),
        ts: Date.now(),
        status,
        ok: okFlag,
        raw: pollJson,
      });
      trace.lastResponseSnippet = snippet(pollJson);
    }

    if (isFail) {
      const errMsg = flow.poll.errorPath
        ? String(jsonPath(pollJson, flow.poll.errorPath) ?? "task failed")
        : `task failed (status=${status})`;
      if (trace) trace.lastError = errMsg;
      throw new Error(errMsg);
    }

    if (isDone) {
      const extracted = jsonPath(pollJson, flow.poll.imageUrlPath);
      const urls = normalizeUrls(extracted);
      if (urls.length === 0) {
        const m = `task succeeded but no image urls at "${flow.poll.imageUrlPath}"`;
        if (trace) trace.lastError = m;
        throw new Error(m);
      }
      return urls;
    }

    await sleep(intervalMs, opts.abortSignal);
  }

  const m = `polling timeout after ${timeoutMs}ms`;
  if (trace) trace.lastError = m;
  throw new Error(m);
}

// ──────────────────────────────────────────────────────────
// 工具
// ──────────────────────────────────────────────────────────

function buildRequest(
  adapter: AdapterConfig,
  endpoint: { method: string; path: string; queryTemplate?: Record<string, string> | undefined },
  request: { contentType?: string; bodyTemplate?: unknown },
  vars: Record<string, unknown>,
): { url: string; headers: Record<string, string>; body?: string } {
  const interpolatedPath = interpolate(endpoint.path, vars) as string;
  let url = adapter.baseUrl.replace(/\/+$/, "") + (interpolatedPath.startsWith("/") ? "" : "/") + interpolatedPath;

  const qs: string[] = [];
  if (endpoint.queryTemplate) {
    for (const [k, v] of Object.entries(endpoint.queryTemplate)) {
      qs.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(interpolate(v, vars)))}`);
    }
  }

  const headers: Record<string, string> = {};
  if (adapter.auth.type === "bearer") {
    headers[adapter.auth.headerName] = String(interpolate(adapter.auth.valueTemplate, vars));
  } else if (adapter.auth.type === "api-key-header") {
    headers[adapter.auth.headerName] = String(interpolate(adapter.auth.valueTemplate, vars));
  } else if (adapter.auth.type === "query-param") {
    qs.push(`${encodeURIComponent(adapter.auth.paramName)}=${encodeURIComponent(String(vars.API_KEY ?? ""))}`);
  }

  if (qs.length > 0) {
    url += (url.includes("?") ? "&" : "?") + qs.join("&");
  }

  let body: string | undefined;
  if (endpoint.method !== "GET" && endpoint.method !== "DELETE" && request.bodyTemplate !== undefined) {
    const ct = request.contentType ?? "application/json";
    headers["Content-Type"] = ct;
    if (ct.includes("json")) {
      body = JSON.stringify(interpolate(request.bodyTemplate, vars));
    } else {
      body = String(interpolate(request.bodyTemplate, vars));
    }
  }
  headers["Accept"] = "application/json";

  return { url, headers, body };
}

function normalizeUrls(extracted: unknown): string[] {
  if (typeof extracted === "string") return [extracted];
  if (Array.isArray(extracted)) {
    return extracted.flat(2).filter((x): x is string => typeof x === "string" && x.length > 0);
  }
  return [];
}

/**
 * 脱敏 headers：任何包含 auth/key/token 的 header value 都替换为 ***(len=N)。
 * 同时兜底处理 valueTemplate 嵌入的 sk- 前缀。这是安全约束：trace 不能透传真实 API key。
 */
function redactHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (/auth|key|token/i.test(k)) {
      const len = v.length;
      out[k] = `***(len=${len})`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function fetchWithSignal(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  if (signal) (init as any).signal = signal;
  return await fetch(url, init);
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => res(), ms);
    if (signal) {
      signal.addEventListener("abort", () => { clearTimeout(t); rej(new Error("aborted")); }, { once: true });
    }
  });
}
