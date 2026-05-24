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
 *
 * v0.11 B14（BUG-M26 修）：
 *   - markKeySuccess 不再把 lastError 直接置 null，保留历史值作 audit。理由：
 *     即使最近一次成功，运维仍需要知道这个 key 历史上最近一次失败信息（截断 120 字符），
 *     否则在「成功-失败-成功」抖动场景下，运维永远看不到失败痕迹（B13 自检暴露 IMAGE
 *     key 9 reqs / 6 errors / lastError=null 即此症状）。consecutiveErrors=0 仍然重置，
 *     这是 disable 阈值的语义（连续 N 次失败才 disable）。
 *   - 不改 disable 阈值（保持 3 次连续失败）；image-runner 端会在每个 ok=false 出口
 *     都调 markKeyError（含 storage 失败这种"上游 200 但本地落盘失败"），保证染色不漏。
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
 *
 * v0.11 B14：不再清 lastError（保留历史 audit）。
 *   旧版：lastError: null  → 用户在 /api/health 看不到上一次失败信息
 *   新版：保留 lastError 字段，仅 markKeyError 与 /api/settings/keys 的"重置错误"按钮可清
 */
export async function markKeySuccess(id: string): Promise<void> {
  if (!id) return;
  try {
    await prisma.apiKey.update({
      where: { id },
      data: {
        consecutiveErrors: 0,
        lastUsedAt: new Date(),
        // v0.11 B14（BUG-M26 修）：不再 lastError: null
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
