/**
 * LLM 文案 API 封装
 * 兼容 OpenAI Chat Completions 格式 /v1/chat/completions
 *
 * 配置优先级（v0.11 B1 起）：
 *   1) ApiKey 池（provider='llm'，按 priority asc 取一条 active）
 *   2) Setting 表（LLM_API_BASE_URL / LLM_API_KEY / LLM_MODEL，向后兼容）
 *   3) .env（同名变量）
 *
 * v0.8 B1.8：错误信息附加 baseUrl + model 摘要
 * v0.11 B1：池路径 + recordLLMResult(success, error) 反馈池
 */

import { prisma } from '@/lib/db';
import {
  getActiveLLMKey,
  markKeySuccess,
  markKeyError,
  type ActiveKey,
} from '@/lib/ai/keys';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateTextOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
}

export interface GenerateTextResult {
  ok: boolean;
  content: string;
  /** 真正使用的模型名（cfg.model）。 */
  model?: string;
  /** content 来自 reasoning_content 字段（reasoning model 兼容路径）。 */
  usedReasoning?: boolean;
  error?: string;
}

export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function summary(cfg: Partial<LLMConfig>): string {
  return ` [baseUrl=${cfg.baseUrl || '(空)'}, model=${cfg.model || '(空)'}]`;
}

/**
 * v0.11 B1：扩展返回带 _activeKey（最近一次取到的池条目元数据），供 generateText 失败/成功后回写。
 * 老调用方只看 baseUrl/apiKey/model 三字段，行为兼容。
 */
export interface LLMConfigWithSource extends Partial<LLMConfig> {
  /** v0.11 B1：池命中时填，回退 Setting 时为 undefined */
  _activeKey?: ActiveKey;
  /** 'pool' | 'setting' | 'env' | 'none' */
  _source?: 'pool' | 'setting' | 'env' | 'none';
}

/**
 * v0.11 B1：带 source 的 config 读取
 */
export async function getLLMConfigWithSource(): Promise<LLMConfigWithSource> {
  // 1) 池
  try {
    const k = await getActiveLLMKey();
    if (k && k.apiKey && k.baseUrl) {
      return {
        baseUrl: k.baseUrl,
        apiKey: k.apiKey,
        model: k.model || 'gpt-4o-mini',
        _activeKey: k,
        _source: 'pool',
      };
    }
  } catch {
    /* 池失败时静默 fallback Setting */
  }

  // 2) Setting
  const settings = await prisma.setting.findMany({
    where: { key: { in: ['LLM_API_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL'] } },
  });
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  const baseUrl = map.LLM_API_BASE_URL || process.env.LLM_API_BASE_URL || '';
  const apiKey = map.LLM_API_KEY || process.env.LLM_API_KEY || '';
  const model = map.LLM_MODEL || process.env.LLM_MODEL || 'gpt-4o-mini';

  let _source: 'setting' | 'env' | 'none' = 'none';
  if (map.LLM_API_KEY) _source = 'setting';
  else if (process.env.LLM_API_KEY) _source = 'env';

  return { baseUrl, apiKey, model, _source };
}

/**
 * 旧签名保留，向后兼容（v0.8 之前的调用方继续工作）。
 * 内部走带 source 的版本，剥掉元字段。
 */
export async function getLLMConfig(): Promise<Partial<LLMConfig>> {
  const cfg = await getLLMConfigWithSource();
  return { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model };
}

export async function isLLMConfigured(): Promise<boolean> {
  const cfg = await getLLMConfig();
  return Boolean(cfg.apiKey && cfg.baseUrl);
}

/**
 * v0.11 B1：直接给上层用的"成功/失败回写池"接口。
 * generateText 内部已自动调用，其它直接 fetch LLM 的地方（如未来扩展的 streaming）也可手动调。
 */
export async function recordLLMResult(
  activeKey: ActiveKey | null | undefined,
  success: boolean,
  error?: string | null,
): Promise<void> {
  if (!activeKey) return;
  if (success) {
    await markKeySuccess(activeKey.id);
  } else {
    await markKeyError(activeKey.id, error ?? null);
  }
}

export async function generateText(
  options: GenerateTextOptions,
): Promise<GenerateTextResult> {
  const cfg = await getLLMConfigWithSource();
  if (!cfg.apiKey || !cfg.baseUrl) {
    return {
      ok: false,
      content: '',
      error:
        '未配置 LLM API。请前往「设置 → API Keys 池」新增一条 provider=llm 的 key，或在 Setting 兼容字段填写 LLM_API_BASE_URL / LLM_API_KEY。' +
        summary(cfg),
    };
  }

  const url = `${cfg.baseUrl!.replace(/\/$/, '')}/chat/completions`;
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 2000,
  };
  if (options.responseFormat === 'json') {
    body.response_format = { type: 'json_object' };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      const errMsg =
        `LLM API 调用失败 (${res.status}): ${errText.slice(0, 500)}` +
        summary(cfg);
      await recordLLMResult(cfg._activeKey, false, errMsg);
      return {
        ok: false,
        content: '',
        error: errMsg,
        model: cfg.model,
      };
    }
    const data: any = await res.json();
    // 大多数 OpenAI 兼容 API 把答案放 message.content。但 reasoning models
    // (QwQ / R1 / qwen3.5-397b-a17b 系) 会把 content=null + reasoning_content=<答案>
    // 这种情况下我们要兜底拿 reasoning_content，但同时记一条警告说这条 key
    // 不是普通 chat model；外部代码（如 extractJSON）能从 reasoning trace
    // 里提到 JSON 也算它通过。
    const choice = data?.choices?.[0];
    const msg = choice?.message ?? {};
    let content: string =
      msg.content ?? choice?.text ?? '';
    let usedReasoning = false;
    if ((!content || content.trim() === '') && typeof msg.reasoning_content === 'string') {
      content = msg.reasoning_content;
      usedReasoning = true;
    }
    if (!content || content.trim() === '') {
      // content 真的空 — 记录一次失败让 key health 计数变差，最终自动停用
      const errMsg =
        `LLM 返回空内容（model=${cfg.model}，可能是 reasoning model 但 reasoning_content 也空）。`;
      await recordLLMResult(cfg._activeKey, false, errMsg);
      return {
        ok: false,
        content: '',
        error: errMsg,
        model: cfg.model,
      };
    }
    await recordLLMResult(cfg._activeKey, true);
    return { ok: true, content, model: cfg.model, usedReasoning };
  } catch (err) {
    const errMsg = `LLM 请求异常: ${(err as Error).message}` + summary(cfg);
    await recordLLMResult(cfg._activeKey, false, errMsg);
    return {
      ok: false,
      content: '',
      error: errMsg,
      model: cfg.model,
    };
  }
}

/** 提取大模型返回内容中的 JSON */
export function extractJSON<T = any>(text: string): T | null {
  if (!text) return null;
  // 直接 parse
  try {
    return JSON.parse(text) as T;
  } catch {
    /* ignore */
  }
  // 去除 ```json ... ``` 包裹
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1]) as T;
    } catch {
      /* ignore */
    }
  }
  // 尝试找首个 { 到末尾 }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1)) as T;
    } catch {
      /* ignore */
    }
  }
  return null;
}
