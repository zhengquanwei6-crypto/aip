// API 适配器类型与 Zod schema（修正：sourceUrl/description 改为 nullable + optional）
//
// 一个 adapter 描述如何调用一家"OpenAI 兼容 / 自定义"图片生成中转站：
//   - sync 类型：一次请求即返回图片 URL（DALL-E 3 风格）
//   - async-polling 类型：先 POST 创建任务拿 taskId，再 GET 轮询拿结果（KIE.AI 风格）
//
// v0.11 B7（图片尺寸/质量预设池）：
//   - 增 sizes?: SizePreset[]
//   - 增 qualities?: QualityPreset[]
//
// v0.11 B9（图生图 + 图片比例预设）：
//   - 增 aspectRatios?: AspectRatioPreset[]
//   - 增 supportsImg2Img?: boolean
//   - 增 img2imgFlow?: AdapterFlow（可选；若 adapter 的 i2i 端点与 t2i 端点相同则可省略，
//     仅靠 bodyTemplate 中的 {sourceImage} / {sourceImageBase64} 占位即可。
//     KIE GPT Image 2 i2i 用单独 endpoint，所以会指定 img2imgFlow）

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
  /** 档位 hint：'1k' / '2k' / '4k' */
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
// v0.11 B9：图片比例预设池
// ──────────────────────────────────────────────────────────

/**
 * 一条比例预设。adapter 切到这条比例时：
 *   - 自动用 sizeRule 决定下发尺寸（如 "1792x1024"），优先级高于 sizes 池
 *   - 把 ratio 字符串（"16:9"）注入 vars.aspectRatio 给 bodyTemplate（kie-* 用此占位符）
 *   - sizeRule 可以为空 → 此时仅作 hint，不影响 size
 */
export const aspectRatioPresetSchema = z.object({
  /** 给用户看的中文标签，例 "正方形" / "横屏 16:9" */
  label: z.string().min(1).max(64),
  /** 标准比例字符串，例 "1:1" / "16:9" / "9:16" / "4:3" / "3:4" / "21:9" */
  ratio: z.string().min(1).max(16).regex(/^\d{1,3}:\d{1,3}$/, { message: 'ratio 必须是 W:H 格式' }),
  /**
   * 选了这条比例时，adapter 实际下发的 size 字符串。
   *   - openai-dalle-3 1:1 → "1024x1024"
   *   - openai-dalle-3 16:9 → "1792x1024"
   *   - kie-gpt-image-2 16:9 → "" （由 aspect_ratio + resolution 协商；留空表示不强写 size）
   */
  sizeRule: z.string().max(32).nullish(),
});
export type AspectRatioPreset = z.infer<typeof aspectRatioPresetSchema>;

// ──────────────────────────────────────────────────────────
// 完整 Adapter 配置
// ──────────────────────────────────────────────────────────

export const adapterConfigSchema = z.object({
  slug: z.string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, {
      message: "slug 只允许小写字母、数字、连字符",
    }),
  name: z.string().min(1).max(120),
  // nullish() == optional + nullable
  sourceUrl: z.string().url().nullish(),
  description: z.string().max(2000).nullish(),
  baseUrl: z.string().url(),
  auth: authSchema,
  flow: z.discriminatedUnion("type", [syncSchema, asyncPollingSchema]),
  enabled: z.boolean().default(true),
  // v0.11 B7
  sizes: z.array(sizePresetSchema).nullish(),
  qualities: z.array(qualityPresetSchema).nullish(),
  // v0.11 B9
  aspectRatios: z.array(aspectRatioPresetSchema).nullish(),
  supportsImg2Img: z.boolean().nullish(),
  /**
   * v0.11 B9：图生图专用流（可选）。
   *   - 缺省时（undefined）：i2i 与 t2i 共用 flow；前端把 sourceImageUrl/sourceImageBase64 透传给
   *     bodyTemplate 的 {sourceImage}/{sourceImageBase64}/{extra.image_urls} 等占位。
   *   - 提供时：i2i 专用走这条 flow（KIE GPT Image 2 用单独 endpoint /jobs/createTask + 不同 model）
   */
  img2imgFlow: z.discriminatedUnion("type", [syncSchema, asyncPollingSchema]).nullish(),
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
  /** v0.11 B9：图生图源图（外链）。生效条件：mode==='i2i' & adapter.supportsImg2Img */
  sourceImageUrl: z.string().nullish(),
  /** v0.11 B9：图生图源图（base64 串，不带 data: 前缀）。优先级低于 sourceImageUrl */
  sourceImageBase64: z.string().nullish(),
  /** v0.11 B9：用户选择的比例字符串（"1:1"/"16:9"...）→ 注入 extra.aspectRatio */
  aspectRatio: z.string().nullish(),
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
 */
export function defaultSizeFromPresets(adapter: { sizes?: SizePreset[] | null }): SizePreset | null {
  const list = adapter.sizes;
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[0] ?? null;
}

/**
 * v0.11 B7：取首个 quality 预设作为缺省回退。
 */
export function defaultQualityFromPresets(adapter: { qualities?: QualityPreset[] | null }): QualityPreset | null {
  const list = adapter.qualities;
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[0] ?? null;
}

/**
 * v0.11 B9：取首个 aspectRatio 预设作为缺省回退。
 */
export function defaultAspectRatioFromPresets(adapter: { aspectRatios?: AspectRatioPreset[] | null }): AspectRatioPreset | null {
  const list = adapter.aspectRatios;
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[0] ?? null;
}
