/**
 * 高层 API：把 prisma 行（AIOutput / Asset）索引到 Zilliz。
 *
 * 三个对外函数：
 *   - ensureCollections() — 确保两个 collection 存在（首次调用或 backfill 时跑）
 *   - indexAIOutputs(rows) / indexAssets(rows) — 批量索引
 *   - searchHistory(q, opts) / searchAssets(q, opts) — 语义搜索
 *
 * 设计原则：
 *   - 失败不阻塞业务流（caller 用 try/catch 后 console.warn）
 *   - 文本太长截断，预览前 200/400 字
 *   - 索引以 prisma 行的 id 为主键 → 重复索引会 upsert 覆盖
 */

import {
  loadZillizConfig,
  hasCollection,
  createCollection,
  upsert,
  search,
  statsCollection,
  type ZillizConfig,
  type SearchHit,
} from "./zilliz";
import { embedTexts, embedOne } from "./embeddings";
import { COLLECTIONS, type HistoryMeta, type AssetMeta } from "./schemas";

function shorten(s: string, max: number): string {
  if (!s) return "";
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

/** 把 AIOutput 的 input/output 拼成索引文本（存一条 source='both' 的 vector） */
function aiOutputText(row: { type: string; input: string | null; output: string | null }): string {
  const parts: string[] = [];
  if (row.type) parts.push(`[${row.type}]`);
  if (row.input) parts.push(`输入: ${row.input}`);
  if (row.output) parts.push(`输出: ${row.output}`);
  return parts.join("\n").slice(0, 7900);
}

function assetText(row: {
  type: string;
  category?: string | null;
  platform?: string | null;
  prompt?: string | null;
}): string {
  const parts: string[] = [];
  if (row.type) parts.push(`[${row.type}]`);
  if (row.category) parts.push(`分类:${row.category}`);
  if (row.platform) parts.push(`平台:${row.platform}`);
  if (row.prompt) parts.push(row.prompt);
  return parts.join(" ").slice(0, 7900);
}

export async function ensureCollections(cfg?: ZillizConfig): Promise<void> {
  const c = cfg ?? (await loadZillizConfig());
  if (!c.enabled || !c.endpoint || !c.token) {
    throw new Error("Zilliz 未启用 / 未配置");
  }
  const list = [COLLECTIONS.HISTORY, COLLECTIONS.ASSETS];
  for (const spec of list) {
    if (!(await hasCollection(c, spec.collectionName))) {
      await createCollection(c, {
        name: spec.collectionName,
        dimension: spec.dimension,
        description: spec.description,
        metric: "COSINE",
      });
    }
  }
}

// ───────────────────────────────────────────────
// 索引
// ───────────────────────────────────────────────

interface AIOutputRow {
  id: string;
  type: string;
  input: string | null;
  output: string | null;
  model: string | null;
  createdAt: Date | string;
}

interface AssetRow {
  id: string;
  type: string;
  source?: string | null;
  platform?: string | null;
  category?: string | null;
  prompt?: string | null;
  url?: string | null;
  createdAt: Date | string;
}

function ts(v: Date | string): number {
  const d = v instanceof Date ? v : new Date(v);
  return d.getTime();
}

/** 解析 AIOutput.input 找平台标记（platform 字段藏在 JSON 里） */
function pickPlatform(rawInput: string | null): string | null {
  if (!rawInput) return null;
  try {
    const j = JSON.parse(rawInput);
    if (typeof j?.platform === "string") return j.platform;
  } catch {
    /* not json */
  }
  return null;
}

export async function indexAIOutputs(rows: AIOutputRow[]): Promise<{ ok: number; fail: number }> {
  if (rows.length === 0) return { ok: 0, fail: 0 };
  const cfg = await loadZillizConfig();
  if (!cfg.enabled) return { ok: 0, fail: rows.length };

  await ensureCollections(cfg);

  // 准备文本
  const texts = rows.map((r) => aiOutputText(r));
  const vectors = await embedTexts(texts);
  const data = rows.map((r, i) => {
    const meta: HistoryMeta = {
      type: r.type,
      platform: pickPlatform(r.input),
      source: "both",
      refId: r.id,
      createdAt: ts(r.createdAt),
      preview: shorten(r.output || r.input || "", 200),
    };
    return { id: r.id, vector: vectors[i], ...meta };
  });
  const r = await upsert(cfg, COLLECTIONS.HISTORY.collectionName, data);
  return { ok: r.upsertCount, fail: rows.length - r.upsertCount };
}

export async function indexAssets(rows: AssetRow[]): Promise<{ ok: number; fail: number }> {
  if (rows.length === 0) return { ok: 0, fail: 0 };
  const cfg = await loadZillizConfig();
  if (!cfg.enabled) return { ok: 0, fail: rows.length };
  await ensureCollections(cfg);

  // 缺 prompt 的资产无法做语义索引，跳过
  const usable = rows.filter((r) => (r.prompt || "").trim().length > 0);
  if (usable.length === 0) return { ok: 0, fail: 0 };

  const texts = usable.map((r) => assetText(r));
  const vectors = await embedTexts(texts);
  const data = usable.map((r, i) => {
    const meta: AssetMeta = {
      type: r.type,
      platform: r.platform ?? null,
      category: r.category ?? null,
      refId: r.id,
      createdAt: ts(r.createdAt),
      prompt: shorten(r.prompt || "", 400),
      url: r.url || "",
    };
    return { id: r.id, vector: vectors[i], ...meta };
  });
  const r = await upsert(cfg, COLLECTIONS.ASSETS.collectionName, data);
  return { ok: r.upsertCount, fail: usable.length - r.upsertCount };
}

// ───────────────────────────────────────────────
// 搜索
// ───────────────────────────────────────────────

export interface SemanticSearchHit {
  id: string;
  score: number; // 0..1，越大越相似
  meta: Record<string, unknown>;
}

function toHit(h: SearchHit): SemanticSearchHit {
  // Zilliz cosine 返回 distance ∈ [-1, 1]，越大越相似
  const score = Math.max(0, Math.min(1, (Number(h.distance) + 1) / 2));
  return { id: h.id, score, meta: h.meta };
}

export async function searchHistory(
  query: string,
  opts: { topK?: number; filter?: string } = {},
): Promise<SemanticSearchHit[]> {
  const cfg = await loadZillizConfig();
  if (!cfg.enabled || !query.trim()) return [];
  const v = await embedOne(query);
  const hits = await search(cfg, COLLECTIONS.HISTORY.collectionName, v, {
    topK: opts.topK ?? 10,
    filter: opts.filter,
    outputFields: ["*"],
  });
  return hits.map(toHit);
}

export async function searchAssets(
  query: string,
  opts: { topK?: number; filter?: string } = {},
): Promise<SemanticSearchHit[]> {
  const cfg = await loadZillizConfig();
  if (!cfg.enabled || !query.trim()) return [];
  const v = await embedOne(query);
  const hits = await search(cfg, COLLECTIONS.ASSETS.collectionName, v, {
    topK: opts.topK ?? 10,
    filter: opts.filter,
    outputFields: ["*"],
  });
  return hits.map(toHit);
}

// ───────────────────────────────────────────────
// 状态
// ───────────────────────────────────────────────

export async function vectorStatus(): Promise<{
  enabled: boolean;
  endpoint: string;
  history: { exists: boolean; rows: number };
  assets: { exists: boolean; rows: number };
  error?: string;
}> {
  const cfg = await loadZillizConfig();
  const out = {
    enabled: cfg.enabled,
    endpoint: cfg.endpoint || "",
    history: { exists: false, rows: 0 },
    assets: { exists: false, rows: 0 },
  } as Awaited<ReturnType<typeof vectorStatus>>;
  if (!cfg.enabled || !cfg.endpoint || !cfg.token) return out;
  try {
    // v0.14-z88-status-fix: dedicated cluster 的 stats 不可信，用 query 直接数
    const hHist = await hasCollection(cfg, COLLECTIONS.HISTORY.collectionName);
    out.history.exists = hHist;
    if (hHist) {
      const stats = await statsCollection(cfg, COLLECTIONS.HISTORY.collectionName);
      out.history.rows = stats.rowCount;
    }
    const hAsset = await hasCollection(cfg, COLLECTIONS.ASSETS.collectionName);
    out.assets.exists = hAsset;
    if (hAsset) {
      const stats = await statsCollection(cfg, COLLECTIONS.ASSETS.collectionName);
      out.assets.rows = stats.rowCount;
    }
  } catch (e) {
    out.error = (e as Error).message || String(e);
  }
  return out;
}
