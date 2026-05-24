/**
 * v0.11 B7：5 个内置 adapter 预设种子（含 sizes / qualities 池）
 *
 * 5 个预设对应路线图 / recon §五.C 的 adapter 列表：
 *   1. kie-gpt-image-2          (async-polling, 1k/2k/4k · low/medium/high)
 *   2. kie-flux-kontext-pro     (async-polling, 1024/768x1024/720x1280 · standard/hd)
 *   3. openai-dalle-3           (sync, 1024 / 1024x1792 / 1792x1024 · standard/hd)
 *   4. openai-gpt-img-2         (sync, 同 kie-gpt-image-2)
 *   5. generic-openai-compatible (sync, 仅 1024 · 无 qualities)
 *
 * 注意：4router-gpt-image-2 在 recon 中存在（VPS Setting 表已有），但旧 seed PRESETS 数组并未列出它。
 * 仍按用户原文 5 条建模；4router-gpt-image-2 通过 migrate-presets 端点单独 merge sizes/qualities。
 *
 * v0.11 B7 不改 schema：sizes / qualities 是 adapter Setting JSON 的可选字段。
 */

import type {
  AdapterConfig,
  SizePreset,
  QualityPreset,
} from '@/lib/adapter-types';

/** kie-gpt-image-2 / openai-gpt-img-2 / 4router-gpt-image-2 共用：1k/2k/4k + low/medium/high */
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

/** kie-flux-kontext-pro：方图 + 竖图（3:4 / 9:16）+ standard/hd */
const SIZES_FLUX: SizePreset[] = [
  { label: '方图1024', value: '1024x1024', tier: '1k' },
  { label: '竖图3:4', value: '768x1024', tier: '1k' },
  { label: '竖图9:16', value: '720x1280', tier: '1k' },
];
const QUALITIES_FLUX: QualityPreset[] = [
  { label: '标准', value: 'standard' },
  { label: '高清', value: 'hd' },
];

/** openai-dalle-3：DALL-E 3 三档官方尺寸 + standard/hd */
const SIZES_DALLE3: SizePreset[] = [
  { label: '方图1024', value: '1024x1024', tier: '1k' },
  { label: '竖图1792', value: '1024x1792', tier: '2k' },
  { label: '横图1792', value: '1792x1024', tier: '2k' },
];
const QUALITIES_DALLE3: QualityPreset[] = [
  { label: '标准', value: 'standard' },
  { label: '高清', value: 'hd' },
];

/** generic-openai-compatible：仅一档 1024，无 qualities */
const SIZES_GENERIC: SizePreset[] = [
  { label: '1024', value: '1024x1024', tier: '1k' },
];
const QUALITIES_GENERIC: QualityPreset[] = [];

/** 5 个内置 adapter 完整定义（含 sizes / qualities） */
export const PRESETS: AdapterConfig[] = [
  // 1. KIE.AI · GPT Image 2
  {
    slug: 'kie-gpt-image-2',
    name: 'KIE.AI · GPT Image 2 文生图',
    baseUrl: 'https://api.kie.ai/api/v1',
    sourceUrl: 'https://docs.kie.ai/',
    description: 'KIE.AI 中转站的 GPT Image 2 文生图，异步轮询。支持 1K/2K/4K 与多种长宽比。',
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
  },

  // 2. KIE.AI · Flux Kontext Pro
  {
    slug: 'kie-flux-kontext-pro',
    name: 'KIE.AI · Flux Kontext Pro',
    baseUrl: 'https://api.kie.ai/api/v1',
    description: 'KIE.AI 中转站的 Flux Kontext Pro，异步轮询，successFlag=1 完成。',
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
  },

  // 3. OpenAI 兼容 · DALL-E 3
  {
    slug: 'openai-dalle-3',
    name: 'OpenAI 兼容 · DALL-E 3',
    baseUrl: 'https://api.openai.com/v1',
    description: '任何兼容 OpenAI /v1/images/generations 接口的中转站都能用，模型设为 dall-e-3。',
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
      response: {
        imageUrlPath: 'data[*].url',
        errorPath: 'error.message',
      },
    },
    enabled: false, // 默认禁用，用户启用并填 baseUrl 后才用
    sizes: SIZES_DALLE3,
    qualities: QUALITIES_DALLE3,
  },

  // 4. OpenAI 兼容 · GPT-IMG-2（同 kie-gpt-image-2 池）
  {
    slug: 'openai-gpt-img-2',
    name: 'OpenAI 兼容 · GPT-IMG-2',
    baseUrl: 'https://api.openai.com/v1',
    description: 'OpenAI 兼容协议下的 gpt-img-2 同步接口。',
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
      response: {
        imageUrlPath: 'data[*].url',
        errorPath: 'error.message',
      },
    },
    enabled: false,
    sizes: SIZES_GPT_IMAGE_2,
    qualities: QUALITIES_GPT_IMAGE_2,
  },

  // 5. 通用 OpenAI 兼容（占位）
  {
    slug: 'generic-openai-compatible',
    name: '通用 OpenAI 兼容（占位）',
    baseUrl: 'https://your-relay.example.com/v1',
    description: '把 baseUrl 改成你的中转站地址即可用。模型名通过 Setting.IMAGE_MODEL 切换。',
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
      response: {
        imageUrlPath: 'data[*].url',
        errorPath: 'error.message',
      },
    },
    enabled: false,
    sizes: SIZES_GENERIC,
    qualities: QUALITIES_GENERIC,
  },
];

/**
 * v0.11 B7：4router-gpt-image-2 不在 PRESETS 数组里（它由用户在生产中自行创建），
 * 但同样需要 sizes/qualities 池。migrate-presets 端点会按 slug 匹配 SLUG_PRESET_MAP，
 * 把对应的 sizes/qualities merge 进现有 Setting JSON。
 */
export const SLUG_PRESET_MAP: Record<string, { sizes: SizePreset[]; qualities: QualityPreset[] }> = {
  'kie-gpt-image-2':            { sizes: SIZES_GPT_IMAGE_2, qualities: QUALITIES_GPT_IMAGE_2 },
  'kie-flux-kontext-pro':       { sizes: SIZES_FLUX,        qualities: QUALITIES_FLUX        },
  'openai-dalle-3':             { sizes: SIZES_DALLE3,      qualities: QUALITIES_DALLE3      },
  'openai-gpt-img-2':           { sizes: SIZES_GPT_IMAGE_2, qualities: QUALITIES_GPT_IMAGE_2 },
  'generic-openai-compatible':  { sizes: SIZES_GENERIC,     qualities: QUALITIES_GENERIC     },
  // 4router 与 kie-gpt-image-2 拓扑一致 → 用同一档位
  '4router-gpt-image-2':        { sizes: SIZES_GPT_IMAGE_2, qualities: QUALITIES_GPT_IMAGE_2 },
};
