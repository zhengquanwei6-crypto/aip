/**
 * 图片生成统一入口
 *
 * 优先级：
 *   1. 用户在 Setting 里选了 IMAGE_DEFAULT_ADAPTER → 走 adapter
 *   2. 否则回退到旧 generateImage（OpenAI 兼容硬编码）
 *
 * v0.8 B5 / v0.9 size 归一化 / v0.11 B1 池 / v0.11 B7 sizes/qualities：见之前注释
 *
 * v0.11 B9（图生图 + 图片比例预设）：
 *   - opts.mode：'t2i'（默认）或 'i2i'
 *   - opts.sourceImageUrl：i2i 源图外链（与 sourceImageBase64 二选一；外链优先）
 *   - opts.sourceImageBase64：i2i 源图 base64（不带 data: 前缀；运行时按需注入 base64 / 解码后塞 multipart）
 *   - opts.aspectRatio：用户从 adapter.aspectRatios 选的比例字符串（"1:1"/"16:9"...）
 *   - resolveAspectRatio：用户没选 → 用 sizes[0] 推算 → 否则用 aspectRatios[0].ratio
 *   - 若 ratio 对应的 sizeRule 非空 → size 自动按 sizeRule 覆盖（用户也可改）
 *   - i2i：若 adapter.supportsImg2Img===false → 拒绝并回退报错（不偷偷降级 t2i）
 *   - i2i 路径：若 adapter.img2imgFlow 存在 → 临时把 adapter.flow 替换为 img2imgFlow 后跑 runAdapter
 *
 * v0.11 B11（i2i 真生图 bug 修复）：
 *   - 当 adapter.img2imgFlow.request.contentType === 'multipart/form-data' 且用户只传了 sourceImageUrl
 *     时，自动 fetch URL → 转 base64 注入 sourceImageBase64，确保 multipart file part 真的塞进字节。
 *     （4router-gpt-image-2 / openai-gpt-img-2 走 multipart，KIE 走 async-polling 用 URL 直接传）
 *   - 同时把 multipart fields 里 n/quality 等数值类字段强制 String() 已在 adapter-runtime 模板插值阶段处理。
 *
 * v0.11 B14（BUG-M26 修：IMAGE ApiKey 池失败染色逻辑漏调）：
 *   - 旧版 adapter 成功路径：
 *       1) runAdapter ok=true 且 result.imageUrls 非空
 *       2) 立刻 markKeySuccess（清 consecutiveErrors=0）
 *       3) 再 persistImages（saveImageFromUrl/Base64）
 *       4) 若 step3 全失败 → 返回 ok:false / "远程图片下载失败" 但 markKeyError 已被遗忘
 *     症状（B13 自检暴露）：IMAGE pool 9 reqs / 6 errors / fail 67%，但 active=true /
 *     lastError=null / consecutiveErrors=0 → 永远不会触发 disable 阈值（默认 3）。
 *   - B14 修：
 *       a) 把 markKeySuccess 推迟到 persistImages 之后，且仅在 savedUrls 非空时才调用。
 *       b) persistImages 失败时（savedUrls.length === 0）→ 走 markKeyError 路径。
 *       c) 不动 disable 阈值（仍 3 次连续）；keys.ts 的 markKeySuccess 也不再清 lastError
 *          （保留历史 audit）。
 *   - legacy 路径不走池（仅当池无 active key 时回 Setting 单 key），无需染色。
 */

import { prisma } from '@/lib/db';
import { generateImage as legacyGenerateImage } from '@/lib/ai/image';
import { runAdapter } from '@/lib/adapter-runtime';
import { ensureI2iFlow } from '@/lib/adapter-defaults';
import {
  adapterConfigSchema,
  adapterKey,
  defaultSizeFromPresets,
  defaultQualityFromPresets,
  defaultAspectRatioFromPresets,
  type AdapterConfig,
  type SizePreset,
  type QualityPreset,
  type AspectRatioPreset,
} from '@/lib/adapter-types';
import { saveImageFromBase64, saveImageFromUrl } from '@/lib/storage';
import { normalizeSizeForAdapter, type NormalizedSize } from '@/lib/image-size';
import {
  getActiveImageKey,
  getImageKeyOrOverride,
  markKeySuccess,
  markKeyError,
  type ActiveKey,
} from '@/lib/ai/keys';

export type ImageMode = 't2i' | 'i2i';

export interface RunOptions {
  prompt: string;
  size?: string;
  /** v0.11 B7 */
  quality?: string;
  n?: number;
  /** 透传给 adapter 的 extra（aspectRatio / resolution / outputFormat 等）*/
  extra?: Record<string, unknown>;
  /** AbortController 信号 */
  abortSignal?: AbortSignal;
  // v0.11 B9 ───────────────────────────────────
  /** 't2i'(默认) 或 'i2i' */
  mode?: ImageMode;
  /** i2i 源图外链（http(s):// or /uploads/...）。优先级高于 sourceImageBase64 */
  sourceImageUrl?: string;
  /** i2i 源图 base64（裸 base64，不含 "data:" 前缀） */
  sourceImageBase64?: string;
  /** 用户从 aspectRatios 池选的 ratio 字符串（"1:1" / "16:9"...） */
  aspectRatio?: string;
  /** v0.18-TRANSPARENT：生成透明底图（仅 gpt-image 系列 JSON-body adapter 支持）。
   *  开启时运行时往请求体注入 background:'transparent' + output_format:'png'。 */
  transparent?: boolean;
  /** v0.12: 主动指定 IMAGE ApiKey id；找不到/disabled 时 fallback 到默认池 */
  imageKeyOverride?: string | null;
}

export interface RunTrace {
  via: 'adapter' | 'legacy';
  adapterSlug?: string;
  baseUrl?: string;
  model?: string;
  lastError?: string;
  lastResponseSnippet?: string;
  pollHistory?: { ts: number; at?: string; status?: string; ok: boolean }[];
  normalizedSize?: { from?: string; to: string; reason?: string };
  keySource?: 'pool' | 'setting' | 'env' | 'none';
  keyLabel?: string;
  size?: string;
  sizeTier?: string;
  sizeFallback?: boolean;
  quality?: string;
  qualityFallback?: boolean;
  // v0.11 B9
  mode?: ImageMode;
  aspectRatio?: string;
  aspectRatioFallback?: boolean;
  i2iSource?: 'url' | 'base64' | 'url+fetched-base64' | 'none';
  i2iFlow?: 't2i' | 'i2i-dedicated';
  /** v0.11 B11：multipart adapter 把 url 转 base64 时的字节大小（便于排查） */
  i2iFetchedBytes?: number;
  /** v0.18-TRANSPARENT：是否请求了透明底 */
  transparent?: boolean;
  /** v0.18-TRANSPARENT：透明底是否被当前 adapter 实际应用（不支持时为 false） */
  transparentApplied?: boolean;
}

export interface RunResult {
  ok: boolean;
  savedUrls: string[];
  remoteUrls?: string[];
  durationMs?: number;
  via: 'adapter' | 'legacy';
  adapterSlug?: string;
  model?: string;
  error?: string;
  trace?: RunTrace;
}

function adapterSummary(slug: string, baseUrl?: string): string {
  return ` [adapter=${slug}, baseUrl=${baseUrl || '(空)'}]`;
}

async function readDefaultAdapterSlug(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: 'IMAGE_DEFAULT_ADAPTER' } });
  const v = row?.value?.trim();
  return v ? v : null;
}

async function loadAdapter(slug: string) {
  const row = await prisma.setting.findUnique({ where: { key: adapterKey(slug) } });
  if (!row) return null;
  try {
    const parsed = adapterConfigSchema.safeParse(JSON.parse(row.value));
    if (!parsed.success) return null;
    if (!parsed.data.enabled) return null;
    // v0.13 B2 fix-B: 自动补 multipart i2i flow（OpenAI 兼容 adapter 没填 img2imgFlow 时）
    return ensureI2iFlow(parsed.data);
  } catch {
    return null;
  }
}

async function pickImageApiKey(overrideId?: string | null): Promise<{
  apiKey: string;
  source: 'pool' | 'setting' | 'env' | 'none';
  activeKey?: ActiveKey;
}> {
  try {
    const k = await getImageKeyOrOverride(overrideId);
    if (k && k.apiKey) {
      return { apiKey: k.apiKey, source: 'pool', activeKey: k };
    }
  } catch {
    /* fallback */
  }
  const cfg = await prisma.setting.findUnique({ where: { key: 'IMAGE_API_KEY' } });
  const v = cfg?.value || '';
  if (v) return { apiKey: v, source: 'setting' };
  const env = process.env.IMAGE_API_KEY || '';
  if (env) return { apiKey: env, source: 'env' };
  return { apiKey: '', source: 'none' };
}

interface PersistOutcome {
  url: string;        // /uploads/xxx
  remote: string;     // 原 remote 来源（用于追溯）
  kind: 'base64' | 'url';
}

interface PersistFailure {
  remote: string;
  kind: 'base64' | 'url' | 'unknown';
  error: string;
}

async function persistImagesDetailed(
  remoteUrls: string[],
): Promise<{ savedUrls: string[]; failures: PersistFailure[] }> {
  const out: string[] = [];
  const failures: PersistFailure[] = [];
  for (const url of remoteUrls) {
    if (typeof url !== 'string' || !url) {
      failures.push({ remote: String(url), kind: 'unknown', error: '空或非字符串项' });
      continue;
    }
    try {
      // v0.13 BUG-M27：base64 容忍换行；data: 前缀可选（cometapi 等返回裸 base64）
      const trimmed = url.trim().replace(/\s+/g, '');

      // 1) data:image/...;base64,XXX 形态
      if (trimmed.startsWith('data:image/')) {
        const m = trimmed.match(/^data:image\/[a-z0-9+\-]+;base64,([A-Za-z0-9+/=]+)$/i);
        if (!m) {
          failures.push({ remote: trimmed.slice(0, 60) + '...', kind: 'base64', error: 'data: URI 无法解析（缺 base64, 部分）' });
          continue;
        }
        const saved = await saveImageFromBase64(m[1]);
        out.push(saved.url);
        continue;
      }

      // 2) http(s)://... 形态
      if (/^https?:\/\//i.test(trimmed)) {
        const saved = await saveImageFromUrl(trimmed);
        out.push(saved.url);
        continue;
      }

      // 3) 裸 base64（cometapi 直接返 b64 不带前缀）：必须满足
      //    - 长度 >= 100（一张最小图也得几百字节）
      //    - 仅含 base64 合法字符
      //    - 解码后字节数 > 0
      if (trimmed.length >= 100 && /^[A-Za-z0-9+/=]+$/.test(trimmed)) {
        const saved = await saveImageFromBase64(trimmed);
        out.push(saved.url);
        continue;
      }

      // 4) 其他：报清楚
      failures.push({
        remote: trimmed.slice(0, 80),
        kind: 'unknown',
        error: `无法识别图片格式（既不是 data: 前缀，也不是 http(s)://，也不像裸 base64; 首 60 字符=${trimmed.slice(0, 60)}）`,
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      const kind: PersistFailure['kind'] = url.startsWith('data:') ? 'base64' : 'url';
      failures.push({ remote: url.slice(0, 80), kind, error: err });
      // 不再吞错；落到 stderr 让运维看见
      console.warn('[image-runner] persistImages failed:', kind, err, 'remote=', url.slice(0, 80));
    }
  }
  return { savedUrls: out, failures };
}

async function persistImages(remoteUrls: string[]): Promise<string[]> {
  const r = await persistImagesDetailed(remoteUrls);
  return r.savedUrls;
}

function extractAdapterTrace(
  rawTrace: any,
  slug: string,
  baseUrl?: string,
): RunTrace {
  const out: RunTrace = { via: 'adapter', adapterSlug: slug, baseUrl };
  if (!rawTrace || typeof rawTrace !== 'object') return out;
  if (typeof rawTrace.lastError === 'string') out.lastError = rawTrace.lastError;
  if (typeof rawTrace.lastResponseSnippet === 'string') {
    out.lastResponseSnippet = rawTrace.lastResponseSnippet;
  }
  if (Array.isArray(rawTrace.pollHistory)) {
    out.pollHistory = rawTrace.pollHistory.map((h: any) => ({
      ts: typeof h?.ts === 'number' ? h.ts : 0,
      at: typeof h?.at === 'string' ? h.at : undefined,
      status: typeof h?.status === 'string' ? h.status : undefined,
      ok: typeof h?.ok === 'boolean' ? h.ok : true,
    }));
  }
  return out;
}

function pickAdapterModelHint(adapter: any): string | undefined {
  const flowJson = JSON.stringify(adapter?.flow ?? {});
  const m = flowJson.match(/"model"\s*:\s*"([^"]+)"/);
  return m?.[1];
}

function resolveSize(
  adapter: AdapterConfig,
  userSize: string | undefined,
): { value: string | undefined; tier: string | undefined; preset?: SizePreset; fallback: boolean } {
  const list = Array.isArray(adapter.sizes) ? adapter.sizes : [];
  if (list.length === 0) {
    return { value: userSize, tier: undefined, fallback: false };
  }
  if (!userSize) {
    const first = defaultSizeFromPresets(adapter);
    return { value: first?.value, tier: first?.tier ?? undefined, preset: first ?? undefined, fallback: false };
  }
  const hit = list.find((s) => s.value === userSize);
  if (hit) {
    return { value: hit.value, tier: hit.tier ?? undefined, preset: hit, fallback: false };
  }
  const first = list[0];
  return { value: first.value, tier: first.tier ?? undefined, preset: first, fallback: true };
}

function resolveQuality(
  adapter: AdapterConfig,
  userQuality: string | undefined,
): { value: string | undefined; preset?: QualityPreset; fallback: boolean } {
  const list = Array.isArray(adapter.qualities) ? adapter.qualities : [];
  if (list.length === 0) {
    return { value: userQuality, fallback: false };
  }
  if (!userQuality) {
    const first = defaultQualityFromPresets(adapter);
    return { value: first?.value, preset: first ?? undefined, fallback: false };
  }
  const hit = list.find((q) => q.value === userQuality);
  if (hit) return { value: hit.value, preset: hit, fallback: false };
  const first = list[0];
  return { value: first.value, preset: first, fallback: true };
}

/**
 * v0.11 B9：把用户传入的 aspectRatio 收敛到 adapter.aspectRatios。
 *   - 若用户没传 → 用 aspectRatios[0]
 *   - 若用户传了但不在池里 → 用 aspectRatios[0]，标记 fallback
 *   - adapter 没有 aspectRatios 数组（旧 row）→ 直接使用用户传值（可能是空）
 */
function resolveAspectRatio(
  adapter: AdapterConfig,
  userAspect: string | undefined,
): { value: string | undefined; preset?: AspectRatioPreset; fallback: boolean } {
  const list = Array.isArray(adapter.aspectRatios) ? adapter.aspectRatios : [];
  if (list.length === 0) {
    return { value: userAspect, fallback: false };
  }
  if (!userAspect) {
    const first = defaultAspectRatioFromPresets(adapter);
    return { value: first?.ratio, preset: first ?? undefined, fallback: false };
  }
  const hit = list.find((a) => a.ratio === userAspect);
  if (hit) return { value: hit.ratio, preset: hit, fallback: false };
  const first = list[0];
  return { value: first.ratio, preset: first, fallback: true };
}

/** 从 "1024x1024" 推 aspect ratio */
function aspectRatioFromValue(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const m = v.match(/^(\d+)\s*x\s*(\d+)$/i);
  if (!m) return undefined;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h) return undefined;
  if (w === h) return '1:1';
  if (w * 4 === h * 3) return '3:4';
  if (h * 4 === w * 3) return '4:3';
  if (w * 16 === h * 9) return '9:16';
  if (h * 16 === w * 9) return '16:9';
  if (w === 1024 && h === 1792) return '9:16';
  if (w === 1792 && h === 1024) return '16:9';
  if (w === 1024 && h === 1536) return '2:3';
  if (w === 1536 && h === 1024) return '3:2';
  if (w === 768 && h === 1024) return '3:4';
  if (w === 720 && h === 1280) return '9:16';
  return `${w}:${h}`;
}

/**
 * v0.11 B9：把 adapter.flow 临时替换为 adapter.img2imgFlow（若存在）。
 *   - 不动原 adapter row（仅运行时构造一个新对象）
 *   - 若 img2imgFlow 缺省 → 沿用 adapter.flow（i2i 与 t2i 同 endpoint，通过 bodyTemplate 占位区分）
 */
function adapterForMode(adapter: AdapterConfig, mode: ImageMode): { adapter: AdapterConfig; i2iFlow: 't2i' | 'i2i-dedicated' } {
  if (mode === 't2i') return { adapter, i2iFlow: 't2i' };
  if (adapter.img2imgFlow) {
    return { adapter: { ...adapter, flow: adapter.img2imgFlow }, i2iFlow: 'i2i-dedicated' };
  }
  return { adapter, i2iFlow: 't2i' };
}

/**
 * v0.11 B11：判断当前 i2i flow 是否走 multipart（4router / openai-gpt-img-2 等）。
 * multipart 路径需要真实字节，单纯 URL 不够。
 */
function flowIsMultipart(flow: { request?: { contentType?: string; bodyTemplate?: any } } | undefined): boolean {
  if (!flow || !flow.request) return false;
  if (flow.request.contentType === 'multipart/form-data') return true;
  const tmpl: any = flow.request.bodyTemplate;
  if (tmpl && typeof tmpl === 'object' && tmpl.__contentType === 'multipart/form-data') return true;
  return false;
}

/**
 * v0.18-TRANSPARENT：透明底注入。
 *
 * gpt-image 系列（OpenAI gpt-image-1 / cometapi gpt-image-2 / 4router 等中转）
 * 的 images API 原生支持 `background:"transparent"` + `output_format:"png"`，
 * 返回带 alpha 通道的透明 PNG。这里在运行时克隆 adapter，往 JSON bodyTemplate
 * 注入这两个字段（不改存储的 adapter 配置）。
 *
 * 适用条件（全满足才注入）：
 *   - flow.type === 'sync'
 *   - request.contentType 是 JSON（非 multipart）
 *   - bodyTemplate 是对象
 *   - 模型名包含 gpt-image / gpt-img（透明底是该系列特性；dalle-3 / flux / KIE
 *     async 不支持，跳过并标记 applied=false）
 *
 * 返回 { adapter, applied }。applied=false 表示当前 adapter 不支持，调用方
 * 据此在 trace 里标注、并可在前端提示用户换支持的 adapter。
 */
function applyTransparentBackground(adapter: AdapterConfig): { adapter: AdapterConfig; applied: boolean } {
  const flow: any = adapter.flow;
  if (!flow || flow.type !== 'sync') return { adapter, applied: false };
  const req = flow.request;
  if (!req || typeof req !== 'object') return { adapter, applied: false };
  // 必须是 JSON body
  const ct = req.contentType ?? 'application/json';
  if (ct !== 'application/json') return { adapter, applied: false };
  const tmpl = req.bodyTemplate;
  if (!tmpl || typeof tmpl !== 'object' || Array.isArray(tmpl)) return { adapter, applied: false };
  // 模型必须是 gpt-image 系列
  const model = String((tmpl as Record<string, unknown>).model ?? '').toLowerCase();
  if (!/gpt-?image|gpt-img/.test(model)) return { adapter, applied: false };

  // 克隆并注入（深拷贝 flow，避免污染缓存的 adapter 对象）
  const newTmpl: Record<string, unknown> = { ...(tmpl as Record<string, unknown>) };
  newTmpl.background = 'transparent';
  newTmpl.output_format = 'png';
  // 透明底必须 PNG，移除可能存在的 jpeg 相关字段
  delete newTmpl.output_compression;
  // 透明底是 gpt-image-1 专属能力：gpt-image-2 会返回
  // "Transparent background is not supported for this model" 500。
  // 故勾选透明底时把模型降到 gpt-image-1（仅当原模型是 gpt-image 系列）。
  if (/gpt-?image-?2/.test(model)) {
    newTmpl.model = 'gpt-image-1';
  }
  const newAdapter: AdapterConfig = {
    ...adapter,
    flow: { ...flow, request: { ...req, bodyTemplate: newTmpl } },
  };
  return { adapter: newAdapter, applied: true };
}

/**
 * v0.11 B11：把 sourceImageUrl 拉成 base64（用于 multipart 文件 part）。
 *   - 支持绝对 URL 与 /uploads/... 相对路径（自动拼 origin）
 *   - 失败时返回 null（caller 决定是否报错）
 *   - 限制 ≤ 5MB（与 API 入口校验一致）
 */
async function fetchUrlToBase64(
  url: string,
  abortSignal?: AbortSignal,
): Promise<{ base64: string; bytes: number } | null> {
  // v0.13 B3.3 fix [fetchUrlToBase64-v013-b33]：
  //   1) /uploads/<file> 或 http(s)://<本机>/uploads/<file> 直接磁盘读
  //   2) 其它远程 URL 走 fetch
  //   3) 上限 5MB → 50MB（cometapi multipart i2i 实测 25MB 也能跑）
  const MAX_BYTES = 50 * 1024 * 1024;

  // 匹配 /uploads/<file>（任意主机）— 提取 file name
  let uploadsName: string | null = null;
  const localMatch = url.match(/\/uploads\/([^?#]+)/);
  if (localMatch) {
    uploadsName = decodeURIComponent(localMatch[1]);
    // 防 path traversal
    if (uploadsName.includes('..') || uploadsName.includes('/') || uploadsName.includes('\\')) {
      return null;
    }
  }

  if (uploadsName) {
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const abs = path.join(process.cwd(), 'public', 'uploads', uploadsName);
      const buf = await fs.readFile(abs);
      if (buf.byteLength === 0) return null;
      if (buf.byteLength > MAX_BYTES) return null;
      return { base64: buf.toString('base64'), bytes: buf.byteLength };
    } catch (e) {
      // 磁盘不存在则 fall-through 到 fetch（极少发生，但保留兜底）
    }
  }

  // 远程 URL fetch 路径
  let target = url;
  if (target.startsWith('/')) {
    const origin = (process.env.NEXT_PUBLIC_BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
    target = origin + target;
  }
  try {
    const init: RequestInit = {};
    if (abortSignal) (init as any).signal = abortSignal;
    const resp = await fetch(target, init);
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return null;
    return { base64: buf.toString('base64'), bytes: buf.byteLength };
  } catch {
    return null;
  }
}

/**
 * v0.11 B9：源图 URL 处理。
 *   - 外链：直接传给 bodyTemplate 的 {sourceImage}（KIE Flux）/ {extra.imageUrls}（KIE GPT-2 i2i）
 *   - /uploads/... 相对路径：拼成完整 URL 给 KIE（KIE 端必须能拉到）→ 这里仅做 hint，由 caller 决定是否拼
 *   - base64：仅 OpenAI /images/edits 多 part 路径会用到，传给 {sourceImageBase64}
 */
function buildI2iVars(opts: RunOptions): {
  source: 'url' | 'base64' | 'none';
  sourceImage: string;
  sourceImageBase64: string;
  imageUrls: string[];
} {
  const url = (opts.sourceImageUrl || '').trim();
  const b64 = (opts.sourceImageBase64 || '').trim();
  if (url) {
    return {
      source: 'url',
      sourceImage: url,
      sourceImageBase64: '',
      imageUrls: [url],
    };
  }
  if (b64) {
    return {
      source: 'base64',
      sourceImage: 'data:image/png;base64,' + b64,
      sourceImageBase64: b64,
      imageUrls: [],
    };
  }
  return { source: 'none', sourceImage: '', sourceImageBase64: '', imageUrls: [] };
}

export async function runImageGenerate(opts: RunOptions): Promise<RunResult> {
  const t0 = Date.now();
  const mode: ImageMode = opts.mode === 'i2i' ? 'i2i' : 't2i';

  // 1) 尝试 adapter 路径
  try {
    const slug = await readDefaultAdapterSlug();
    if (slug) {
      const baseAdapter = await loadAdapter(slug);
      if (baseAdapter) {
        // i2i 校验
        if (mode === 'i2i' && !baseAdapter.supportsImg2Img) {
          return {
            ok: false, savedUrls: [], via: 'adapter', adapterSlug: slug,
            error: `当前 adapter "${slug}" 不支持图生图（supportsImg2Img=false）。请切到 kie-flux-kontext-pro / kie-gpt-image-2 / openai-gpt-img-2 / 4router-gpt-image-2 中任一支持 i2i 的 adapter` + adapterSummary(slug, baseAdapter.baseUrl),
            durationMs: Date.now() - t0,
            trace: { via: 'adapter', adapterSlug: slug, baseUrl: baseAdapter.baseUrl, mode, lastError: '不支持 i2i' },
          };
        }
        if (mode === 'i2i' && !opts.sourceImageUrl?.trim() && !opts.sourceImageBase64?.trim()) {
          return {
            ok: false, savedUrls: [], via: 'adapter', adapterSlug: slug,
            error: 'i2i 模式需提供源图（sourceImageUrl 或 sourceImageBase64）' + adapterSummary(slug, baseAdapter.baseUrl),
            durationMs: Date.now() - t0,
            trace: { via: 'adapter', adapterSlug: slug, baseUrl: baseAdapter.baseUrl, mode, i2iSource: 'none', lastError: 'i2i 缺源图' },
          };
        }

        // 切换 flow（i2i 用 img2imgFlow，缺省时沿用 t2i flow）
        const modeResult = adapterForMode(baseAdapter, mode);
        let adapter = modeResult.adapter;
        const i2iFlow = modeResult.i2iFlow;

        // v0.18-TRANSPARENT：透明底注入（仅 gpt-image 系列 JSON-body sync flow）
        let transparentApplied = false;
        if (opts.transparent) {
          const tr = applyTransparentBackground(adapter);
          adapter = tr.adapter;
          transparentApplied = tr.applied;
        }

        const picked = await pickImageApiKey(opts.imageKeyOverride);
        const apiKey = picked.apiKey;
        if (!apiKey) {
          return {
            ok: false, savedUrls: [], via: 'adapter', adapterSlug: slug,
            error: '未配置 IMAGE API Key，请到设置页（API Keys 池）新增一条 provider=image 的 key' + adapterSummary(slug, adapter.baseUrl),
            durationMs: Date.now() - t0,
            trace: { via: 'adapter', adapterSlug: slug, baseUrl: adapter.baseUrl, lastError: '未配置 IMAGE_API_KEY', keySource: 'none', mode },
          };
        }

        // v0.11 B7：先按 adapter.sizes / qualities 收敛
        const sizeR = resolveSize(adapter, opts.size);
        const qualityR = resolveQuality(adapter, opts.quality);
        // v0.11 B9：再按 aspectRatios 收敛
        const aspectR = resolveAspectRatio(adapter, opts.aspectRatio);

        // 若 ratio.sizeRule 非空 → 用 sizeRule 覆盖 sizeR.value（aspectRatio 优先于 sizes 池里的预设）
        // 但用户在 size 文本框里手动改的值仍能覆盖（resolveSize 在 user 给定时会优先 hit）
        let finalSizeValue = sizeR.value;
        if (!opts.size && aspectR.preset?.sizeRule && aspectR.preset.sizeRule.trim()) {
          finalSizeValue = aspectR.preset.sizeRule.trim();
        }

        // 合并 extra
        const userExtra = opts.extra ?? {};
        const mergedExtra: Record<string, unknown> = { ...userExtra };
        if (sizeR.tier && typeof userExtra.resolution === 'undefined') {
          mergedExtra.resolution = sizeR.tier;
        }
        if (typeof userExtra.aspectRatio === 'undefined') {
          mergedExtra.aspectRatio = aspectR.value || aspectRatioFromValue(finalSizeValue) || '1:1';
        }

        // i2i：注入 sourceImage / imageUrls / sourceImageBase64 到 vars + extra
        const i2iVars = mode === 'i2i' ? buildI2iVars(opts) : { source: 'none' as const, sourceImage: '', sourceImageBase64: '', imageUrls: [] };
        let i2iSourceTrace: NonNullable<RunTrace['i2iSource']> = i2iVars.source;
        let i2iFetchedBytes: number | undefined;

        // v0.11 B11：multipart adapter（4router / openai-gpt-img-2）只接受 file part 字节，不接受 URL；
        //           若用户只给了 URL → 服务器端拉一次转 base64。
        let effSourceImageBase64 = i2iVars.sourceImageBase64;
        if (
          mode === 'i2i' &&
          i2iVars.source === 'url' &&
          flowIsMultipart(adapter.flow as any)
        ) {
          const fetched = await fetchUrlToBase64(i2iVars.sourceImage, opts.abortSignal);
          if (!fetched) {
            // v0.11 B14：i2i 源图拉取失败也是 key/network 故障路径，染色一次
            if (picked.activeKey) {
              await markKeyError(picked.activeKey.id, 'i2i 源图 URL fetch 失败 / 超 5MB');
            }
            return {
              ok: false, savedUrls: [], via: 'adapter', adapterSlug: slug,
              error: `i2i 源图 URL 拉取失败（adapter "${slug}" 走 multipart 必须能读到字节）：${i2iVars.sourceImage}` + adapterSummary(slug, adapter.baseUrl),
              durationMs: Date.now() - t0,
              trace: {
                via: 'adapter', adapterSlug: slug, baseUrl: adapter.baseUrl, mode,
                i2iSource: 'url', i2iFlow,
                lastError: 'i2i 源图 URL fetch 失败 / 超 5MB',
              },
            };
          }
          effSourceImageBase64 = fetched.base64;
          i2iSourceTrace = 'url+fetched-base64';
          i2iFetchedBytes = fetched.bytes;
        }

        if (mode === 'i2i') {
          // 写到 extra 让 runAdapter 注入到 vars.extra
          if (typeof userExtra.imageUrls === 'undefined') {
            mergedExtra.imageUrls = i2iVars.imageUrls;
          }
          if (typeof userExtra.sourceImage === 'undefined') {
            mergedExtra.sourceImage = i2iVars.sourceImage;
          }
        }

        // 上游通常只接受固定尺寸；按 adapter 模型提示归一化
        const adapterModelHint = pickAdapterModelHint(adapter);
        const normalized: NormalizedSize = normalizeSizeForAdapter(finalSizeValue ?? opts.size, adapterModelHint);

        const result = await runAdapter(adapter, {
          prompt: opts.prompt,
          size: normalized.size,
          quality: qualityR.value,
          n: opts.n ?? 1,
          extra: mergedExtra,
          ...(mode === 'i2i' ? {
            sourceImageUrl: i2iVars.source === 'url' ? i2iVars.sourceImage : undefined,
            // v0.11 B11：multipart 时即使用户给 URL 也要传 base64 字节
            ...(effSourceImageBase64 ? { sourceImageBase64: effSourceImageBase64 } : {}),
            aspectRatio: aspectR.value,
          } : {
            aspectRatio: aspectR.value,
          }),
        }, {
          apiKey,
          abortSignal: opts.abortSignal,
          collectTrace: true,
        });

        const trace = extractAdapterTrace(result.trace, slug, adapter.baseUrl);
        if (normalized.rewritten) {
          trace.normalizedSize = { from: normalized.original, to: normalized.size, reason: normalized.reason };
        }
        trace.keySource = picked.source;
        if (picked.activeKey?.label) trace.keyLabel = picked.activeKey.label;
        if (sizeR.value) trace.size = sizeR.value;
        if (sizeR.tier) trace.sizeTier = sizeR.tier;
        if (sizeR.fallback) trace.sizeFallback = true;
        if (qualityR.value) trace.quality = qualityR.value;
        if (qualityR.fallback) trace.qualityFallback = true;
        // v0.11 B9
        trace.mode = mode;
        if (aspectR.value) trace.aspectRatio = aspectR.value;
        if (aspectR.fallback) trace.aspectRatioFallback = true;
        // v0.18-TRANSPARENT
        if (opts.transparent) {
          trace.transparent = true;
          trace.transparentApplied = transparentApplied;
        }
        if (mode === 'i2i') {
          trace.i2iSource = i2iSourceTrace;
          trace.i2iFlow = i2iFlow;
          if (typeof i2iFetchedBytes === 'number') trace.i2iFetchedBytes = i2iFetchedBytes;
        }

        if (!result.ok || result.imageUrls.length === 0) {
          if (picked.activeKey) {
            await markKeyError(picked.activeKey.id, result.error ?? trace.lastError ?? 'adapter 返回空结果');
          }
          return {
            ok: false, savedUrls: [], remoteUrls: result.imageUrls, via: 'adapter',
            adapterSlug: slug,
            error: (result.error ?? trace.lastError ?? 'adapter 返回空结果') + adapterSummary(slug, adapter.baseUrl),
            durationMs: Date.now() - t0,
            trace,
          };
        }

        // v0.11 B14（BUG-M26 修）：先 persistImages，再决定染色
        //   旧版 bug：上游 200 + b64_json，但 saveImage 失败时函数返 ok:false，
        //            可 markKeySuccess 已被调过 → consecutiveErrors 重置，永不 disable。
        //   新版：persistImages 完成后再判断；非空走 markKeySuccess，空（落盘失败）走 markKeyError。
        const persisted = await persistImagesDetailed(result.imageUrls);
          const savedUrls = persisted.savedUrls;
          if (persisted.failures.length > 0) {
            const summary = persisted.failures
              .map((f) => `${f.kind}: ${f.error}`)
              .join(" | ");
            trace.lastError = trace.lastError
              ? `${trace.lastError}; persist: ${summary}`
              : `persist: ${summary}`;
          }
        const persistOk = savedUrls.length > 0;
        if (picked.activeKey) {
          if (persistOk) {
            await markKeySuccess(picked.activeKey.id);
          } else {
            await markKeyError(
              picked.activeKey.id,
              '上游返回成功但本地 saveImage 失败（持久化阶段）',
            );
          }
        }
        return {
          ok: persistOk,
          savedUrls,
          remoteUrls: result.imageUrls,
          durationMs: Date.now() - t0,
          via: 'adapter',
          adapterSlug: slug,
          error: persistOk ? undefined : '远程图片下载失败' + adapterSummary(slug, adapter.baseUrl),
          trace,
        };
      }
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[image-runner] adapter path failed, falling back:', (e as Error).message);
    }
  }

  // 2) Legacy 路径（仅 t2i；i2i 不支持 legacy）
  if (mode === 'i2i') {
    return {
      ok: false, savedUrls: [], via: 'legacy',
      error: 'legacy 路径不支持图生图。请到设置页选启用支持 i2i 的 adapter（kie-flux-kontext-pro / kie-gpt-image-2 / openai-gpt-img-2 / 4router-gpt-image-2）',
      durationMs: Date.now() - t0,
      trace: { via: 'legacy', mode, lastError: 'legacy 不支持 i2i' },
    };
  }
  const legacy = await legacyGenerateImage({ prompt: opts.prompt, size: opts.size, n: opts.n });
  if (!legacy.ok || legacy.images.length === 0) {
    return {
      ok: false, savedUrls: [], via: 'legacy',
      error: legacy.error ?? '未返回图片',
      model: legacy.model,
      durationMs: Date.now() - t0,
      trace: { via: 'legacy', model: legacy.model, lastError: legacy.error ?? undefined, mode },
    };
  }
  const savedUrls: string[] = [];
  for (const it of legacy.images) {
    try {
      if (it.b64) {
        const saved = await saveImageFromBase64(it.b64);
        savedUrls.push(saved.url);
      } else if (it.url) {
        const saved = await saveImageFromUrl(it.url);
        savedUrls.push(saved.url);
      }
    } catch {
      /* ignore */
    }
  }
  return {
    ok: savedUrls.length > 0,
    savedUrls,
    via: 'legacy',
    model: legacy.model,
    durationMs: Date.now() - t0,
    error: savedUrls.length === 0 ? '图片保存失败' : undefined,
    trace: { via: 'legacy', model: legacy.model, mode },
  };
}
