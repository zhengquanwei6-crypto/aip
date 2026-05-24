/**
 * v0.11 B7 + B9：内置 adapter 预设种子
 *
 * v0.11 B7：sizes / qualities 池（已有）
 * v0.11 B9：aspectRatios / supportsImg2Img / img2imgFlow（本批新增）
 *
 * Image-to-Image 文档调研（精简核对，详见 D:\xm\design-ai-ops-v0.11-b9-img2img-aspect-ratio.md §一）：
 *
 *   ✅ KIE.AI gpt-image-2          → /jobs/createTask 模型 'gpt-image-2-image-to-image'，input.image_urls[]（外链）
 *   ✅ KIE.AI flux-kontext-pro     → 同 /flux/kontext/generate，body.inputImage 字段（外链 / dataUri）
 *   ✅ OpenAI 兼容 gpt-image-2     → /v1/images/edits（multipart：image[] + prompt + size + quality）
 *   ✅ 4router-gpt-image-2         → 同 OpenAI /v1/images/edits（OpenAI 协议）
 *   ❌ OpenAI DALL-E 3              → API 层无 i2i（/v1/images/edits 不支持 dall-e-3 模型）
 *   ❌ generic-openai-compatible    → 占位 adapter，默认禁用 i2i（如需可手改 setting JSON）
 *
 * 注：multipart 路径的 i2i bodyTemplate 用一个 marker：
 *     bodyTemplate.__contentType === 'multipart/form-data' 时，adapter-runtime 会按 fields 数组拼 FormData。
 *
 * 比例预设（aspectRatios）按官方文档：
 *
 *   kie/4router/openai-gpt-img-2 (gpt-image-2)：1:1 / 16:9 / 9:16 / 4:3 / 3:4
 *     → sizeRule 留空（kie-* 用 aspect_ratio + resolution；OpenAI 无 sizeRule 也兜得住）
 *   openai-dalle-3：1:1 (1024x1024) / 16:9 (1792x1024) / 9:16 (1024x1792)（DALL-E 3 三档官方尺寸）
 *   kie-flux-kontext-pro：1:1 / 16:9 / 9:16 / 4:3 / 3:4 / 21:9
 *   generic-openai-compatible：1:1
 */

import type {
  AdapterConfig,
  SizePreset,
  QualityPreset,
  AspectRatioPreset,
  AdapterFlow,
} from '@/lib/adapter-types';

// ──────────────────────────────────────────────────────────
// 共享池常量
// ──────────────────────────────────────────────────────────

/** kie-gpt-image-2 / openai-gpt-img-2 / 4router-gpt-image-2 共用 */
const SIZES_GPT_IMAGE_2: SizePreset[] = [
  { label: '1K(1024)', value: '1024x1024', tier: '1k' },
  { label: '2K(2048)', value: '2048x2048', tier: '2k' },
  { label: '4K(3840×2160)', value: '3840x2160', tier: '4k' },
];
const QUALITIES_GPT_IMAGE_2: QualityPreset[] = [
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' },
];
/** kie / 4router / openai-gpt-img-2：5 档比例（gpt-image-2 官方支持 1:1 / 16:9 / 9:16 / 4:3 / 3:4） */
const ASPECT_RATIOS_GPT_IMAGE_2: AspectRatioPreset[] = [
  { label: '正方形 1:1', ratio: '1:1', sizeRule: '1024x1024' },
  { label: '横屏 16:9', ratio: '16:9', sizeRule: '' },
  { label: '竖屏 9:16', ratio: '9:16', sizeRule: '' },
  { label: '标准 4:3', ratio: '4:3', sizeRule: '' },
  { label: '竖标准 3:4', ratio: '3:4', sizeRule: '' },
];

/** kie-flux-kontext-pro */
const SIZES_FLUX: SizePreset[] = [
  { label: '方图1024', value: '1024x1024', tier: '1k' },
  { label: '竖图3:4', value: '768x1024', tier: '1k' },
  { label: '竖图9:16', value: '720x1280', tier: '1k' },
];
const QUALITIES_FLUX: QualityPreset[] = [
  { label: '标准', value: 'standard' },
  { label: '高清', value: 'hd' },
];
/** flux-kontext-pro 支持 1:1 / 16:9 / 9:16 / 4:3 / 3:4 / 21:9（kie quickstart 标列） */
const ASPECT_RATIOS_FLUX: AspectRatioPreset[] = [
  { label: '正方形 1:1', ratio: '1:1', sizeRule: '1024x1024' },
  { label: '横屏 16:9', ratio: '16:9', sizeRule: '' },
  { label: '竖屏 9:16', ratio: '9:16', sizeRule: '720x1280' },
  { label: '标准 4:3', ratio: '4:3', sizeRule: '' },
  { label: '竖标准 3:4', ratio: '3:4', sizeRule: '768x1024' },
  { label: '超宽 21:9', ratio: '21:9', sizeRule: '' },
];

/** openai-dalle-3 三档官方尺寸 + 三档比例 */
const SIZES_DALLE3: SizePreset[] = [
  { label: '方图1024', value: '1024x1024', tier: '1k' },
  { label: '竖图1792', value: '1024x1792', tier: '2k' },
  { label: '横图1792', value: '1792x1024', tier: '2k' },
];
const QUALITIES_DALLE3: QualityPreset[] = [
  { label: '标准', value: 'standard' },
  { label: '高清', value: 'hd' },
];
const ASPECT_RATIOS_DALLE3: AspectRatioPreset[] = [
  { label: '正方形 1:1', ratio: '1:1', sizeRule: '1024x1024' },
  { label: '横屏 16:9', ratio: '16:9', sizeRule: '1792x1024' },
  { label: '竖屏 9:16', ratio: '9:16', sizeRule: '1024x1792' },
];

/** generic-openai-compatible：仅一档 1024 + 1:1 */
const SIZES_GENERIC: SizePreset[] = [
  { label: '1024', value: '1024x1024', tier: '1k' },
];
const QUALITIES_GENERIC: QualityPreset[] = [];
const ASPECT_RATIOS_GENERIC: AspectRatioPreset[] = [
  { label: '正方形 1:1', ratio: '1:1', sizeRule: '1024x1024' },
];

// ──────────────────────────────────────────────────────────
// v0.11 B9：图生图 flow 定义
// ──────────────────────────────────────────────────────────

/**
 * KIE GPT Image 2 image-to-image：
 *   - 同样 /jobs/createTask submit
 *   - model 改为 'gpt-image-2-image-to-image'
 *   - input.image_urls 接收外链数组（必填 ≥ 1）
 *   - 其他与 t2i 相同
 */
const KIE_GPT_IMAGE_2_I2I_FLOW: AdapterFlow = {
  type: 'async-polling',
  submit: {
    endpoint: { method: 'POST', path: '/jobs/createTask' },
    request: {
      contentType: 'application/json',
      bodyTemplate: {
        model: 'gpt-image-2-image-to-image',
        input: {
          prompt: '{prompt}',
          image_urls: '{extra.imageUrls}',
          aspect_ratio: '{extra.aspectRatio}',
          resolution: '{extra.resolution}',
          output_format: 'png',
        },
      },
    },
    response: { taskIdPath: 'data.taskId', errorPath: 'msg' },
  },
  poll: {
    endpoint: { method: 'GET', path: '/jobs/recordInfo?taskId={taskId}' },
    intervalMs: 4000,
    timeoutMs: 600000,
    statusPath: 'data.state',
    doneStatuses: ['success'],
    failStatuses: ['fail'],
    imageUrlPath: 'data.resultJson>>resultUrls[*]',
    errorPath: 'data.failMsg',
  },
};

/**
 * KIE Flux Kontext Pro 主要就是 i2i 模型 — submit endpoint 与 t2i 完全一致，
 * 只是多了 inputImage 字段（kie quickstart 文档：inputImage 接外链 / data URI）。
 * 因此把 t2i flow 复制一份，bodyTemplate 多一个 inputImage 字段；
 * 当 inputImage 为空字符串时，flux-kontext-pro 会自动按 t2i 处理（向后兼容）。
 */
const KIE_FLUX_I2I_FLOW: AdapterFlow = {
  type: 'async-polling',
  submit: {
    endpoint: { method: 'POST', path: '/flux/kontext/generate' },
    request: {
      contentType: 'application/json',
      bodyTemplate: {
        prompt: '{prompt}',
        inputImage: '{sourceImage}',
        aspectRatio: '{extra.aspectRatio}',
        model: 'flux-kontext-pro',
        outputFormat: 'jpeg',
        enableTranslation: true,
        promptUpsampling: false,
      },
    },
    response: { taskIdPath: 'data.taskId', errorPath: 'msg' },
  },
  poll: {
    endpoint: { method: 'GET', path: '/flux/kontext/record-info?taskId={taskId}' },
    intervalMs: 4000,
    timeoutMs: 300000,
    statusPath: 'data.successFlag',
    doneStatuses: ['1'],
    failStatuses: ['2', '3'],
    imageUrlPath: 'data.response.resultImageUrl',
    errorPath: 'data.errorMessage',
  },
};

/**
 * OpenAI 兼容 /v1/images/edits（multipart）— 给 openai-gpt-img-2 / 4router-gpt-image-2 共用。
 * 用 marker bodyTemplate.__contentType: 'multipart/form-data' 让 adapter-runtime 走 FormData 路径；
 * fields 数组每条 { name, value, filename? }，filename 非空表示是 file part（base64 解码后塞进去）。
 */
const OPENAI_EDITS_I2I_FLOW: AdapterFlow = {
  type: 'sync',
  endpoint: { method: 'POST', path: '/images/edits' },
  request: {
    contentType: 'multipart/form-data',
    bodyTemplate: {
      __contentType: 'multipart/form-data',
      fields: [
        { name: 'prompt', value: '{prompt}' },
        { name: 'size', value: '{size}' },
        { name: 'quality', value: '{quality}' },
        { name: 'n', value: '1' },
        { name: 'image', value: '{sourceImageBase64}', filename: 'source.png', contentType: 'image/png' },
      ],
    },
  },
  response: { imageUrlPath: 'data[*].url', errorPath: 'error.message' },
};

/** OpenAI 兼容 gpt-img-2 (/images/edits 强制 model 字段) */
const OPENAI_GPT_IMG_2_I2I_FLOW: AdapterFlow = {
  type: 'sync',
  endpoint: { method: 'POST', path: '/images/edits' },
  request: {
    contentType: 'multipart/form-data',
    bodyTemplate: {
      __contentType: 'multipart/form-data',
      fields: [
        { name: 'model', value: 'gpt-img-2' },
        { name: 'prompt', value: '{prompt}' },
        { name: 'size', value: '{size}' },
        { name: 'quality', value: '{quality}' },
        { name: 'n', value: '1' },
        { name: 'image', value: '{sourceImageBase64}', filename: 'source.png', contentType: 'image/png' },
      ],
    },
  },
  response: { imageUrlPath: 'data[*].url', errorPath: 'error.message' },
};

// ──────────────────────────────────────────────────────────
// PRESETS：5 内置 adapter（含 v0.11 B7 sizes/qualities + B9 aspectRatios/supportsImg2Img/img2imgFlow）
// ──────────────────────────────────────────────────────────

export const PRESETS: AdapterConfig[] = [
  // 1. KIE.AI · GPT Image 2
  {
    slug: 'kie-gpt-image-2',
    name: 'KIE.AI · GPT Image 2 文生图 + 图生图',
    baseUrl: 'https://api.kie.ai/api/v1',
    sourceUrl: 'https://docs.kie.ai/',
    description: 'KIE.AI 中转站的 GPT Image 2，支持文生图 + 图生图（image-to-image）。i2i 走单独 model gpt-image-2-image-to-image。',
    auth: { type: 'bearer', headerName: 'Authorization', valueTemplate: 'Bearer {API_KEY}' },
    flow: {
      type: 'async-polling',
      submit: {
        endpoint: { method: 'POST', path: '/jobs/createTask' },
        request: {
          contentType: 'application/json',
          bodyTemplate: {
            model: 'gpt-image-2-text-to-image',
            input: {
              prompt: '{prompt}',
              aspect_ratio: '{extra.aspectRatio}',
              resolution: '{extra.resolution}',
              output_format: 'png',
            },
          },
        },
        response: { taskIdPath: 'data.taskId', errorPath: 'msg' },
      },
      poll: {
        endpoint: { method: 'GET', path: '/jobs/recordInfo?taskId={taskId}' },
        intervalMs: 4000,
        timeoutMs: 600000,
        statusPath: 'data.state',
        doneStatuses: ['success'],
        failStatuses: ['fail'],
        imageUrlPath: 'data.resultJson>>resultUrls[*]',
        errorPath: 'data.failMsg',
      },
    },
    enabled: true,
    sizes: SIZES_GPT_IMAGE_2,
    qualities: QUALITIES_GPT_IMAGE_2,
    aspectRatios: ASPECT_RATIOS_GPT_IMAGE_2,
    supportsImg2Img: true,
    img2imgFlow: KIE_GPT_IMAGE_2_I2I_FLOW,
  },

  // 2. KIE.AI · Flux Kontext Pro（主打 i2i）
  {
    slug: 'kie-flux-kontext-pro',
    name: 'KIE.AI · Flux Kontext Pro（专注 i2i）',
    baseUrl: 'https://api.kie.ai/api/v1',
    description: 'KIE.AI Flux Kontext Pro 主打图像编辑（i2i），inputImage 字段接外链 / data URI；空时降级 t2i。',
    auth: { type: 'bearer', headerName: 'Authorization', valueTemplate: 'Bearer {API_KEY}' },
    flow: {
      type: 'async-polling',
      submit: {
        endpoint: { method: 'POST', path: '/flux/kontext/generate' },
        request: {
          contentType: 'application/json',
          bodyTemplate: {
            prompt: '{prompt}',
            aspectRatio: '{extra.aspectRatio}',
            model: 'flux-kontext-pro',
            outputFormat: 'jpeg',
            enableTranslation: true,
            promptUpsampling: false,
          },
        },
        response: { taskIdPath: 'data.taskId', errorPath: 'msg' },
      },
      poll: {
        endpoint: { method: 'GET', path: '/flux/kontext/record-info?taskId={taskId}' },
        intervalMs: 4000,
        timeoutMs: 300000,
        statusPath: 'data.successFlag',
        doneStatuses: ['1'],
        failStatuses: ['2', '3'],
        imageUrlPath: 'data.response.resultImageUrl',
        errorPath: 'data.errorMessage',
      },
    },
    enabled: true,
    sizes: SIZES_FLUX,
    qualities: QUALITIES_FLUX,
    aspectRatios: ASPECT_RATIOS_FLUX,
    supportsImg2Img: true,
    img2imgFlow: KIE_FLUX_I2I_FLOW,
  },

  // 3. OpenAI 兼容 · DALL-E 3（不支持 i2i）
  {
    slug: 'openai-dalle-3',
    name: 'OpenAI 兼容 · DALL-E 3（仅 t2i）',
    baseUrl: 'https://api.openai.com/v1',
    description: 'DALL-E 3 在 OpenAI API 层不支持 image-to-image（/images/edits 不接受 dall-e-3 模型）。',
    auth: { type: 'bearer', headerName: 'Authorization', valueTemplate: 'Bearer {API_KEY}' },
    flow: {
      type: 'sync',
      endpoint: { method: 'POST', path: '/images/generations' },
      request: {
        contentType: 'application/json',
        bodyTemplate: {
          model: 'dall-e-3',
          prompt: '{prompt}',
          size: '{size}',
          n: 1,
          quality: '{quality}',
        },
      },
      response: { imageUrlPath: 'data[*].url', errorPath: 'error.message' },
    },
    enabled: false,
    sizes: SIZES_DALLE3,
    qualities: QUALITIES_DALLE3,
    aspectRatios: ASPECT_RATIOS_DALLE3,
    supportsImg2Img: false,
  },

  // 4. OpenAI 兼容 · GPT-IMG-2（支持 /images/edits）
  {
    slug: 'openai-gpt-img-2',
    name: 'OpenAI 兼容 · GPT-IMG-2（t2i + i2i）',
    baseUrl: 'https://api.openai.com/v1',
    description: 'OpenAI gpt-image-2 同步接口；i2i 走 /v1/images/edits（multipart：image + prompt + size + quality）。',
    auth: { type: 'bearer', headerName: 'Authorization', valueTemplate: 'Bearer {API_KEY}' },
    flow: {
      type: 'sync',
      endpoint: { method: 'POST', path: '/images/generations' },
      request: {
        contentType: 'application/json',
        bodyTemplate: {
          model: 'gpt-img-2',
          prompt: '{prompt}',
          size: '{size}',
          quality: '{quality}',
          n: 1,
        },
      },
      response: { imageUrlPath: 'data[*].url', errorPath: 'error.message' },
    },
    enabled: false,
    sizes: SIZES_GPT_IMAGE_2,
    qualities: QUALITIES_GPT_IMAGE_2,
    aspectRatios: ASPECT_RATIOS_GPT_IMAGE_2,
    supportsImg2Img: true,
    img2imgFlow: OPENAI_GPT_IMG_2_I2I_FLOW,
  },

  // 5. 通用 OpenAI 兼容（占位，默认禁用 i2i）
  {
    slug: 'generic-openai-compatible',
    name: '通用 OpenAI 兼容（占位）',
    baseUrl: 'https://your-relay.example.com/v1',
    description: '占位 adapter；不预设 i2i flow，需用户自行编辑。',
    auth: { type: 'bearer', headerName: 'Authorization', valueTemplate: 'Bearer {API_KEY}' },
    flow: {
      type: 'sync',
      endpoint: { method: 'POST', path: '/images/generations' },
      request: {
        contentType: 'application/json',
        bodyTemplate: {
          prompt: '{prompt}',
          size: '{size}',
          n: 1,
        },
      },
      response: { imageUrlPath: 'data[*].url', errorPath: 'error.message' },
    },
    enabled: false,
    sizes: SIZES_GENERIC,
    qualities: QUALITIES_GENERIC,
    aspectRatios: ASPECT_RATIOS_GENERIC,
    supportsImg2Img: false,
  },
];

/**
 * v0.11 B7：4router-gpt-image-2 不在 PRESETS，但用户在生产中已创建。
 * v0.11 B9：扩展 SLUG_PRESET_MAP，加 aspectRatios + supportsImg2Img + img2imgFlow。
 *
 * migrate-presets 端点把这些字段 merge 进现有 Setting JSON。
 */
export const SLUG_PRESET_MAP: Record<
  string,
  {
    sizes: SizePreset[];
    qualities: QualityPreset[];
    aspectRatios: AspectRatioPreset[];
    supportsImg2Img: boolean;
    img2imgFlow?: AdapterFlow;
  }
> = {
  'kie-gpt-image-2': {
    sizes: SIZES_GPT_IMAGE_2,
    qualities: QUALITIES_GPT_IMAGE_2,
    aspectRatios: ASPECT_RATIOS_GPT_IMAGE_2,
    supportsImg2Img: true,
    img2imgFlow: KIE_GPT_IMAGE_2_I2I_FLOW,
  },
  'kie-flux-kontext-pro': {
    sizes: SIZES_FLUX,
    qualities: QUALITIES_FLUX,
    aspectRatios: ASPECT_RATIOS_FLUX,
    supportsImg2Img: true,
    img2imgFlow: KIE_FLUX_I2I_FLOW,
  },
  'openai-dalle-3': {
    sizes: SIZES_DALLE3,
    qualities: QUALITIES_DALLE3,
    aspectRatios: ASPECT_RATIOS_DALLE3,
    supportsImg2Img: false,
  },
  'openai-gpt-img-2': {
    sizes: SIZES_GPT_IMAGE_2,
    qualities: QUALITIES_GPT_IMAGE_2,
    aspectRatios: ASPECT_RATIOS_GPT_IMAGE_2,
    supportsImg2Img: true,
    img2imgFlow: OPENAI_GPT_IMG_2_I2I_FLOW,
  },
  'generic-openai-compatible': {
    sizes: SIZES_GENERIC,
    qualities: QUALITIES_GENERIC,
    aspectRatios: ASPECT_RATIOS_GENERIC,
    supportsImg2Img: false,
  },
  // 4router 与 kie-gpt-image-2 拓扑一致 → 用同一档位 + 同一 i2i flow（OpenAI /images/edits multipart）
  '4router-gpt-image-2': {
    sizes: SIZES_GPT_IMAGE_2,
    qualities: QUALITIES_GPT_IMAGE_2,
    aspectRatios: ASPECT_RATIOS_GPT_IMAGE_2,
    supportsImg2Img: true,
    img2imgFlow: OPENAI_EDITS_I2I_FLOW,
  },
};
