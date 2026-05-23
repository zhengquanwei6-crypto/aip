/**
 * /api/prompts - Prompt 模板库
 * GET: 列出所有模板（用户自定义 + DEFAULT_PROMPTS 兜底）
 */
import { NextResponse } from 'next/server';
import { listPromptTemplates } from '@/lib/ai/prompts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const list = await listPromptTemplates();
    return NextResponse.json({
      ok: true,
      items: list.map(({ key, source, tpl }) => ({
        key,
        source,
        name: tpl.name,
        description: tpl.description,
        system: tpl.system,
        user: tpl.user,
        vars: tpl.vars,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
