/**
 * /api/prompts/[key] - 单个 Prompt 模板
 * GET    返回（custom 优先，否则 default）
 * POST   保存自定义模板（写入 Setting 表 `prompt:<key>`）
 * DELETE 删除自定义模板（Setting 行删除，下次读自动回退默认）
 *
 * key 必须满足 ^[a-z0-9:_-]+$ 防注入
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  DEFAULT_PROMPTS,
  PROMPT_KEY_PREFIX,
  getPromptTemplate,
  isPromptTemplateShape,
  isValidPromptKey,
} from '@/lib/ai/prompts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { key: string } },
) {
  const key = params.key;
  if (!isValidPromptKey(key)) return bad('key 不合法');
  try {
    const tpl = await getPromptTemplate(key);
    if (!tpl) return bad('模板不存在', 404);
    const isDefault = !!DEFAULT_PROMPTS[key];
    const row = await prisma.setting.findUnique({
      where: { key: PROMPT_KEY_PREFIX + key },
    });
    return NextResponse.json({
      ok: true,
      key,
      source: row ? 'custom' : 'default',
      isDefault,
      tpl,
    });
  } catch (err) {
    return bad((err as Error).message, 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { key: string } },
) {
  const key = params.key;
  if (!isValidPromptKey(key)) return bad('key 不合法');
  try {
    const body = await req.json();
    if (!isPromptTemplateShape(body)) {
      return bad('模板字段不完整：需要 name/description/system/user/vars[]');
    }
    // 截断保护：单字段不超过 8000 字
    const safe = {
      name: String(body.name).slice(0, 200),
      description: String(body.description).slice(0, 500),
      system: String(body.system).slice(0, 8000),
      user: String(body.user).slice(0, 8000),
      vars: (body.vars as any[]).slice(0, 20).map((v) => ({
        key: String(v.key).slice(0, 60),
        label: String(v.label).slice(0, 60),
        example: v.example ? String(v.example).slice(0, 200) : undefined,
      })),
    };
    const value = JSON.stringify(safe);
    const fullKey = PROMPT_KEY_PREFIX + key;
    await prisma.setting.upsert({
      where: { key: fullKey },
      update: { value },
      create: { key: fullKey, value },
    });
    return NextResponse.json({ ok: true, key, source: 'custom', tpl: safe });
  } catch (err) {
    return bad((err as Error).message, 500);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { key: string } },
) {
  const key = params.key;
  if (!isValidPromptKey(key)) return bad('key 不合法');
  try {
    await prisma.setting.deleteMany({
      where: { key: PROMPT_KEY_PREFIX + key },
    });
    const fallback = DEFAULT_PROMPTS[key] ?? null;
    return NextResponse.json({
      ok: true,
      key,
      source: fallback ? 'default' : 'none',
      tpl: fallback,
    });
  } catch (err) {
    return bad((err as Error).message, 500);
  }
}
