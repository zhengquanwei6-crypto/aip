/**
 * Zilliz collection schema 定义。
 *
 * 两个 collection：
 *   - dao_history：AIOutput 表的语义索引
 *   - dao_assets ：Asset 表的语义索引
 *
 * embedding 维度统一 1536（text-embedding-3-small / bge-m3 等都是这个）。
 * 度量统一 COSINE，索引 HNSW (M=16, efConstruction=64)。
 */

export const EMBED_DIM = 1536;
export const METRIC = "COSINE" as const;

export interface ZillizCollectionSpec {
  collectionName: string;
  description: string;
  /** 用 dynamic field 模式：固定字段 = id + vector，其它元数据走 dynamic */
  dimension: number;
  metricType: typeof METRIC;
}

export const COLLECTIONS = {
  HISTORY: {
    collectionName: "dao_history",
    description:
      "AIOutput 语义索引 · 字段：id(PK) / vector / type / platform / source(input|output|both) / refId / createdAt(unix ms) / preview",
    dimension: EMBED_DIM,
    metricType: METRIC,
  } as ZillizCollectionSpec,
  ASSETS: {
    collectionName: "dao_assets",
    description:
      "Asset 语义索引 · 字段：id(PK) / vector / type / platform / category / refId / createdAt(unix ms) / prompt / url",
    dimension: EMBED_DIM,
    metricType: METRIC,
  } as ZillizCollectionSpec,
} as const;

export type CollectionKey = keyof typeof COLLECTIONS;

/** 索引到 Zilliz 时附带的元数据（dynamic 字段） */
export interface HistoryMeta {
  type: string;
  platform?: string | null;
  /** input / output / both —— 标记这条 vector 来自 AIOutput 哪一侧 */
  source: "input" | "output" | "both";
  refId: string; // AIOutput.id
  createdAt: number; // unix ms
  preview: string; // 前 200 字
}

export interface AssetMeta {
  type: string;
  platform?: string | null;
  category?: string | null;
  refId: string; // Asset.id
  createdAt: number; // unix ms
  prompt: string; // 前 400 字
  url: string;
}

export type AnyMeta = HistoryMeta | AssetMeta;
