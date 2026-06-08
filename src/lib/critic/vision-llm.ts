/**
 * v0.16-H2.1 · Vision LLM 调用层（v0.16-H2.1.1：白名单 + Setting 覆盖）
 *
 * 用 OpenAI Chat Completions 标准 vision 格式 (messages[].content 数组含 image_url)
 * 池路径：先找 model 含 vision 关键字的 ApiKey，找不到回退默认 active LLM。
 *
 * 视觉模型识别策略（按顺序）：
 *   1. 内置正则白名单 VISION_MODEL_PATTERNS — 主流模型名直接命中（gpt-4o /
 *      claude-3 / qwen2.5-vl / gemini-1.5 / pixtral / llava / internvl / omni 等）
 *   2. Setting 表 VISION_MODEL_ALLOWLIST — 用户自助覆盖。逗号或换行分隔，
 *      每一项作为子串匹配 model 字段（不区分大小写）。
 *      用法：在 /settings 加一条 key=VISION_MODEL_ALLOWLIST，
 *           value=qwen3.5-397b-a17b,my-custom-vl
 *      下一次 Critic 调用立即生效，无需重启容器。
 *   3. 都不命中 → 友好错误，列出当前池里所有 LLM model 让用户排查。
 *
 * 设计原则：失败友好降级，不抛异常
 */
import { prisma } from '@/lib/db';
import {
  getActiveLLMKey,
  markKeySuccess,
  markKeyError,
  type ActiveKey,
} from '@/lib/ai/keys';

export type VisionMessageContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };

export interface VisionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | VisionMessageContent[];
}

export interface VisionGenerateOptions {
  messages: VisionMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
}

export interface VisionGenerateResult {
  ok: boolean;
  content: string;
  model?: string;
  error?: string;
  visionAvailable: boolean; // false 时 = 池里没找到 vision key
}

/**
 * 内置视觉模型白名单。新模型出来时优先在这里加，避免每个用户都要去
 * Setting 配 VISION_MODEL_ALLOWLIST。
 *
 * 注意 `\bvl\b` 匹配独立的 vl token（避免误杀 `vlsubmit` 之类无关串），
 * 但同时保留 `-vl-` 和 `\.vl\b` 兼容连字符 / 点号变体。
 */
const VISION_MODEL_PATTERNS: RegExp[] = [
  // OpenAI
  /gpt-4o/i,
  /gpt-4-vision/i,
  /gpt-4-turbo-(?:.+)?vision/i,
  /gpt-5/i,
  /o1-(?:vision|preview)/i,
  // Anthropic
  /claude-3/i,
  /claude-sonnet/i,
  /claude-opus/i,
  /claude-haiku/i,
  // Google
  /gemini-1\.5/i,
  /gemini-2/i,
  /gemini.*pro/i,
  /gemini.*flash/i,
  /gemini.*vision/i,
  // Qwen 全系视觉变体
  /qwen.*vl/i,        // qwen-vl-plus / qwen2-vl / qwen2.5-vl / qwen3-vl-*
  /qwen.*omni/i,      // qwen-omni
  /qwen.*max-vl/i,
  // Meta / open-source
  /llama-3.*vision/i,
  /llama-3\.[2-9]/i,  // 3.2+ 全系视觉默认开启
  /llava/i,
  /internvl/i,
  // Mistral
  /pixtral/i,
  /mistral.*vision/i,
  // 通用兜底
  /\bvl\b/i,
  /-vl-/i,
  /vision/i,
  /multimodal/i,
  /\bvlm\b/i,
];

/** 模块级缓存：避免每次 Critic 调用都查一次 Setting */
let allowlistCache: { values: string[]; expiresAt: number } | null = null;
const ALLOWLIST_TTL_MS = 30_000;

async function loadAllowlist(): Promise<string[]> {
  const now = Date.now();
  if (allowlistCache && allowlistCache.expiresAt > now) {
    return allowlistCache.values;
  }
  let values: string[] = [];
  try {
    const row = await prisma.setting.findUnique({
      where: { key: 'VISION_MODEL_ALLOWLIST' },
    });
    if (row?.value) {
      values = row.value
        .split(/[,\n]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);
    }
  } catch {
    /* DB unavailable — silently fall through with empty allowlist */
  }
  allowlistCache = { values, expiresAt: now + ALLOWLIST_TTL_MS };
  return values;
}

function looksLikeVisionModel(model: string, allowlist: readonly string[]): boolean {
  if (!model) return false;
  if (VISION_MODEL_PATTERNS.some((re) => re.test(model))) return true;
  if (allowlist.length > 0) {
    const lower = model.toLowerCase();
    if (allowlist.some((entry) => lower.includes(entry))) return true;
  }
  return false;
}

/** 优先选 vision-capable 的 key */
async function pickVisionKey(): Promise<{
  key: ActiveKey | null;
  isVision: boolean;
  poolModels: string[];
}> {
  const rows = await prisma.apiKey.findMany({
    where: { provider: 'llm', active: true },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
  const allowlist = await loadAllowlist();
  const poolModels = rows.map((r) => r.model);

  const visionRow = rows.find((r) => looksLikeVisionModel(r.model, allowlist));
  if (visionRow) {
    return {
      key: {
        id: visionRow.id,
        provider: 'llm',
        label: visionRow.label,
        baseUrl: visionRow.baseUrl,
        apiKey: visionRow.apiKey,
        model: visionRow.model,
        priority: visionRow.priority,
        consecutiveErrors: visionRow.consecutiveErrors,
      },
      isVision: true,
      poolModels,
    };
  }
  // 没有 vision 模型 → 退到默认 active
  const fallback = await getActiveLLMKey();
  return { key: fallback, isVision: false, poolModels };
}

export async function generateVision(opts: VisionGenerateOptions): Promise<VisionGenerateResult> {
  const { key, isVision, poolModels } = await pickVisionKey();
  if (!key || !key.apiKey || !key.baseUrl) {
    return {
      ok: false,
      content: '',
      visionAvailable: false,
      error: '未配置 LLM API。请在 /settings 添加一条 provider=llm 的 ApiKey。',
    };
  }

  if (!isVision) {
    // 友好降级：把池里所有 model 列出来，让用户一眼看到该改谁。
    const list = poolModels.length > 0 ? poolModels.join(', ') : '(空)';
    return {
      ok: false,
      content: '',
      visionAvailable: false,
      model: key.model,
      error:
        `当前 LLM 池没有识别为视觉模型的 key。池中 active 模型：${list}。\n` +
        `修法二选一：\n` +
        `  1) 把 model 字符串改为含 vl/vision/gpt-4o/claude-3 等关键字（例：${key.model} → ${key.model}-vl）\n` +
        `  2) 在 /settings 加一条 key=VISION_MODEL_ALLOWLIST, value=${key.model}（逗号分隔多个模型名子串），30 秒内生效。\n` +
        `内置已识别：gpt-4o / claude-3 / qwen-*-vl / qwen-omni / gemini-1.5+ / llama-3.[2-9] / pixtral / llava / internvl / 含 "vl" "vision" "vlm" "multimodal" 的任意 model。`,
    };
  }

  const url = `${key.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const body: Record<string, unknown> = {
    model: key.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.5,
    max_tokens: opts.maxTokens ?? 1500,
  };
  if (opts.responseFormat === 'json') {
    body.response_format = { type: 'json_object' };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      const errMsg = `Vision LLM (${res.status}): ${errText.slice(0, 400)} [model=${key.model}]`;
      await markKeyError(key.id, errMsg);
      return { ok: false, content: '', visionAvailable: true, model: key.model, error: errMsg };
    }
    const data: any = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? '';
    await markKeySuccess(key.id);
    return { ok: true, content, model: key.model, visionAvailable: true };
  } catch (err) {
    const errMsg = `Vision 请求异常: ${(err as Error).message}`;
    await markKeyError(key.id, errMsg);
    return { ok: false, content: '', visionAvailable: true, model: key.model, error: errMsg };
  }
}

/** 把 dataUrl 或 公开 URL 转成 OpenAI image_url 格式 */
export function imageContent(urlOrDataUrl: string, detail: 'low' | 'high' | 'auto' = 'auto'): VisionMessageContent {
  return { type: 'image_url', image_url: { url: urlOrDataUrl, detail } };
}

export function textContent(text: string): VisionMessageContent {
  return { type: 'text', text };
}

/**
 * 测试钩子：导出供调试用，让 /api/agents/critic/probe 能直接列出当前
 * Setting 覆盖与白名单匹配结果。production code 不需要 import。
 */
export async function debugVisionDetection(): Promise<{
  builtinPatterns: string[];
  allowlist: string[];
  poolModels: { model: string; matched: boolean; via: 'builtin' | 'allowlist' | 'no' }[];
}> {
  const allowlist = await loadAllowlist();
  const rows = await prisma.apiKey.findMany({
    where: { provider: 'llm', active: true },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
  return {
    builtinPatterns: VISION_MODEL_PATTERNS.map((re) => re.toString()),
    allowlist,
    poolModels: rows.map((r) => {
      const builtinHit = VISION_MODEL_PATTERNS.some((re) => re.test(r.model));
      const allowlistHit =
        !builtinHit &&
        allowlist.length > 0 &&
        allowlist.some((entry) => r.model.toLowerCase().includes(entry));
      return {
        model: r.model,
        matched: builtinHit || allowlistHit,
        via: builtinHit ? 'builtin' : allowlistHit ? 'allowlist' : 'no',
      };
    }),
  };
}
