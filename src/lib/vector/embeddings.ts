/**
 * 文本 → 向量。复用现有 LLM key 池（OpenAI 兼容 /v1/embeddings）。
 *
 * 默认模型：text-embedding-3-small（1536 维 · 0.02 USD / 1M tokens）。
 * 也可以在 Setting 表写 EMBEDDING_MODEL 覆盖（如 'bge-m3' 走自部署）。
 *
 * 0 LLM 文案 token 影响：embeddings 接口与 chat completions 是同 key 不同
 * endpoint，调用计费独立。
 */

import { prisma } from "@/lib/db";
import { getActiveLLMKey } from "@/lib/ai/keys";
import { EMBED_DIM } from "./schemas";

export interface EmbedConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

async function readEmbedConfig(): Promise<EmbedConfig | null> {
  // 0) 优先：Setting 里独立配置的 EMBEDDING_BASE_URL + EMBEDDING_API_KEY
  // 这样 embedding 可以指向 cometapi（支持 text-embedding-3-small），
  // 而 chat 仍然走 do-ai.run（不支持 embedding）。
  const overrideRows = await prisma.setting.findMany({
    where: { key: { in: ["EMBEDDING_BASE_URL", "EMBEDDING_API_KEY"] } },
  });
  const overrideMap = new Map(overrideRows.map((r) => [r.key, r.value]));
  const overrideBase = (overrideMap.get("EMBEDDING_BASE_URL") || "").trim();
  const overrideKey = (overrideMap.get("EMBEDDING_API_KEY") || "").trim();
  if (overrideBase && overrideKey) {
    const modelRow = await prisma.setting.findUnique({ where: { key: "EMBEDDING_MODEL" } });
    const model =
      modelRow?.value?.trim() || process.env.EMBEDDING_MODEL || "text-embedding-3-small";
    return { baseUrl: overrideBase, apiKey: overrideKey, model };
  }

  // 1) fallback：从 LLM key 池里挑一条 baseUrl 包含 'cometapi' 或 'openai' 的
  // （它们大概率支持 embeddings）
  const allLlmKeys = await prisma.apiKey.findMany({
    where: { provider: "llm", active: true },
    orderBy: { priority: "asc" },
  });
  let cfg: { baseUrl?: string; apiKey?: string } | null = null;
  const preferred = allLlmKeys.find((k) =>
    /(cometapi|openai\.com|kimi|deepseek\.com)/i.test(k.baseUrl ?? ""),
  );
  if (preferred?.apiKey && preferred.baseUrl) {
    cfg = { baseUrl: preferred.baseUrl, apiKey: preferred.apiKey };
  }
  if (!cfg) {
    try {
      const k = await getActiveLLMKey();
      if (k?.apiKey && k.baseUrl) {
        cfg = { baseUrl: k.baseUrl, apiKey: k.apiKey };
      }
    } catch {
      /* fallthrough */
    }
  }
  if (!cfg) {
    const setting = await prisma.setting.findMany({
      where: { key: { in: ["LLM_API_BASE_URL", "LLM_API_KEY"] } },
    });
    const map = new Map(setting.map((r) => [r.key, r.value]));
    cfg = {
      baseUrl: map.get("LLM_API_BASE_URL") || process.env.LLM_API_BASE_URL,
      apiKey: map.get("LLM_API_KEY") || process.env.LLM_API_KEY,
    };
  }
  if (!cfg.baseUrl || !cfg.apiKey) return null;

  const modelRow = await prisma.setting.findUnique({ where: { key: "EMBEDDING_MODEL" } });
  const model =
    modelRow?.value?.trim() || process.env.EMBEDDING_MODEL || "text-embedding-3-small";

  return { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model };
}

export class EmbeddingError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "EmbeddingError";
  }
}

/**
 * 把 N 段文本转成 N 个向量。OpenAI 兼容协议 /v1/embeddings 单次最多 ~8192 input。
 * 出错抛 EmbeddingError，调用方决定降级。
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const cfg = await readEmbedConfig();
  if (!cfg) throw new EmbeddingError("LLM key 池为空，无法做 embedding");

  // 清洗：embedding API 不接受空字符串
  const inputs = texts.map((t) => (typeof t === "string" && t.trim() ? t.slice(0, 8000) : "·"));

  const url = cfg.baseUrl.replace(/\/+$/, "") + "/embeddings";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: cfg.model, input: inputs }),
      signal: ctrl.signal,
    });
    const text = await r.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw new EmbeddingError(`非 JSON 响应：${text.slice(0, 200)}`, r.status);
    }
    if (!r.ok) {
      throw new EmbeddingError(json?.error?.message || `HTTP ${r.status}`, r.status);
    }
    const arr = Array.isArray(json?.data) ? json.data : [];
    if (arr.length !== inputs.length) {
      throw new EmbeddingError(`返回向量条数不对：${arr.length} vs ${inputs.length}`);
    }
    return arr.map((it: any) => {
      const v = Array.isArray(it?.embedding) ? it.embedding : null;
      if (!v) throw new EmbeddingError("data[i].embedding 缺失");
      // 维度兜底：上游若返回非 1536 维（例如 bge-m3 是 1024），统一切到 EMBED_DIM
      if (v.length === EMBED_DIM) return v;
      if (v.length > EMBED_DIM) return v.slice(0, EMBED_DIM);
      // 不足则填 0（极端情况 / 模型变更）
      return [...v, ...new Array(EMBED_DIM - v.length).fill(0)];
    });
  } finally {
    clearTimeout(timer);
  }
}

/** 单条文本快捷 API */
export async function embedOne(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v;
}
