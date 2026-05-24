import { NextResponse } from 'next/server';
import { AGENTS, DEFAULT_AGENT_VERTICAL } from '@/lib/agent-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/agents/list
 *
 * v0.12 B5.3 · response 加 `vertical` 字段（v0.13 多 vertical 起步预备）。
 *   - 当前 8 个 agent 全标 'jiedan'（接单助手 vertical）
 *   - vertical 在 agent-types.ts 是 optional · 缺省时 fallback 到 DEFAULT_AGENT_VERTICAL
 *   - 老消费方（v0.11 walk smoke / 外部脚本）继续读 slug/name/icon/scope 不破坏
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    agents: AGENTS.map((a) => ({
      slug: a.slug,
      name: a.name,
      description: a.description,
      icon: a.icon,
      scope: a.scope ?? [],
      vertical: a.vertical ?? DEFAULT_AGENT_VERTICAL,
    })),
  });
}
