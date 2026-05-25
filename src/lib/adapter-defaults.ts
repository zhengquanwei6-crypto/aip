/**
 * lib/adapter-defaults.ts — adapter 池字段兜底
 *
 * 目的：用户用 LLM 文档分析新建的 adapter（cometapi 等）通常没填 sizes/qualities/aspectRatios，
 * 导致前端下拉空白。这里在 GET 接口返回前补上一个合理默认值（OpenAI gpt-image-2 协议默认 3 档）。
 *
 * 不写库，只在响应里补全。用户可在编辑页里改后保存覆盖。
 */
import type { AdapterConfig } from './adapter-types';

const DEFAULT_SIZES = [
  { label: '方图 1024×1024', value: '1024x1024', tier: '1k' as const },
  { label: '竖图 1024×1536（2:3）', value: '1024x1536', tier: '1k' as const },
  { label: '横图 1536×1024（3:2）', value: '1536x1024', tier: '1k' as const },
];

const DEFAULT_QUALITIES = [
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' },
];

const DEFAULT_ASPECT_RATIOS = [
  { label: '正方形 1:1', ratio: '1:1', sizeRule: '1024x1024' },
  { label: '横屏 3:2', ratio: '3:2', sizeRule: '1536x1024' },
  { label: '竖屏 2:3', ratio: '2:3', sizeRule: '1024x1536' },
];



/**
 * v0.13 B2 fix-B：给「OpenAI /v1/images/generations 协议」的 adapter 自动补
 * multipart /v1/images/edits 形式的 img2imgFlow。
 *
 * 触发条件：
 *   - adapter.supportsImg2Img !== false
 *   - adapter.img2imgFlow 缺失
 *   - adapter.flow.endpoint.path 含 'images/generations' 或 'images/edits'
 *
 * 沿用 v0.11 B11 给 4router-gpt-image-2 的同款 multipart 配置。
 *
 * 不写库，仅运行时返回前补全（loadAdapter 也调一次让真生图链路也受益）。
 */
export function ensureI2iFlow(adapter: AdapterConfig): AdapterConfig {
  if (adapter.supportsImg2Img === false) return adapter;
  if (adapter.img2imgFlow) return adapter;
  const path = (adapter.flow as any)?.endpoint?.path || '';
  if (typeof path !== 'string') return adapter;
  if (!/images\/(generations|edits)/i.test(path)) return adapter;

  // 推 model：从 adapter.flow.bodyTemplate.model 取
  const flowModel: any = (adapter.flow as any)?.request?.bodyTemplate?.model;
  const modelStr =
    typeof flowModel === 'string' && flowModel.trim() ? flowModel.trim() : 'gpt-image-2';

  const out: any = { ...adapter };
  out.supportsImg2Img = true;
  out.img2imgFlow = {
    type: 'sync',
    endpoint: { method: 'POST', path: '/v1/images/edits' },
    request: {
      contentType: 'multipart/form-data',
      bodyTemplate: {
        __contentType: 'multipart/form-data',
        fields: [
          { name: 'model', value: modelStr },
          { name: 'prompt', value: '{prompt}' },
          { name: 'size', value: '{size}' },
          { name: 'n', value: '{n}' },
          {
            name: 'image',
            value: '{sourceImageBase64}',
            filename: 'source.png',
            contentType: 'image/png',
          },
        ],
      },
    },
    response: { imageUrlPath: 'data[*]' },
  };
  return out as AdapterConfig;
}

export function ensureAdapterCapabilities(adapter: AdapterConfig): AdapterConfig {
  const out = { ...adapter };
  if (!Array.isArray(out.sizes) || out.sizes.length === 0) {
    out.sizes = DEFAULT_SIZES as any;
  }
  if (!Array.isArray(out.qualities) || out.qualities.length === 0) {
    out.qualities = DEFAULT_QUALITIES as any;
  }
  if (!Array.isArray(out.aspectRatios) || out.aspectRatios.length === 0) {
    out.aspectRatios = DEFAULT_ASPECT_RATIOS as any;
  }
  if (out.supportsImg2Img === undefined || out.supportsImg2Img === null) {
    out.supportsImg2Img = true;
  }
  // v0.13 B2 fix-B: 自动补 multipart i2i flow（OpenAI 兼容 adapter）
  return ensureI2iFlow(out);
}
