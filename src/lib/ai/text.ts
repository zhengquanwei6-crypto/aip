/**
 * LLM 文案 API 封装
 * 兼容 OpenAI Chat Completions 格式 /v1/chat/completions
 *
 * 配置优先级：数据库 Setting 表 > .env
 *
 * v0.8 Batch 1（B1.8）：错误信息附加 baseUrl + model 摘要（BUG-7）
 */

import { prisma } from '@/lib/db';

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
  model?: string;
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

export async function getLLMConfig(): Promise<Partial<LLMConfig>> {
  const settings = await prisma.setting.findMany({
    where: { key: { in: ['LLM_API_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL'] } },
  });
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  return {
    baseUrl: map.LLM_API_BASE_URL || process.env.LLM_API_BASE_URL || '',
    apiKey: map.LLM_API_KEY || process.env.LLM_API_KEY || '',
    model: map.LLM_MODEL || process.env.LLM_MODEL || 'gpt-4o-mini',
  };
}

export async function isLLMConfigured(): Promise<boolean> {
  const cfg = await getLLMConfig();
  return Boolean(cfg.apiKey && cfg.baseUrl);
}

export async function generateText(
  options: GenerateTextOptions,
): Promise<GenerateTextResult> {
  const cfg = await getLLMConfig();
  if (!cfg.apiKey || !cfg.baseUrl) {
    return {
      ok: false,
      content: '',
      error:
        '未配置 LLM API。请前往「设置」页面填写 LLM_API_BASE_URL 与 LLM_API_KEY。' +
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
      return {
        ok: false,
        content: '',
        error:
          `LLM API 调用失败 (${res.status}): ${errText.slice(0, 500)}` +
          summary(cfg),
        model: cfg.model,
      };
    }
    const data: any = await res.json();
    const content: string =
      data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';
    return { ok: true, content, model: cfg.model };
  } catch (err) {
    return {
      ok: false,
      content: '',
      error: `LLM 请求异常: ${(err as Error).message}` + summary(cfg),
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
