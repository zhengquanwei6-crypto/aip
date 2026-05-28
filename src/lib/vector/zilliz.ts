/**
 * Zilliz Cloud REST 客户端（v2/vectordb 路径）。
 *
 * 文档：https://docs.zilliz.com/reference/restful/get-started
 * 端点格式：POST {endpoint}/v2/vectordb/<resource>/<action>
 * 鉴权：Authorization: Bearer <token>
 *
 * 设计原则：
 *   - 0 第三方 SDK（不引 @zilliz/milvus2-sdk-node，省 30MB），纯 fetch
 *   - 所有错误抛 ZillizError，上层决定降级行为
 *   - 所有方法有 timeout（默认 15s）
 */

import { prisma } from "@/lib/db";

export interface ZillizConfig {
  endpoint: string;
  token: string;
  /** 当 false 时所有 client 方法直接 throw ZillizDisabledError，不出网 */
  enabled: boolean;
}

export class ZillizError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly raw?: unknown,
  ) {
    super(message);
    this.name = "ZillizError";
  }
}

export class ZillizDisabledError extends ZillizError {
  constructor() {
    super("Vector DB 未启用（去 /settings 配置 Zilliz）", -1);
    this.name = "ZillizDisabledError";
  }
}

/** 读取当前 Zilliz 配置：Setting 表优先 → env 兜底 */
export async function loadZillizConfig(): Promise<ZillizConfig> {
  const rows = await prisma.setting.findMany({
    where: {
      key: { in: ["VECTOR_ZILLIZ_ENDPOINT", "VECTOR_ZILLIZ_TOKEN", "VECTOR_ENABLED"] },
    },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const endpoint =
    (map.get("VECTOR_ZILLIZ_ENDPOINT") || process.env.ZILLIZ_ENDPOINT || "").trim();
  const token = (map.get("VECTOR_ZILLIZ_TOKEN") || process.env.ZILLIZ_TOKEN || "").trim();
  const enabled = (map.get("VECTOR_ENABLED") || process.env.VECTOR_ENABLED || "").trim() === "1";
  return { endpoint, token, enabled };
}

async function fetchJSON<T = any>(
  url: string,
  init: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 15000);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await r.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw new ZillizError(`非 JSON 响应：${text.slice(0, 200)}`, r.status, text);
    }
    if (!r.ok) {
      throw new ZillizError(
        json?.message || `HTTP ${r.status}`,
        json?.code ?? r.status,
        json,
      );
    }
    if (typeof json?.code === "number" && json.code !== 0 && json.code !== 200) {
      throw new ZillizError(json?.message || `Zilliz code=${json.code}`, json.code, json);
    }
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

function mustConfig(cfg: ZillizConfig) {
  if (!cfg.enabled) throw new ZillizDisabledError();
  if (!cfg.endpoint || !cfg.token) {
    throw new ZillizError("Zilliz endpoint/token 未配置", -2);
  }
}

function authHeaders(cfg: ZillizConfig) {
  return {
    Authorization: `Bearer ${cfg.token}`,
    "Content-Type": "application/json",
  } as Record<string, string>;
}

// ───────────────────────────────────────────────
// Collections
// ───────────────────────────────────────────────

export async function listCollections(cfg: ZillizConfig): Promise<string[]> {
  mustConfig(cfg);
  const j = await fetchJSON<{ data: string[] }>(
    `${cfg.endpoint}/v2/vectordb/collections/list`,
    { method: "POST", headers: authHeaders(cfg), body: "{}" },
  );
  return Array.isArray(j.data) ? j.data : [];
}

export async function hasCollection(cfg: ZillizConfig, name: string): Promise<boolean> {
  // v0.14-z77: dedicated cluster 的 list 不返回 quick-create collection，用 describe 试一下
  try {
    await describeCollection(cfg, name);
    return true;
  } catch (e) {
    // ZillizError code !== 0 表示不存在
    if (e instanceof ZillizError) return false;
    throw e;
  }
}

export async function createCollection(
  cfg: ZillizConfig,
  opts: { name: string; dimension: number; description?: string; metric?: "COSINE" | "L2" | "IP" },
): Promise<void> {
  mustConfig(cfg);
  // 用 quick-create：固定字段 = id (varchar PK auto=false) + vector (float dimension)
  // 其余字段走 dynamic，存 JSON 元数据
  const body = {
    collectionName: opts.name,
    dimension: opts.dimension,
    metricType: opts.metric ?? "COSINE",
    primaryFieldName: "id",
    idType: "VarChar",
    autoID: false,
    vectorFieldName: "vector",
    enableDynamicField: true,
    ...(opts.description ? { description: opts.description } : {}),
    params: { max_length: 64 },
  };
  await fetchJSON(`${cfg.endpoint}/v2/vectordb/collections/create`, {
    method: "POST",
    headers: authHeaders(cfg),
    body: JSON.stringify(body),
  });
}

export async function dropCollection(cfg: ZillizConfig, name: string): Promise<void> {
  mustConfig(cfg);
  await fetchJSON(`${cfg.endpoint}/v2/vectordb/collections/drop`, {
    method: "POST",
    headers: authHeaders(cfg),
    body: JSON.stringify({ collectionName: name }),
  });
}

export async function describeCollection(cfg: ZillizConfig, name: string): Promise<any> {
  mustConfig(cfg);
  return fetchJSON(`${cfg.endpoint}/v2/vectordb/collections/describe`, {
    method: "POST",
    headers: authHeaders(cfg),
    body: JSON.stringify({ collectionName: name }),
  });
}

export async function statsCollection(
  cfg: ZillizConfig,
  name: string,
): Promise<{ rowCount: number }> {
  mustConfig(cfg);
  // v0.14-z77: dedicated cluster 的 get_stats 始终返回 0，用 entities/query count(*) 替代
  try {
    const j = await fetchJSON<{ data: any[] }>(
      `${cfg.endpoint}/v2/vectordb/entities/query`,
      {
        method: "POST",
        headers: authHeaders(cfg),
        body: JSON.stringify({
          collectionName: name,
          filter: '',
          outputFields: ["count(*)"],
          limit: 1,
        }),
      },
    );
    const arr = Array.isArray(j?.data) ? j.data : [];
    if (arr.length === 0) return { rowCount: 0 };
    const first = arr[0];
    const count = first?.["count(*)"] ?? first?.count ?? 0;
    return { rowCount: Number(count) || 0 };
  } catch (e) {
    // count(*) 不被支持时 fallback 到 get_stats
    try {
      const j = await fetchJSON<{ data: { rowCount: number } }>(
        `${cfg.endpoint}/v2/vectordb/collections/get_stats`,
        {
          method: "POST",
          headers: authHeaders(cfg),
          body: JSON.stringify({ collectionName: name }),
        },
      );
      return { rowCount: Number(j?.data?.rowCount) || 0 };
    } catch {
      return { rowCount: 0 };
    }
  }
}

// ───────────────────────────────────────────────
// Data
// ───────────────────────────────────────────────

export interface UpsertRow {
  id: string;
  vector: number[];
  /** 任意元数据，作为 dynamic 字段 */
  [k: string]: unknown;
}

/** 注意：upsert 会在 PK 存在时覆盖，避免重复索引 */
export async function upsert(
  cfg: ZillizConfig,
  collectionName: string,
  rows: UpsertRow[],
): Promise<{ upsertCount: number }> {
  mustConfig(cfg);
  if (rows.length === 0) return { upsertCount: 0 };
  const j = await fetchJSON<{ data: { upsertCount?: number } }>(
    `${cfg.endpoint}/v2/vectordb/entities/upsert`,
    {
      method: "POST",
      headers: authHeaders(cfg),
      body: JSON.stringify({ collectionName, data: rows }),
      timeoutMs: 30000,
    },
  );
  return { upsertCount: Number(j?.data?.upsertCount) || rows.length };
}

export async function deleteByIds(
  cfg: ZillizConfig,
  collectionName: string,
  ids: string[],
): Promise<void> {
  mustConfig(cfg);
  if (ids.length === 0) return;
  await fetchJSON(`${cfg.endpoint}/v2/vectordb/entities/delete`, {
    method: "POST",
    headers: authHeaders(cfg),
    body: JSON.stringify({
      collectionName,
      filter: `id in [${ids.map((i) => JSON.stringify(i)).join(",")}]`,
    }),
  });
}

export interface SearchHit {
  id: string;
  distance: number; // cosine: 越大越相似（1.0=完全一致）
  meta: Record<string, unknown>;
}

export async function search(
  cfg: ZillizConfig,
  collectionName: string,
  vector: number[],
  opts: { topK?: number; filter?: string; outputFields?: string[] } = {},
): Promise<SearchHit[]> {
  mustConfig(cfg);
  const body: any = {
    collectionName,
    data: [vector],
    limit: opts.topK ?? 10,
    outputFields: opts.outputFields ?? ["*"],
  };
  if (opts.filter) body.filter = opts.filter;
  const j = await fetchJSON<{ data: any[] }>(
    `${cfg.endpoint}/v2/vectordb/entities/search`,
    {
      method: "POST",
      headers: authHeaders(cfg),
      body: JSON.stringify(body),
      timeoutMs: 20000,
    },
  );
  const arr = Array.isArray(j?.data) ? j.data : [];
  return arr.map((row: any) => {
    const { id, distance, ...rest } = row || {};
    return {
      id: String(id ?? ""),
      distance: Number(distance) || 0,
      meta: rest as Record<string, unknown>,
    };
  });
}
