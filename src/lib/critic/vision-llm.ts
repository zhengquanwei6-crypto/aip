/**
 * v0.16-H2.1 · Vision LLM 调用层
 *
 * 用 OpenAI Chat Completions 标准 vision 格式 (messages[].content 数组含 image_url)
 * 池路径：先找 model 含 vision/gpt-4o/claude-3 关键字的 ApiKey，找不到回退默认 active LLM
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

const VISION_MODEL_PATTERNS = [
  /gpt-4o/i,
  /gpt-4-vision/i,
  /claude-3/i,
  /claude-sonnet/i,
  /qwen.*vl/i,
  /gemini.*vision/i,
  /gemini-1\.5/i,
  /gemini-2/i,
  /vision/i,
];

function looksLikeVisionModel(model: string): boolean {
  if (!model) return false;
  return VISION_MODEL_PATTERNS.some((re) => re.test(model));
}

/** 优先选 vision-capable 的 key */
async function pickVisionKey(): Promise<{ key: ActiveKey | null; isVision: boolean }> {
  // 先找池里 model 含 vision 关键字的 active key (priority 排序)
  const rows = await prisma.apiKey.findMany({
    where: { provider: 'llm', active: true },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
  const visionRow = rows.find((r) => looksLikeVisionModel(r.model));
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
    };
  }
  // 没有 vision 模型 → 退到默认 active（可能调用会失败，但至少响应可解读）
  const fallback = await getActiveLLMKey();
  return { key: fallback, isVision: false };
}

export async function generateVision(opts: VisionGenerateOptions): Promise<VisionGenerateResult> {
  const { key, isVision } = await pickVisionKey();
  if (!key || !key.apiKey || !key.baseUrl) {
    return {
      ok: false,
      content: '',
      visionAvailable: false,
      error: '未配置 LLM API。请在 /settings 添加一条 provider=llm 的 ApiKey。',
    };
  }

  if (!isVision) {
    // 友好降级：直接告诉用户需要 vision 模型，不真发请求避免浪费 token
    return {
      ok: false,
      content: '',
      visionAvailable: false,
      model: key.model,
      error: `当前 LLM 池没有 vision 模型 (现有: ${key.model})。请在 /settings 添加支持视觉的 key (gpt-4o / gpt-4o-mini / claude-3 / qwen-vl / gemini)`,
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
