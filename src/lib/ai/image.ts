/**
 * 图片生成 API 封装
 * 兼容 GPT IMG 2 / OpenAI images.generate 格式
 *
 * 配置优先级：数据库 Setting 表 > .env
 *
 * v0.8 Batch 1（B1.8）：错误信息附加 baseUrl + model 摘要
 */

import { prisma } from '@/lib/db';

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

export async function getImageConfig(): Promise<Partial<ImageConfig>> {
  const settings = await prisma.setting.findMany({
    where: { key: { in: ['IMAGE_API_BASE_URL', 'IMAGE_API_KEY', 'IMAGE_MODEL'] } },
  });
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  return {
    baseUrl: map.IMAGE_API_BASE_URL || process.env.IMAGE_API_BASE_URL || '',
    apiKey: map.IMAGE_API_KEY || process.env.IMAGE_API_KEY || '',
    model: map.IMAGE_MODEL || process.env.IMAGE_MODEL || 'gpt-img-2',
  };
}

export async function isImageConfigured(): Promise<boolean> {
  const cfg = await getImageConfig();
  return Boolean(cfg.apiKey && cfg.baseUrl);
}

export async function generateImage(
  options: GenerateImageOptions,
): Promise<GenerateImageResult> {
  const cfg = await getImageConfig();
  if (!cfg.apiKey || !cfg.baseUrl) {
    return {
      ok: false,
      images: [],
      error:
        '未配置图片 API。请前往「设置」页面填写 IMAGE_API_BASE_URL 与 IMAGE_API_KEY。' +
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
      return {
        ok: false,
        images: [],
        error:
          `图片 API 调用失败 (${res.status}): ${errText.slice(0, 500)}` +
          summary(cfg),
        model: cfg.model,
      };
    }
    const data: any = await res.json();
    const items: any[] = data?.data ?? [];
    const images = items.map((it) => ({ url: it.url, b64: it.b64_json }));
    return { ok: true, images, model: cfg.model };
  } catch (err) {
    return {
      ok: false,
      images: [],
      error: `图片请求异常: ${(err as Error).message}` + summary(cfg),
      model: cfg.model,
    };
  }
}
