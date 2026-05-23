/**
 * v0.11 B1 · 一次性数据迁移：把旧 Setting 表里的单 key 注入 ApiKey 池
 *
 * 触发：getActiveLLMKey / getActiveImageKey / API CRUD GET 第一次被调用时
 * 缓存：模块内 Promise 缓存，整个进程生命周期只跑一次
 *
 * 逻辑：
 *   - 若 ApiKey 表已有任意行 → 跳过（认为已迁移过）
 *   - 否则读 Setting 表里 LLM_API_KEY/LLM_API_BASE_URL/LLM_MODEL，三项齐全则种 1 条 LLM ApiKey
 *   - IMAGE_* 同理
 *   - 不删 Setting 表（旧路径作 fallback，至少留 2 个版本）
 */

import { prisma } from '@/lib/db';

let seededPromise: Promise<void> | null = null;

async function readSettingMap(keys: string[]): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value ?? '';
  return map;
}

async function seedOnce(): Promise<void> {
  // 已 seed 过则不动
  const existing = await prisma.apiKey.count();
  if (existing > 0) return;

  const llm = await readSettingMap(['LLM_API_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL']);
  const img = await readSettingMap(['IMAGE_API_BASE_URL', 'IMAGE_API_KEY', 'IMAGE_MODEL']);

  const toSeed: Array<{
    provider: 'llm' | 'image';
    label: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    notes: string;
  }> = [];

  if (llm.LLM_API_KEY && llm.LLM_API_BASE_URL) {
    toSeed.push({
      provider: 'llm',
      label: 'LLM 主用（v0.11 自动迁移）',
      baseUrl: llm.LLM_API_BASE_URL,
      apiKey: llm.LLM_API_KEY,
      model: llm.LLM_MODEL || 'gpt-4o-mini',
      notes: '从 Setting 表自动迁移，可在 /settings 编辑或新增更多 key',
    });
  }
  if (img.IMAGE_API_KEY && img.IMAGE_API_BASE_URL) {
    toSeed.push({
      provider: 'image',
      label: 'IMAGE 主用（v0.11 自动迁移）',
      baseUrl: img.IMAGE_API_BASE_URL,
      apiKey: img.IMAGE_API_KEY,
      model: img.IMAGE_MODEL || 'gpt-image-2',
      notes: '从 Setting 表自动迁移，可在 /settings 编辑或新增更多 key',
    });
  }

  if (toSeed.length === 0) return;

  for (const k of toSeed) {
    await prisma.apiKey.create({
      data: {
        provider: k.provider,
        label: k.label,
        baseUrl: k.baseUrl,
        apiKey: k.apiKey,
        model: k.model,
        active: true,
        priority: 0,
        notes: k.notes,
      },
    });
  }
}

/**
 * 进程内幂等 seed：第一次调用触发，后续直接返回缓存的 Promise（包括失败的）。
 *
 * 失败兜底：seed 内部异常不向上抛，仅 console.warn —— 调用方 (getActiveLLMKey 等) 拿到
 * null 时会自然回退到 Setting 路径，不影响主路径。
 */
export function ensureApiKeysSeeded(): Promise<void> {
  if (seededPromise) return seededPromise;
  seededPromise = seedOnce().catch((err) => {
    console.warn('[seed-api-keys] failed:', (err as Error).message);
  });
  return seededPromise;
}
