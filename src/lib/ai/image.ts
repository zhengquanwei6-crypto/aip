/**
 * 图片生成 API 封装
 * 兼容 GPT IMG 2 / OpenAI images.generate 格式
 *
 * 配置优先级（v0.11 B1 起）：
 *   1) ApiKey 池（provider='image'，按 priority asc 取一条 active）
 *   2) Setting 表（IMAGE_API_BASE_URL / IMAGE_API_KEY / IMAGE_MODEL，向后兼容）
 *   3) .env（同名变量）
 *
 * v0.8 B1.8：错误信息附加 baseUrl + model 摘要
 * v0.11 B1：池路径 + recordImageResult(success, error) 反馈池
 */

import { prisma } from '@/lib/db';
import {
  getActiveImageKey,
  markKeySuccess,
  markKeyError,
  type ActiveKey,
} from '@/lib/ai/keys';

export interface GenerateImageOptions {
  prompt: string;
  size?: string; // e.g. "1024x1024" / "1024x1536"
  n?: number;
}

export interface GenerateImageResult {
  ok: boolean;
  images: { url?: string; b64?: string }[];
  model?: string;
  error?: string;
}

export interface ImageConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function summary(cfg: Partial<ImageConfig>): string {
  return ` [baseUrl=${cfg.baseUrl || '(空)'}, model=${cfg.model || '(空)'}]`;
}

export interface ImageConfigWithSource extends Partial<ImageConfig> {
  /** v0.11 B1：池命中时填，回退 Setting 时为 undefined */
  _activeKey?: ActiveKey;
  /** 'pool' | 'setting' | 'env' | 'none' */
  _source?: 'pool' | 'setting' | 'env' | 'none';
}

/**
 * v0.11 B1：带 source 的 config 读取
 */
export async function getImageConfigWithSource(): Promise<ImageConfigWithSource> {
  // 1) 池
  try {
    const k = await getActiveImageKey();
    if (k && k.apiKey && k.baseUrl) {
      return {
        baseUrl: k.baseUrl,
        apiKey: k.apiKey,
        model: k.model || 'gpt-img-2',
        _activeKey: k,
        _source: 'pool',
      };
    }
  } catch {
    /* 池失败 → fallback */
  }

  // 2) Setting
  const settings = await prisma.setting.findMany({
    where: { key: { in: ['IMAGE_API_BASE_URL', 'IMAGE_API_KEY', 'IMAGE_MODEL'] } },
  });
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;

  const baseUrl = map.IMAGE_API_BASE_URL || process.env.IMAGE_API_BASE_URL || '';
  const apiKey = map.IMAGE_API_KEY || process.env.IMAGE_API_KEY || '';
  const model = map.IMAGE_MODEL || process.env.IMAGE_MODEL || 'gpt-img-2';

  let _source: 'setting' | 'env' | 'none' = 'none';
  if (map.IMAGE_API_KEY) _source = 'setting';
  else if (process.env.IMAGE_API_KEY) _source = 'env';

  return { baseUrl, apiKey, model, _source };
}

/** 旧签名保留 */
export async function getImageConfig(): Promise<Partial<ImageConfig>> {
  const cfg = await getImageConfigWithSource();
  return { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model };
}

export async function isImageConfigured(): Promise<boolean> {
  const cfg = await getImageConfig();
  return Boolean(cfg.apiKey && cfg.baseUrl);
}

/** v0.11 B1：图片调用结果回写池 */
export async function recordImageResult(
  activeKey: ActiveKey | null | undefined,
  success: boolean,
  error?: string | null,
): Promise<void> {
  if (!activeKey) return;
  if (success) {
    await markKeySuccess(activeKey.id);
  } else {
    await markKeyError(activeKey.id, error ?? null);
  }
}

export async function generateImage(
  options: GenerateImageOptions,
): Promise<GenerateImageResult> {
  const cfg = await getImageConfigWithSource();
  if (!cfg.apiKey || !cfg.baseUrl) {
    return {
      ok: false,
      images: [],
      error:
        '未配置图片 API。请前往「设置 → API Keys 池」新增一条 provider=image 的 key，或在 Setting 兼容字段填写 IMAGE_API_BASE_URL / IMAGE_API_KEY。' +
        summary(cfg),
    };
  }

  const url = `${cfg.baseUrl!.replace(/\/$/, '')}/images/generations`;
  const body = {
    model: cfg.model,
    prompt: options.prompt,
    n: options.n ?? 1,
    size: options.size ?? '1024x1024',
  };

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
      const errMsg =
        `图片 API 调用失败 (${res.status}): ${errText.slice(0, 500)}` +
        summary(cfg);
      await recordImageResult(cfg._activeKey, false, errMsg);
      return {
        ok: false,
        images: [],
        error: errMsg,
        model: cfg.model,
      };
    }
    const data: any = await res.json();
    const items: any[] = data?.data ?? [];
    const images = items.map((it) => ({ url: it.url, b64: it.b64_json }));
    await recordImageResult(cfg._activeKey, true);
    return { ok: true, images, model: cfg.model };
  } catch (err) {
    const errMsg = `图片请求异常: ${(err as Error).message}` + summary(cfg);
    await recordImageResult(cfg._activeKey, false, errMsg);
    return {
      ok: false,
      images: [],
      error: errMsg,
      model: cfg.model,
    };
  }
}
