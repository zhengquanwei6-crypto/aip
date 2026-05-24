// API 适配器类型与 Zod schema（修正：sourceUrl/description 改为 nullable + optional）
//
// 一个 adapter 描述如何调用一家"OpenAI 兼容 / 自定义"图片生成中转站：
//   - sync 类型：一次请求即返回图片 URL（DALL-E 3 风格）
//   - async-polling 类型：先 POST 创建任务拿 taskId，再 GET 轮询拿结果（KIE.AI 风格）
//
// v0.11 B7（图片尺寸/质量预设池）：
//   - 增 sizes?: SizePreset[]  → 每个 adapter 可声明支持哪些尺寸（label/value/tier）
//   - 增 qualities?: QualityPreset[] → 每个 adapter 可声明支持哪些质量档（low/medium/high or standard/hd）
//   - 不破坏 generateInputSchema.size / quality（保留为 optional 字符串占位）
//   - 旧 adapter Setting JSON 没有 sizes / qualities 时按 nullish 解析，行为完全兼容

import { z } from "zod";

// ──────────────────────────────────────────────────────────
// 通用片段
// ──────────────────────────────────────────────────────────

const httpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

const authSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("bearer"),
    headerName: z.string().default("Authorization"),
    valueTemplate: z.string().default("Bearer {API_KEY}"),
  }),
  z.object({
    type: z.literal("api-key-header"),
    headerName: z.string(),
    valueTemplate: z.string().default("{API_KEY}"),
  }),
  z.object({
    type: z.literal("query-param"),
    paramName: z.string(),
  }),
  z.object({
    type: z.literal("none"),
  }),
]);

const bodyTemplateSchema = z.unknown();

// ──────────────────────────────────────────────────────────
// sync 类型
// ──────────────────────────────────────────────────────────

const syncSchema = z.object({
  type: z.literal("sync"),
  endpoint: z.object({
    method: httpMethodSchema.default("POST"),
    path: z.string(),
    queryTemplate: z.record(z.string()).optional(),
  }),
  request: z.object({
    contentType: z.string().default("application/json"),
    bodyTemplate: bodyTemplateSchema.optional(),
  }),
  response: z.object({
    imageUrlPath: z.string(),
    errorPath: z.string().nullish(),
  }),
});

// ──────────────────────────────────────────────────────────
// async-polling 类型
// ──────────────────────────────────────────────────────────

const asyncPollingSchema = z.object({
  type: z.literal("async-polling"),
  submit: z.object({
    endpoint: z.object({
      method: httpMethodSchema.default("POST"),
      path: z.string(),
      queryTemplate: z.record(z.string()).optional(),
    }),
    request: z.object({
      contentType: z.string().default("application/json"),
      bodyTemplate: bodyTemplateSchema.optional(),
    }),
    response: z.object({
      taskIdPath: z.string(),
      errorPath: z.string().nullish(),
    }),
  }),
  poll: z.object({
    endpoint: z.object({
      method: httpMethodSchema.default("GET"),
      path: z.string(),
      queryTemplate: z.record(z.string()).optional(),
    }),
    intervalMs: z.number().int().positive().default(4000),
    timeoutMs: z.number().int().positive().default(600000),
    statusPath: z.string(),
    doneStatuses: z.array(z.string()).min(1),
    failStatuses: z.array(z.string()).default([]),
    imageUrlPath: z.string(),
    errorPath: z.string().nullish(),
  }),
});

// ──────────────────────────────────────────────────────────
// v0.11 B7：尺寸 / 质量预设池
// ──────────────────────────────────────────────────────────

export const sizePresetSchema = z.object({
  /** 给用户看的中文标签，例 "1K(1024)" / "竖图3:4" */
  label: z.string().min(1).max(64),
  /** 实际下发的 size 字符串，例 "1024x1024" / "768x1024" */
  value: z.string().min(1).max(32),
  /** 档位 hint：'1k' / '2k' / '4k'；用于 kie-* 这类 bodyTemplate 用 {extra.resolution} 的 adapter */
  tier: z.string().min(1).max(16).nullish(),
});
export type SizePreset = z.infer<typeof sizePresetSchema>;

export const qualityPresetSchema = z.object({
  /** 给用户看的中文标签，例 "高清" / "中" */
  label: z.string().min(1).max(32),
  /** 下发到 bodyTemplate 的 quality 字符串值，例 "hd" / "high" / "medium" */
  value: z.string().min(1).max(32),
});
export type QualityPreset = z.infer<typeof qualityPresetSchema>;

// ──────────────────────────────────────────────────────────
// 完整 Adapter 配置（关键修正：可选字段全用 nullish 兼容 null + undefined）
// ──────────────────────────────────────────────────────────

export const adapterConfigSchema = z.object({
  slug: z.string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, {
      message: "slug 只允许小写字母、数字、连字符",
    }),
  name: z.string().min(1).max(120),
  // nullish() == optional + nullable，能同时接受 undefined / null / 字符串
  sourceUrl: z.string().url().nullish(),
  description: z.string().max(2000).nullish(),
  baseUrl: z.string().url(),
  auth: authSchema,
  flow: z.discriminatedUnion("type", [syncSchema, asyncPollingSchema]),
  enabled: z.boolean().default(true),
  // v0.11 B7：尺寸 / 质量预设池（可选，nullish 兼容旧 row）
  sizes: z.array(sizePresetSchema).nullish(),
  qualities: z.array(qualityPresetSchema).nullish(),
  createdAt: z.string().datetime().nullish(),
  updatedAt: z.string().datetime().nullish(),
});

export type AdapterConfig = z.infer<typeof adapterConfigSchema>;
export type AdapterAuth = z.infer<typeof authSchema>;
export type AdapterFlow = AdapterConfig["flow"];

export const generateInputSchema = z.object({
  prompt: z.string().min(1).max(4000),
  size: z.string().nullish(),
  n: z.number().int().min(1).max(8).nullish(),
  imageUrl: z.string().url().nullish(),
  quality: z.string().nullish(),
  extra: z.record(z.unknown()).nullish(),
});
export type GenerateInput = z.infer<typeof generateInputSchema>;

export const dryRunResultSchema = z.object({
  ok: z.boolean(),
  imageUrls: z.array(z.string()).default([]),
  durationMs: z.number().nullish(),
  trace: z.object({
    submitRequest: z.unknown().nullish(),
    submitResponse: z.unknown().nullish(),
    pollHistory: z.array(z.object({
      at: z.string(),
      status: z.string().nullish(),
      raw: z.unknown().nullish(),
    })).nullish(),
  }).nullish(),
  error: z.string().nullish(),
});
export type DryRunResult = z.infer<typeof dryRunResultSchema>;

export const ADAPTER_SETTING_PREFIX = "adapter:";

export function adapterKey(slug: string): string {
  return `${ADAPTER_SETTING_PREFIX}${slug}`;
}

/**
 * v0.11 B7：取首个 size 预设作为缺省回退。
 *   - 老 imageOptions（无 size）→ 自动用 sizes[0].value（默认 1k 尺寸）
 *   - 没有 sizes 数组（旧 adapter row）→ 返回 null，由调用方继续用硬编码默认
 */
export function defaultSizeFromPresets(adapter: { sizes?: SizePreset[] | null }): SizePreset | null {
  const list = adapter.sizes;
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[0] ?? null;
}

/**
 * v0.11 B7：取首个 quality 预设作为缺省回退（同上）。
 */
export function defaultQualityFromPresets(adapter: { qualities?: QualityPreset[] | null }): QualityPreset | null {
  const list = adapter.qualities;
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[0] ?? null;
}
