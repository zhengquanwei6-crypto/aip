// API 适配器运行时引擎
//
// 三个核心能力：
//   1. 模板插值 — {prompt} {API_KEY} {taskId} {extra.foo} 等
//   2. JSONPath 提取 — "data.foo[0].url" / "data.json>>resultUrls[*]"
//   3. 同步/异步执行 — sync 一次返回，async-polling 调度轮询直到 done/fail/timeout
//
// v0.8 B5：trace 增强（pollHistory ts/ok/lastError/lastResponseSnippet）
// v0.11 B7：image options 注入（size/quality/extra）
// v0.11 B9（图生图 + 比例预设）：
//   - GenerateInput 加 sourceImageUrl / sourceImageBase64 / aspectRatio
//   - vars 同步加 sourceImage / sourceImageBase64 / aspectRatio
//     · sourceImage：URL 或 'data:image/png;base64,xxx' 形式（KIE Flux 用）
//     · sourceImageBase64：裸 base64（OpenAI multipart 用）
//     · aspectRatio：用户选的比例字符串（已合并进 extra.aspectRatio，但顶层也暴露便于 {aspectRatio} 占位）
//   - bodyTemplate 支持 multipart：
//       { __contentType: 'multipart/form-data', fields: [{ name, value, filename?, contentType? }, ...] }
//     当 fields[i].filename 非空时，value 视为 base64（解码后塞入 file part）

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
  collectTrace?: boolean;
}

interface TraceCtx {
  submitRequest?: { url: string; headers: Record<string, string>; body?: string; multipart?: { fieldCount: number; hasFile: boolean } };
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

  // v0.11 B7：把 size/quality 同时塞 vars 顶层 + extra
  // v0.11 B9：把 sourceImageUrl / sourceImageBase64 / aspectRatio 也注入 vars
  const inputExtra = input.extra ?? {};
  const mergedExtra: Record<string, unknown> = { ...inputExtra };
  if (input.size && typeof inputExtra.size === "undefined") mergedExtra.size = input.size;
  if (input.quality && typeof inputExtra.quality === "undefined") mergedExtra.quality = input.quality;
  if (input.aspectRatio && typeof inputExtra.aspectRatio === "undefined") mergedExtra.aspectRatio = input.aspectRatio;

  // sourceImage 顶层占位（KIE Flux 的 bodyTemplate 用 {sourceImage}）
  // 优先级：sourceImageUrl > 'data:image/png;base64,' + sourceImageBase64 > ''
  const sourceImage =
    (input.sourceImageUrl ?? '').trim() ||
    (input.sourceImageBase64 ? `data:image/png;base64,${input.sourceImageBase64}` : '');

  // imageUrls 数组（KIE GPT-2 i2i 的 bodyTemplate 用 {extra.imageUrls}）
  if (typeof inputExtra.imageUrls === "undefined" && (input.sourceImageUrl ?? '').trim()) {
    mergedExtra.imageUrls = [input.sourceImageUrl];
  }
  if (typeof inputExtra.sourceImage === "undefined" && sourceImage) {
    mergedExtra.sourceImage = sourceImage;
  }

  const vars: Record<string, unknown> = {
    API_KEY: opts.apiKey,
    prompt: input.prompt,
    size: input.size ?? "1024x1024",
    n: input.n ?? 1,
    quality: input.quality ?? "standard",
    imageUrl: input.imageUrl ?? "",
    aspectRatio: input.aspectRatio ?? "",
    // v0.11 B9：图生图占位
    sourceImage,
    sourceImageUrl: input.sourceImageUrl ?? '',
    sourceImageBase64: input.sourceImageBase64 ?? '',
    extra: mergedExtra,
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

const RETRY_BODY_PATTERNS = [
  /get_channel_failed/i,
  /channel.*not.*available/i,
  /channel.*unavailable/i,
  /no.*available.*channel/i,
  /可用渠道不存在/,
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
    let bodyText: string | undefined;
    let shouldRetry = false;
    if (!resp.ok && resp.status >= 500) {
      shouldRetry = true;
    } else if (resp.ok) {
      try {
        bodyText = await resp.clone().text();
        if (bodyText && RETRY_BODY_PATTERNS.some((re) => re.test(bodyText!))) {
          shouldRetry = true;
        }
      } catch {}
    }
    if (!shouldRetry) return resp;
    lastResp = resp;
    lastBody = bodyText;
    if (attempt < MAX_ATTEMPTS) {
      const backoffMs = 2000 * attempt;
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
  const built = buildRequest(adapter, flow.endpoint, flow.request, vars);
  if (trace) {
    trace.submitRequest = {
      url: built.url,
      headers: redactHeaders(built.headers),
      ...(built.body !== undefined ? { body: typeof built.body === 'string' ? built.body : '<binary multipart>' } : {}),
      ...(built.multipart ? { multipart: built.multipart } : {}),
    };
  }

  const resp = await fetchWithRetry(built.url, {
    method: flow.endpoint.method,
    headers: built.headers,
    ...(built.body !== undefined ? { body: built.body } : {}),
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

  const sub = buildRequest(adapter, flow.submit.endpoint, flow.submit.request, vars);
  if (trace) {
    trace.submitRequest = {
      url: sub.url,
      headers: redactHeaders(sub.headers),
      ...(sub.body !== undefined ? { body: typeof sub.body === 'string' ? sub.body : '<binary multipart>' } : {}),
      ...(sub.multipart ? { multipart: sub.multipart } : {}),
    };
  }

  const subResp = await fetchWithSignal(sub.url, {
    method: flow.submit.endpoint.method,
    headers: sub.headers,
    ...(sub.body !== undefined ? { body: sub.body } : {}),
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
    const okFlag = !isFail;

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

interface BuiltRequest {
  url: string;
  headers: Record<string, string>;
  /** body 可能是 string（JSON）/ FormData（multipart）/ undefined（GET） */
  body?: string | FormData;
  /** 仅 multipart 路径会填，便于 trace */
  multipart?: { fieldCount: number; hasFile: boolean };
}

function buildRequest(
  adapter: AdapterConfig,
  endpoint: { method: string; path: string; queryTemplate?: Record<string, string> | undefined },
  request: { contentType?: string; bodyTemplate?: unknown },
  vars: Record<string, unknown>,
): BuiltRequest {
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

  let body: string | FormData | undefined;
  let multipartTrace: { fieldCount: number; hasFile: boolean } | undefined;

  if (endpoint.method !== "GET" && endpoint.method !== "DELETE" && request.bodyTemplate !== undefined) {
    const ct = request.contentType ?? "application/json";

    // v0.11 B9：multipart 分支（bodyTemplate.__contentType === 'multipart/form-data'）
    const tmpl = request.bodyTemplate as any;
    if (
      tmpl &&
      typeof tmpl === 'object' &&
      tmpl.__contentType === 'multipart/form-data' &&
      Array.isArray(tmpl.fields)
    ) {
      const form = new FormData();
      let hasFile = false;
      let fieldCount = 0;
      for (const fld of tmpl.fields) {
        if (!fld || typeof fld.name !== 'string') continue;
        const interpolatedValue = String(interpolate(String(fld.value ?? ''), vars));
        if (fld.filename) {
          // 视为 file part：value 是裸 base64
          if (!interpolatedValue) continue; // 缺源图直接跳过（runImageGenerate 已校验过）
          try {
            const bytes = Uint8Array.from(atob(interpolatedValue), (c) => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: fld.contentType || 'image/png' });
            form.append(fld.name, blob, String(fld.filename));
            hasFile = true;
            fieldCount++;
          } catch (e) {
            // base64 解码失败 → 跳过 file part
            // 不抛错，让上游报 missing image
          }
        } else {
          if (interpolatedValue !== '') {
            form.append(fld.name, interpolatedValue);
            fieldCount++;
          }
        }
      }
      body = form;
      multipartTrace = { fieldCount, hasFile };
      // 不写 Content-Type → 让 fetch 自动加 boundary
    } else {
      headers["Content-Type"] = ct;
      if (ct.includes("json")) {
        body = JSON.stringify(interpolate(request.bodyTemplate, vars));
      } else {
        body = String(interpolate(request.bodyTemplate, vars));
      }
    }
  }
  headers["Accept"] = "application/json";

  return {
    url,
    headers,
    ...(body !== undefined ? { body } : {}),
    ...(multipartTrace ? { multipart: multipartTrace } : {}),
  };
}

function normalizeUrls(extracted: unknown): string[] {
  if (typeof extracted === "string") return [extracted];
  if (Array.isArray(extracted)) {
    return extracted.flat(2).filter((x): x is string => typeof x === "string" && x.length > 0);
  }
  return [];
}

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
