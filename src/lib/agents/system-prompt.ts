/**
 * lib/agents/system-prompt.ts — agent systemPrompt 解析（含 Setting 覆盖）
 *
 * v0.12 B2：B15.5 docs 写明的公共契约 — `prompt:agent:<slug>:system` Setting 行
 * 存在时覆盖 `findAgent(slug).systemPrompt`，否则 fallback 内置。
 *
 * Setting 表里的 value 格式与 /api/prompts/[key] 写入格式一致（JSON-encoded PromptTemplate）。
 * `prompt-coach` / 编辑器 / 任何走 /api/prompts POST 的入口都遵循 PromptTemplate shape：
 *   { name, description, system, user, vars[] }
 * 只有 `system` 字段被本 helper 用作 agent systemPrompt（其余字段为编辑器 UI 元数据）。
 *
 * 兼容退路：
 *   - 行不存在 → fallback
 *   - JSON.parse 失败 → fallback
 *   - parsed.system 不是非空字符串 → fallback
 *   - prisma 抛错 → fallback
 *
 * 公共契约（B15.5 docs/05 已写）：
 *   - 写入立即生效（无需重启容器）— prisma.setting 是单条 query，每次请求都重新读
 *   - slug 字面量与 /api/agents/<slug>/chat 不变
 *   - 删除覆盖 → 自动回退内置
 */

import { prisma } from '@/lib/db';

const KEY_RE = /^[a-z][a-z0-9-]*$/;

/**
 * 给定 slug + 内置 fallback，返回真正生效的 systemPrompt。
 *
 * @param slug agent slug（来自 AGENTS 数组）
 * @param fallback findAgent(slug).systemPrompt — 内置 fallback
 * @returns 优先 Setting `prompt:agent:<slug>:system`，否则 fallback
 */
export async function getEffectiveAgentSystemPrompt(
  slug: string,
  fallback: string,
): Promise<string> {
  if (!slug || !KEY_RE.test(slug)) return fallback;
  try {
    const row = await prisma.setting.findUnique({
      where: { key: `prompt:agent:${slug}:system` },
    });
    if (!row || !row.value) return fallback;
    try {
      const parsed = JSON.parse(row.value);
      if (
        parsed &&
        typeof parsed.system === 'string' &&
        parsed.system.trim().length > 0
      ) {
        return parsed.system;
      }
    } catch {
      /* malformed JSON → fallback */
    }
    return fallback;
  } catch {
    /* prisma error → fallback */
    return fallback;
  }
}

/**
 * 列出已存在 agent 自定义覆盖的 slug 集合（用于 server 渲染编辑器初始状态）。
 * 返回 Map<slug, { system, name, description }>
 *
 * `name` / `description` 仅供编辑器 UI 显示元数据，不参与 LLM 调用。
 */
export async function listAgentCustomPrompts(): Promise<
  Map<string, { system: string; name: string; description: string }>
> {
  const map = new Map<string, { system: string; name: string; description: string }>();
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { startsWith: 'prompt:agent:' } },
    });
    for (const row of rows) {
      const m = row.key.match(/^prompt:agent:([a-z][a-z0-9-]*):system$/);
      if (!m) continue;
      try {
        const parsed = JSON.parse(row.value);
        if (parsed && typeof parsed.system === 'string') {
          map.set(m[1], {
            system: parsed.system,
            name: typeof parsed.name === 'string' ? parsed.name : '',
            description: typeof parsed.description === 'string' ? parsed.description : '',
          });
        }
      } catch {
        /* skip malformed */
      }
    }
  } catch {
    /* prisma error → empty map */
  }
  return map;
}

/** v0.12 B2 marker — push.sh + walk grep 用 */
export const V012_B2_AGENT_PROMPT_RESOLVER = true;
