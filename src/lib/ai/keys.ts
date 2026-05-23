/**
 * v0.11 B1 · 多 API key 池中央选择器
 *
 * 职责：
 *   - getActiveLLMKey()   → 取一条 active 的 LLM key（优先级最高）
 *   - getActiveImageKey() → 取一条 active 的 IMAGE key
 *   - markKeySuccess(id)  → 调用成功后回写：consecutiveErrors=0, lastUsedAt=now, totalRequests++
 *   - markKeyError(id, m) → 调用失败回写：consecutiveErrors++, lastError, totalErrors++,
 *                          若 consecutiveErrors>=3 自动 active=false
 *
 * 选 key 算法：
 *   SELECT * FROM ApiKey WHERE provider=? AND active=true
 *   ORDER BY priority ASC, createdAt ASC
 *   LIMIT 1
 *
 * 数据迁移：
 *   - 模块第一次被调用时触发 seed-api-keys.ts，把 Setting 表里的旧单 key 复制到 ApiKey 表
 *   - 用模块内 Promise 缓存避免并发重复 seed
 *
 * 不在本模块做的事：
 *   - 不直接发 LLM/IMAGE 请求（generate 文件做）
 *   - 不删旧 Setting 路径（保留作 fallback，由 text.ts / image.ts 调用方处理）
 */

import { prisma } from '@/lib/db';
import { ensureApiKeysSeeded } from '@/lib/seed-api-keys';

export type ApiKeyProvider = 'llm' | 'image';

export interface ActiveKey {
  id: string;
  provider: ApiKeyProvider;
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  priority: number;
  consecutiveErrors: number;
}

const FAIL_DISABLE_THRESHOLD = 3;

/** 取一条 active 的 key（最高优先级），不存在则返回 null。 */
async function pickActive(provider: ApiKeyProvider): Promise<ActiveKey | null> {
  await ensureApiKeysSeeded();
  const row = await prisma.apiKey.findFirst({
    where: { provider, active: true },
    orderBy: [
      { priority: 'asc' },
      { createdAt: 'asc' },
    ],
  });
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider as ApiKeyProvider,
    label: row.label,
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
    model: row.model,
    priority: row.priority,
    consecutiveErrors: row.consecutiveErrors,
  };
}

export async function getActiveLLMKey(): Promise<ActiveKey | null> {
  return pickActive('llm');
}

export async function getActiveImageKey(): Promise<ActiveKey | null> {
  return pickActive('image');
}

/**
 * 标记一次成功调用：
 *   consecutiveErrors=0, lastUsedAt=now, totalRequests++
 */
export async function markKeySuccess(id: string): Promise<void> {
  if (!id) return;
  try {
    await prisma.apiKey.update({
      where: { id },
      data: {
        consecutiveErrors: 0,
        lastUsedAt: new Date(),
        lastError: null,
        totalRequests: { increment: 1 },
      },
    });
  } catch {
    /* key 已删 / DB 暂时不可达 → 忽略，调用方该走的请求仍要进行 */
  }
}

/**
 * 标记一次失败调用：
 *   consecutiveErrors++, totalErrors++, totalRequests++, lastError
 *   若 consecutiveErrors>=3 自动 active=false（disable）
 *
 * 调用方仍可拿这次的失败结果走 Setting 回退路径，不在此处再选下一条 key（避免在 hot path
 * 里多次访问 LLM 中转站；下一次请求自然会取下一条 active key）。
 */
export async function markKeyError(id: string, message: string | null | undefined): Promise<void> {
  if (!id) return;
  const errMsg = (message ?? '').slice(0, 500);
  try {
    const row = await prisma.apiKey.findUnique({ where: { id } });
    if (!row) return;
    const nextErr = (row.consecutiveErrors ?? 0) + 1;
    const willDisable = nextErr >= FAIL_DISABLE_THRESHOLD;
    await prisma.apiKey.update({
      where: { id },
      data: {
        consecutiveErrors: nextErr,
        lastError: errMsg || '未知错误',
        totalRequests: { increment: 1 },
        totalErrors: { increment: 1 },
        ...(willDisable ? { active: false } : {}),
      },
    });
  } catch {
    /* 同上 */
  }
}

/**
 * v0.11 B1 health 用：池摘要（每 provider）
 *   total      = 全部 ApiKey 行数
 *   active     = active=true 的行数
 *   lastError  = 最近一条 lastError（任意 provider 的 key，截断 120 字符）
 */
export async function summarizePool(provider: ApiKeyProvider): Promise<{
  total: number;
  active: number;
  lastError: string | null;
}> {
  try {
    const [total, active, last] = await Promise.all([
      prisma.apiKey.count({ where: { provider } }),
      prisma.apiKey.count({ where: { provider, active: true } }),
      prisma.apiKey.findFirst({
        where: { provider, lastError: { not: null } },
        orderBy: { updatedAt: 'desc' },
        select: { lastError: true },
      }),
    ]);
    const raw = last?.lastError ?? null;
    const lastError = raw ? raw.slice(0, 120).replace(/sk-[A-Za-z0-9_-]{6,}/g, 'sk-***') : null;
    return { total, active, lastError };
  } catch {
    return { total: 0, active: 0, lastError: null };
  }
}
