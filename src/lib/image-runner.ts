/**
 * 图片生成统一入口
 *
 * 优先级：
 *   1. 用户在 Setting 里选了 IMAGE_DEFAULT_ADAPTER（adapter slug）→ 走 adapter
 *   2. 否则回退到旧 generateImage（OpenAI 兼容硬编码）
 *
 * v0.8 Batch 5（B5.1 / B5.5）：fail 路径透传 trace 给上层，便于前端展示
 *   - trace 包含 adapter / baseUrl / model / lastError / lastResponseSnippet / pollHistory
 *   - trace 不包含 API key / Authorization 原文（adapter-runtime.redactHeaders 已脱敏）
 *
 * v0.9 size 归一化：上游 gpt-image-2 / dall-e-3 只接受少数固定尺寸，
 *   非标准尺寸（如 1080x1440）会被中转站包装成「渠道不存在」类的误导错误。
 *   这里在调 runAdapter 前按宽高比就近映射，并把映射记录写进 trace.normalizedSize。
 *
 * v0.11 B1：adapter 路径取 IMAGE_API_KEY 改为优先池 → 失败回退 Setting 表 IMAGE_API_KEY → .env。
 *   - 不改 adapter 选择逻辑（IMAGE_DEFAULT_ADAPTER 仍读 Setting）
 *   - 不改 wire format
 *   - 调用结果（adapter ok / fail）写回池（markKeySuccess / markKeyError）
 *
 * v0.11 B7：尺寸 / 质量预设池
 *   - opts.size：用户从 adapter.sizes[*].value 里选的字符串（如 "2048x2048"）
 *   - opts.quality：用户从 adapter.qualities[*].value 里选的字符串（如 "high" / "hd"）
 *   - 旧调用（无 size/quality）→ 自动用 adapter.sizes[0] / adapter.qualities[0] 兜底（默认 1k + standard/medium）
 *   - 用户传了非法值（不在 sizes/qualities 池里）→ 同上回落 sizes[0]，不抛错（trace 注 fallbackSize: true）
 *   - extra.resolution：自动从 SizePreset.tier 注入（kie-* 系 bodyTemplate 用此占位）
 *   - extra.aspectRatio：自动从 SizePreset.value (W x H) 推算（kie-* 系 bodyTemplate 用此占位）
 *   - 不动既有 bodyTemplate（向后兼容；adapter Setting JSON 仍是 0 schema 改）
 */

import { prisma } from '@/lib/db';
import { generateImage as legacyGenerateImage } from '@/lib/ai/image';
import { runAdapter } from '@/lib/adapter-runtime';
import {
  adapterConfigSchema,
  adapterKey,
  defaultSizeFromPresets,
  defaultQualityFromPresets,
  type AdapterConfig,
  type SizePreset,
  type QualityPreset,
} from '@/lib/adapter-types';
import { saveImageFromBase64, saveImageFromUrl } from '@/lib/storage';
import { normalizeSizeForAdapter, type NormalizedSize } from '@/lib/image-size';
import {
  getActiveImageKey,
  markKeySuccess,
  markKeyError,
  type ActiveKey,
} from '@/lib/ai/keys';

export interface RunOptions {
  prompt: string;
  size?: string;
  /** v0.11 B7：用户选的 quality（low/medium/high or standard/hd），无则用 adapter.qualities[0] */
  quality?: string;
  n?: number;
  /** 透传给 adapter 的 extra（aspectRatio / resolution / outputFormat 等）*/
  extra?: Record<string, unknown>;
  /** AbortController 信号 */
  abortSignal?: AbortSignal;
}

/** 精简版 trace，仅放对前端排错有用的字段（不含原始 headers / 完整请求体）*/
export interface RunTrace {
  via: 'adapter' | 'legacy';
  adapterSlug?: string;
  baseUrl?: string;
  model?: string;
  /** 最近一次 adapter 错误（来自 adapter-runtime trace.lastError）*/
  lastError?: string;
  /** 最近一次响应片段（截断 800 字符）*/
  lastResponseSnippet?: string;
  /** 轮询历史：每条带 ts(ms) / status / ok */
  pollHistory?: { ts: number; at?: string; status?: string; ok: boolean }[];
  /** 尺寸归一化记录：上游不支持自由尺寸时记录原始值与映射后的值 */
  normalizedSize?: { from?: string; to: string; reason?: string };
  /** v0.11 B1：实际取 key 的来源（pool / setting / env） */
  keySource?: 'pool' | 'setting' | 'env' | 'none';
  /** v0.11 B1：池命中时的 key label（脱敏，不含明文）*/
  keyLabel?: string;
  /** v0.11 B7：实际下发的 size / quality（含 fallback 标记）*/
  size?: string;
  sizeTier?: string;
  sizeFallback?: boolean;
  quality?: string;
  qualityFallback?: boolean;
}

export interface RunResult {
  ok: boolean;
  /** 已经下载好、可直接展示 / 写库的本地路径数组（/uploads/xxx.png）*/
  savedUrls: string[];
  /** 远端原始 URL（如果有），仅供调试 */
  remoteUrls?: string[];
  durationMs?: number;
  via: 'adapter' | 'legacy';
  adapterSlug?: string;
  model?: string;
  error?: string;
  /** v0.8 Batch 5：精简 trace，可直接序列化进 API 响应 */
  trace?: RunTrace;
}

function adapterSummary(slug: string, baseUrl?: string): string {
  return ` [adapter=${slug}, baseUrl=${baseUrl || '(空)'}]`;
}

/** 读 Setting 里 IMAGE_DEFAULT_ADAPTER 的 slug；空字符串则视为不存在 */
async function readDefaultAdapterSlug(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: 'IMAGE_DEFAULT_ADAPTER' } });
  const v = row?.value?.trim();
  return v ? v : null;
}

/** 读出某个 adapter 配置 */
async function loadAdapter(slug: string) {
  const row = await prisma.setting.findUnique({ where: { key: adapterKey(slug) } });
  if (!row) return null;
  try {
    const parsed = adapterConfigSchema.safeParse(JSON.parse(row.value));
    if (!parsed.success) return null;
    if (!parsed.data.enabled) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/**
 * v0.11 B1：取 IMAGE 调用用的 API key，依次：
 *   1) ApiKey 池 provider='image'
 *   2) Setting 表 IMAGE_API_KEY
 *   3) .env IMAGE_API_KEY
 */
async function pickImageApiKey(): Promise<{
  apiKey: string;
  source: 'pool' | 'setting' | 'env' | 'none';
  activeKey?: ActiveKey;
}> {
  try {
    const k = await getActiveImageKey();
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

/** 把任意远端/base64 URL 列表本地化保存 */
async function persistImages(remoteUrls: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const url of remoteUrls) {
    try {
      if (typeof url === 'string' && url.startsWith('data:image/')) {
        const m = url.match(/^data:image\/[a-z]+;base64,(.+)$/i);
        if (m) {
          const saved = await saveImageFromBase64(m[1]);
          out.push(saved.url);
          continue;
        }
      }
      const saved = await saveImageFromUrl(url);
      out.push(saved.url);
    } catch {
      // 单张失败不影响其余
    }
  }
  return out;
}

/** 从 adapter-runtime trace（结构宽松）里提炼前端能用的精简版 */
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

/** 提取 adapter bodyTemplate 中的 model 字面量，用于尺寸归一化的启发式 */
function pickAdapterModelHint(adapter: any): string | undefined {
  const flowJson = JSON.stringify(adapter?.flow ?? {});
  const m = flowJson.match(/"model"\s*:\s*"([^"]+)"/);
  return m?.[1];
}

/**
 * v0.11 B7：根据 adapter.sizes 把用户传入的 size 收敛到合法值。
 *   - 若用户没传 size → 用 sizes[0]
 *   - 若用户传了但不在 sizes[*].value 列表里 → 也用 sizes[0]，标记 fallback=true
 *   - adapter 没有 sizes 数组（旧 row）→ 直接放行用户传入的，不 fallback
 */
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
  // fallback to first
  const first = list[0];
  return { value: first.value, tier: first.tier ?? undefined, preset: first, fallback: true };
}

/**
 * v0.11 B7：根据 adapter.qualities 收敛 quality（同上）。
 */
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

/** 从 "1024x1024" / "1024x1536" 推 aspect ratio "1:1" / "2:3"（仅作 hint）*/
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
  // 兜底：返回 raw "WxH"
  return `${w}:${h}`;
}

export async function runImageGenerate(opts: RunOptions): Promise<RunResult> {
  const t0 = Date.now();

  // 1) 尝试 adapter 路径
  try {
    const slug = await readDefaultAdapterSlug();
    if (slug) {
      const adapter = await loadAdapter(slug);
      if (adapter) {
        // v0.11 B1：取 IMAGE_API_KEY（优先池）
        const picked = await pickImageApiKey();
        const apiKey = picked.apiKey;
        if (!apiKey) {
          return {
            ok: false, savedUrls: [], via: 'adapter', adapterSlug: slug,
            error: '未配置 IMAGE API Key，请到设置页（API Keys 池）新增一条 provider=image 的 key' + adapterSummary(slug, adapter.baseUrl),
            durationMs: Date.now() - t0,
            trace: { via: 'adapter', adapterSlug: slug, baseUrl: adapter.baseUrl, lastError: '未配置 IMAGE_API_KEY', keySource: 'none' },
          };
        }

        // v0.11 B7：先按 adapter.sizes / qualities 收敛
        const sizeR = resolveSize(adapter, opts.size);
        const qualityR = resolveQuality(adapter, opts.quality);

        // 合并 extra：把 sizeTier → extra.resolution（如未指定）；aspect ratio → extra.aspectRatio（如未指定）
        const userExtra = opts.extra ?? {};
        const mergedExtra: Record<string, unknown> = { ...userExtra };
        if (sizeR.tier && typeof userExtra.resolution === 'undefined') {
          mergedExtra.resolution = sizeR.tier;
        }
        if (typeof userExtra.aspectRatio === 'undefined') {
          const ar = aspectRatioFromValue(sizeR.value);
          if (ar) mergedExtra.aspectRatio = ar;
        }

        // 上游通常只接受固定尺寸；按 adapter 模型提示归一化
        const adapterModelHint = pickAdapterModelHint(adapter);
        const normalized: NormalizedSize = normalizeSizeForAdapter(sizeR.value ?? opts.size, adapterModelHint);

        const result = await runAdapter(adapter, {
          prompt: opts.prompt,
          size: normalized.size,
          quality: qualityR.value,
          n: opts.n ?? 1,
          extra: mergedExtra,
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
        // v0.11 B7：trace 注尺寸 / 质量
        if (sizeR.value) trace.size = sizeR.value;
        if (sizeR.tier) trace.sizeTier = sizeR.tier;
        if (sizeR.fallback) trace.sizeFallback = true;
        if (qualityR.value) trace.quality = qualityR.value;
        if (qualityR.fallback) trace.qualityFallback = true;

        if (!result.ok || result.imageUrls.length === 0) {
          // v0.11 B1：失败回写池
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
        // 成功
        if (picked.activeKey) {
          await markKeySuccess(picked.activeKey.id);
        }
        const savedUrls = await persistImages(result.imageUrls);
        return {
          ok: savedUrls.length > 0,
          savedUrls,
          remoteUrls: result.imageUrls,
          durationMs: Date.now() - t0,
          via: 'adapter',
          adapterSlug: slug,
          error: savedUrls.length === 0 ? '远程图片下载失败' + adapterSummary(slug, adapter.baseUrl) : undefined,
          trace,
        };
      }
    }
  } catch (e) {
    // v0.11 B4: dev-only（生产环境静默；adapter 失败时已经会通过 trace 暴露给前端）
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[image-runner] adapter path failed, falling back:', (e as Error).message);
    }
  }

  // 2) Legacy 路径（generateImage 内部已含池 + setting 回退 + recordImageResult）
  const legacy = await legacyGenerateImage({ prompt: opts.prompt, size: opts.size, n: opts.n });
  if (!legacy.ok || legacy.images.length === 0) {
    return {
      ok: false, savedUrls: [], via: 'legacy',
      error: legacy.error ?? '未返回图片',
      model: legacy.model,
      durationMs: Date.now() - t0,
      trace: { via: 'legacy', model: legacy.model, lastError: legacy.error ?? undefined },
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
    trace: { via: 'legacy', model: legacy.model },
  };
}
