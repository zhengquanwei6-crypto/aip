/**
 * v0.17-C1 · ComfyUIClient — 远程 ComfyUI 实例的薄封装
 *
 * 这台 ComfyUI 跑在腾讯 cloudstudio 的 A10 24GB 上，0.18.1 版，2183 个节点
 * （Flux + Z-Image-Turbo + Qwen-Image + Illustrious + ControlNet + IPAdapter
 * + ImpactPack + KJNodes 全栈）。
 *
 * 客户端职责：
 *   - 封装 6 个核心 endpoint（submit / history / view / upload / object_info / queue）
 *   - WebSocket 进度订阅
 *   - 节点 schema 5 分钟缓存（避免每次都拉 3MB 的 object_info）
 *   - 失败时回详细 error，不抛
 *
 * 配置：
 *   - 默认 baseUrl 在 BASE_URL_DEFAULT
 *   - 用户可在 Setting 表 `COMFYUI_BASE_URL` 覆盖（cloudstudio URL 失效时
 *     不用改代码 / rebuild，直接 /settings 改一下即可）
 *   - 可选 `COMFYUI_AUTH_TOKEN` Bearer header（cloudstudio 当前无 auth）
 *
 * 安全：
 *   - 链接 + token 不写代码，全走 Setting 表
 *   - 内容过滤暂不开（用户明确 v0.17 阶段不过滤 NSFW）
 */
import "server-only";
import WebSocket from "ws";

import { prisma } from "@/lib/db";

const BASE_URL_DEFAULT =
  "https://1876c14363b64cf88315a21f7d6fc383--8188.ap-shanghai2.cloudstudio.club";

const OBJECT_INFO_TTL_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 30_000;

export interface ComfyConfig {
  baseUrl: string;
  authToken?: string;
}

/**
 * 加载 ComfyUI 连接配置。Setting 表覆盖 → 默认值。
 * 缓存 60 秒避免每次请求都查一次 prisma。
 */
let configCache: { value: ComfyConfig; expiresAt: number } | null = null;

export async function getComfyConfig(): Promise<ComfyConfig> {
  const now = Date.now();
  if (configCache && configCache.expiresAt > now) return configCache.value;

  let baseUrl = BASE_URL_DEFAULT;
  let authToken: string | undefined;
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { in: ["COMFYUI_BASE_URL", "COMFYUI_AUTH_TOKEN"] } },
    });
    for (const r of rows) {
      if (r.key === "COMFYUI_BASE_URL" && r.value?.trim()) {
        baseUrl = r.value.trim().replace(/\/$/, "");
      } else if (r.key === "COMFYUI_AUTH_TOKEN" && r.value?.trim()) {
        authToken = r.value.trim();
      }
    }
  } catch {
    /* fall through to defaults */
  }
  const value: ComfyConfig = { baseUrl, authToken };
  configCache = { value, expiresAt: now + 60_000 };
  return value;
}

/** 让外部（比如更新 Setting 时）主动作废 config 缓存。 */
export function invalidateComfyConfigCache(): void {
  configCache = null;
}

/** 拼上 Authorization header（如果配了 token）。 */
function authHeaders(cfg: ComfyConfig): Record<string, string> {
  return cfg.authToken ? { Authorization: `Bearer ${cfg.authToken}` } : {};
}

/** AbortController 包装 fetch，统一超时。 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), init.timeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    // **关键**：Next.js 14 把所有 server-side fetch 默认走 Data Cache（force-cache），
    // GET /history/<id> 第一次拿到的"还没完成"会被永久缓存，导致后续再 fetch
    // 都拿到 stale 的空 entry —— 看起来像 result 路由永远 pending 但上游
    // 实际已 success。必须 `cache: 'no-store'` 跳过 Data Cache 才能拿到
    // 上游真实状态。
    return await fetch(url, { cache: "no-store", ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

// ─────────────────────────────────────────────────────────────────────
// system_stats / queue
// ─────────────────────────────────────────────────────────────────────

export interface SystemStats {
  comfyVersion: string;
  pythonVersion: string;
  pytorchVersion: string;
  gpuName: string;
  vramTotalMb: number;
  vramFreeMb: number;
  ramTotalMb: number;
  ramFreeMb: number;
}

export async function getSystemStats(): Promise<SystemStats> {
  const cfg = await getComfyConfig();
  const r = await fetchWithTimeout(`${cfg.baseUrl}/system_stats`, {
    headers: authHeaders(cfg),
  });
  if (!r.ok) throw new Error(`system_stats HTTP ${r.status}`);
  const j = (await r.json()) as {
    system?: {
      comfyui_version?: string;
      python_version?: string;
      pytorch_version?: string;
      ram_total?: number;
      ram_free?: number;
    };
    devices?: Array<{
      name?: string;
      vram_total?: number;
      vram_free?: number;
    }>;
  };
  const dev = j.devices?.[0];
  return {
    comfyVersion: j.system?.comfyui_version ?? "?",
    pythonVersion: j.system?.python_version ?? "?",
    pytorchVersion: j.system?.pytorch_version ?? "?",
    gpuName: dev?.name ?? "?",
    vramTotalMb: Math.round((dev?.vram_total ?? 0) / 1024 / 1024),
    vramFreeMb: Math.round((dev?.vram_free ?? 0) / 1024 / 1024),
    ramTotalMb: Math.round((j.system?.ram_total ?? 0) / 1024 / 1024),
    ramFreeMb: Math.round((j.system?.ram_free ?? 0) / 1024 / 1024),
  };
}

export interface QueueStatus {
  running: number;
  pending: number;
  /** 当前正在跑的 prompt_id（如有），用于 UI 顶部"队列里有谁"提示。 */
  currentPromptId?: string;
}

export async function getQueueStatus(): Promise<QueueStatus> {
  const cfg = await getComfyConfig();
  const r = await fetchWithTimeout(`${cfg.baseUrl}/queue`, {
    headers: authHeaders(cfg),
  });
  if (!r.ok) throw new Error(`queue HTTP ${r.status}`);
  const j = (await r.json()) as {
    queue_running?: unknown[];
    queue_pending?: unknown[];
  };
  const running = j.queue_running ?? [];
  const pending = j.queue_pending ?? [];
  // queue_running 元素结构：[number, prompt_id, prompt, extra_data, outputs_to_execute]
  const current = (running[0] as unknown[] | undefined)?.[1] as string | undefined;
  return {
    running: running.length,
    pending: pending.length,
    currentPromptId: current,
  };
}

// ─────────────────────────────────────────────────────────────────────
// object_info（5 分钟缓存）
// ─────────────────────────────────────────────────────────────────────

/** ComfyUI 节点输入 schema 单条最简形式。详细形式保留 raw 字段以备 LLM 拼装时使用。 */
export interface ObjectInfoNode {
  classType: string;
  category: string;
  description?: string;
  inputs: {
    required: Record<string, unknown>;
    optional: Record<string, unknown>;
  };
  outputs: string[];
  outputNames: string[];
}

let objectInfoCache: { value: Record<string, ObjectInfoNode>; expiresAt: number } | null =
  null;

export async function getObjectInfo(opts?: {
  forceRefresh?: boolean;
}): Promise<Record<string, ObjectInfoNode>> {
  const now = Date.now();
  if (
    !opts?.forceRefresh &&
    objectInfoCache &&
    objectInfoCache.expiresAt > now
  ) {
    return objectInfoCache.value;
  }
  const cfg = await getComfyConfig();
  const r = await fetchWithTimeout(`${cfg.baseUrl}/object_info`, {
    headers: authHeaders(cfg),
    timeoutMs: 60_000,
  });
  if (!r.ok) throw new Error(`object_info HTTP ${r.status}`);
  const raw = (await r.json()) as Record<
    string,
    {
      input?: { required?: Record<string, unknown>; optional?: Record<string, unknown> };
      output?: string[];
      output_name?: string[];
      category?: string;
      description?: string;
    }
  >;
  const out: Record<string, ObjectInfoNode> = {};
  for (const [classType, meta] of Object.entries(raw)) {
    out[classType] = {
      classType,
      category: meta.category ?? "uncategorized",
      description: meta.description,
      inputs: {
        required: meta.input?.required ?? {},
        optional: meta.input?.optional ?? {},
      },
      outputs: meta.output ?? [],
      outputNames: meta.output_name ?? [],
    };
  }
  objectInfoCache = { value: out, expiresAt: now + OBJECT_INFO_TTL_MS };
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// 提交 / history / view / upload
// ─────────────────────────────────────────────────────────────────────

/** ComfyUI workflow JSON 类型。键是节点 id（数字字符串），值是节点定义。 */
export type WorkflowJson = Record<
  string,
  {
    class_type: string;
    inputs: Record<string, unknown>;
    _meta?: { title?: string };
  }
>;

export interface SubmitResult {
  promptId: string;
  number: number;
  nodeErrors?: Record<string, unknown>;
}

/**
 * 把 workflow JSON 提交进 ComfyUI 队列。返回 prompt_id 以供后续轮询 history
 * 或订阅 WebSocket 进度。
 */
export async function submitWorkflow(
  workflow: WorkflowJson,
  clientId?: string,
): Promise<SubmitResult> {
  const cfg = await getComfyConfig();
  const body = {
    prompt: workflow,
    client_id: clientId ?? `guodong-${Date.now()}`,
  };
  const r = await fetchWithTimeout(`${cfg.baseUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(cfg) },
    body: JSON.stringify(body),
    timeoutMs: 30_000,
  });
  const text = await r.text();
  if (!r.ok) {
    // ComfyUI 422 错误包含 node_errors，直接透传
    throw new Error(`submit HTTP ${r.status}: ${text.slice(0, 600)}`);
  }
  let j: { prompt_id?: string; number?: number; node_errors?: Record<string, unknown> };
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`submit returned non-JSON: ${text.slice(0, 200)}`);
  }
  if (!j.prompt_id) {
    throw new Error(`submit response missing prompt_id: ${text.slice(0, 200)}`);
  }
  return {
    promptId: j.prompt_id,
    number: j.number ?? 0,
    nodeErrors: j.node_errors,
  };
}

export interface HistoryEntry {
  promptId: string;
  status: "success" | "error" | "running" | "unknown";
  /** 输出节点 id → 该节点产生的 image filenames */
  outputs: Record<string, OutputImage[]>;
  rawOutputs: unknown;
}

export interface OutputImage {
  filename: string;
  subfolder: string;
  type: "output" | "input" | "temp";
}

export async function getHistory(promptId: string): Promise<HistoryEntry | null> {
  const cfg = await getComfyConfig();
  // 先试 /history/{id} —— ComfyUI 大多数情况下回 `{ "<id>": {...} }`，
  // 但在某些版本 / 某些 error 状态下可能返回空对象，或偶发返回整个
  // history（key 是其它 prompt id）。所以拿不到时降级查 /history 全量
  // 找一遍，避免假阴性。
  try {
    const r = await fetchWithTimeout(`${cfg.baseUrl}/history/${promptId}`, {
      headers: authHeaders(cfg),
    });
    if (r.ok) {
      const j = (await r.json()) as Record<string, unknown>;
      const entry = j[promptId];
      if (entry) return parseHistoryEntry(promptId, entry);
      // 上游回了但里面没我们要的 id —— 走 fallback
    } else {
      // 非 200 也走 fallback。404 在某些 ComfyUI 版本表示 entry 不存在，
      // 但 200 + 空对象也是同义；统一兜一遍 /history 全量。
      if (r.status >= 500) {
        throw new Error(`history HTTP ${r.status}`);
      }
    }
  } catch (e) {
    // network / timeout error 直接重抛
    if ((e as Error).name === "AbortError") throw e;
    if (process.env.NODE_ENV !== "production") {
      console.warn("[comfy] /history/{id} failed, will try /history fallback:", (e as Error).message);
    }
  }

  // Fallback: 拉整个 /history（默认 ComfyUI 保留最近 ~10 条），从里面找。
  try {
    const r = await fetchWithTimeout(`${cfg.baseUrl}/history`, {
      headers: authHeaders(cfg),
      timeoutMs: 30_000,
    });
    if (!r.ok) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[comfy] /history fallback HTTP", r.status);
      }
      return null;
    }
    const j = (await r.json()) as Record<string, unknown>;
    const entry = j[promptId];
    if (!entry) {
      if (process.env.NODE_ENV !== "production") {
        const ids = Object.keys(j).slice(0, 5);
        console.warn(`[comfy] prompt ${promptId} not in history list (recent: ${ids.join(",")})`);
      }
      return null;
    }
    return parseHistoryEntry(promptId, entry);
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[comfy] /history fallback error:", (e as Error).message);
    }
    return null;
  }
}

function parseHistoryEntry(promptId: string, raw: unknown): HistoryEntry {
  const entry = raw as {
    status?: { status_str?: string; completed?: boolean };
    outputs?: Record<string, { images?: OutputImage[] }>;
  };

  const status =
    entry.status?.status_str === "success"
      ? "success"
      : entry.status?.status_str === "error"
      ? "error"
      : entry.status?.completed
      ? "success"
      : "running";

  const outputs: Record<string, OutputImage[]> = {};
  for (const [nodeId, nodeOut] of Object.entries(entry.outputs ?? {})) {
    if (Array.isArray(nodeOut.images)) outputs[nodeId] = nodeOut.images;
  }
  return {
    promptId,
    status,
    outputs,
    rawOutputs: entry.outputs,
  };
}

/**
 * 拉单张输出图（PNG/WebP/etc.）的字节流。caller 决定是否落盘 / 写 prisma /
 * 推到 R2。这里只负责传输。
 */
export async function viewImage(
  filename: string,
  subfolder = "",
  type: "output" | "input" | "temp" = "output",
): Promise<{ buffer: Buffer; contentType: string }> {
  const cfg = await getComfyConfig();
  const params = new URLSearchParams({ filename, subfolder, type });
  const r = await fetchWithTimeout(`${cfg.baseUrl}/view?${params.toString()}`, {
    headers: authHeaders(cfg),
    timeoutMs: 60_000,
  });
  if (!r.ok) throw new Error(`view HTTP ${r.status}`);
  const arrayBuf = await r.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuf),
    contentType: r.headers.get("content-type") ?? "application/octet-stream",
  };
}

/**
 * 上传输入图（i2i / inpaint / controlnet / ipadapter 都需要）。返回的
 * `name` 是 ComfyUI 端的相对文件名，可以填到 LoadImage 节点的 image 字段。
 */
export async function uploadImage(
  buffer: Buffer,
  filename: string,
  opts?: { subfolder?: string; overwrite?: boolean },
): Promise<{ name: string; subfolder: string; type: string }> {
  const cfg = await getComfyConfig();
  const form = new FormData();
  // Node 18+ 原生 Blob — 不依赖 form-data 包。把 Buffer 包成 Uint8Array
  // 避免 TypeScript Buffer<ArrayBufferLike> 与 BlobPart 的兼容性问题。
  const part = new Uint8Array(buffer);
  form.append(
    "image",
    new Blob([part], { type: "application/octet-stream" }),
    filename,
  );
  form.append("type", "input");
  if (opts?.subfolder) form.append("subfolder", opts.subfolder);
  if (opts?.overwrite) form.append("overwrite", "true");

  const r = await fetchWithTimeout(`${cfg.baseUrl}/upload/image`, {
    method: "POST",
    headers: authHeaders(cfg),
    body: form,
    timeoutMs: 60_000,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`upload HTTP ${r.status}: ${t.slice(0, 300)}`);
  }
  return (await r.json()) as { name: string; subfolder: string; type: string };
}

// ─────────────────────────────────────────────────────────────────────
// WebSocket 进度订阅
// ─────────────────────────────────────────────────────────────────────

/**
 * ComfyUI WebSocket 推送的事件类型。我们只关心其中几条：
 *   - `status`     · 队列变化
 *   - `executing`  · 当前在跑哪个节点；node === null 表示整个 workflow 完成
 *   - `progress`   · 当前节点的 step / total
 *   - `executed`   · 某节点已完成（含输出图引用）
 *   - `execution_error` · 节点出错
 *
 * 此外 ComfyUI 还会推 binary frame（中间预览图），我们透传给上层。
 */
export type ComfyWsEvent =
  | { type: "status"; data: unknown }
  | { type: "executing"; data: { node: string | null; prompt_id?: string } }
  | { type: "progress"; data: { value: number; max: number; node?: string; prompt_id?: string } }
  | { type: "executed"; data: { node: string; output: unknown; prompt_id?: string } }
  | { type: "execution_error"; data: { node_id: string; node_type: string; exception_message?: string; prompt_id?: string } }
  | { type: "execution_cached"; data: unknown }
  | { type: "execution_start"; data: { prompt_id?: string } }
  | { type: "execution_success"; data: { prompt_id?: string } }
  | { type: "binary_preview"; data: { bytes: Buffer; mime: string } }
  | { type: string; data: unknown };

export interface SubscribeOptions {
  /** 订阅指定 prompt_id 的事件；不填表示所有事件都给。 */
  promptId?: string;
  /** 自动断开 ms。0 = 永久（直到 close()）。 */
  autoCloseMs?: number;
}

export interface SubscribeHandle {
  close(): void;
  /** WebSocket 当前是否打开。 */
  isOpen(): boolean;
}

/**
 * 订阅 ComfyUI 实时事件。返回一个可关闭的 handle。
 *
 * 调用方负责把这些事件 forward 到自己的下游（SSE / 数据库 / 客户端）。
 */
export function subscribeProgress(
  onEvent: (e: ComfyWsEvent) => void,
  opts: SubscribeOptions = {},
): SubscribeHandle {
  let configPromise = getComfyConfig();
  let ws: WebSocket | null = null;
  let closed = false;

  configPromise.then((cfg) => {
    if (closed) return;
    const wsUrl =
      cfg.baseUrl.replace(/^http/, "ws").replace(/\/$/, "") +
      `/ws?clientId=guodong-${opts.promptId ?? "any"}-${Date.now()}`;
    const headers: Record<string, string> = cfg.authToken
      ? { Authorization: `Bearer ${cfg.authToken}` }
      : {};
    ws = new WebSocket(wsUrl, { headers });

    ws.on("message", (raw, isBinary) => {
      if (isBinary) {
        // ComfyUI binary preview frame: 8-byte header + image bytes
        const buf = raw as Buffer;
        if (buf.length < 8) return;
        const eventType = buf.readUInt32BE(0);
        const imageType = buf.readUInt32BE(4);
        const mime =
          imageType === 1 ? "image/jpeg" : imageType === 2 ? "image/png" : "application/octet-stream";
        const bytes = buf.subarray(8);
        if (eventType === 1) {
          onEvent({ type: "binary_preview", data: { bytes, mime } });
        }
        return;
      }
      try {
        const parsed = JSON.parse(raw.toString()) as ComfyWsEvent;
        if (
          opts.promptId &&
          parsed.type !== "status" &&
          (parsed.data as { prompt_id?: string })?.prompt_id &&
          (parsed.data as { prompt_id?: string }).prompt_id !== opts.promptId
        ) {
          // 其它 prompt 的事件，不转发
          return;
        }
        onEvent(parsed);
      } catch {
        /* skip non-JSON text frames */
      }
    });

    ws.on("error", () => {
      /* swallow — caller saw closed */
    });
  });

  if (opts.autoCloseMs && opts.autoCloseMs > 0) {
    setTimeout(() => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    }, opts.autoCloseMs);
  }

  return {
    close() {
      closed = true;
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    },
    isOpen() {
      return Boolean(ws && ws.readyState === WebSocket.OPEN);
    },
  };
}

/**
 * 等到一个 prompt 跑完（success / error），返回最终 history entry。
 * 内部用 WebSocket 推送做 fast-path，再在 `execution_success` 时 fetch
 * `/history/{prompt_id}` 拿完整输出。
 *
 * 给批处理 / 服务端等"我要图"的路径用，浏览器侧的进度推送走 SSE。
 */
export async function waitForCompletion(
  promptId: string,
  opts: { timeoutMs?: number } = {},
): Promise<HistoryEntry> {
  const timeoutMs = opts.timeoutMs ?? 5 * 60_000;
  return new Promise<HistoryEntry>((resolve, reject) => {
    const t = setTimeout(() => {
      sub.close();
      reject(new Error(`waitForCompletion timeout after ${timeoutMs}ms (prompt ${promptId})`));
    }, timeoutMs);

    const sub = subscribeProgress(
      async (e) => {
        if (e.type === "execution_success") {
          if ((e.data as { prompt_id?: string }).prompt_id === promptId) {
            clearTimeout(t);
            sub.close();
            try {
              const h = await getHistory(promptId);
              if (!h) {
                reject(new Error(`history not found for ${promptId}`));
                return;
              }
              resolve(h);
            } catch (err) {
              reject(err);
            }
          }
        } else if (e.type === "execution_error") {
          if ((e.data as { prompt_id?: string }).prompt_id === promptId) {
            clearTimeout(t);
            sub.close();
            const msg = (e.data as { exception_message?: string }).exception_message;
            reject(new Error(`comfy execution_error: ${msg ?? "unknown"}`));
          }
        }
      },
      { promptId },
    );
  });
}
