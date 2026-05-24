// v0.11 B10 · GET  /api/market/platforms     返回 PlatformInfo[]
// v0.11 B15.6 · PUT /api/market/platforms     编辑单平台 PlatformInfo（写 Setting 表）
//
// 0 LLM/IMAGE 消耗 · 0 schema 改动（沿用 Setting 表 prefix `market:platform:<slug>`）。

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getAllPlatformInfo } from '@/lib/market/store';
import {
  PLATFORM_SLUGS,
  platformInfoSchema,
  platformSettingKey,
} from '@/lib/market/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const platforms = await getAllPlatformInfo();
    return NextResponse.json({ ok: true, platforms, total: platforms.length });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * v0.11 B15.6 · PUT /api/market/platforms
 *
 * Body: { slug: 'xiaohongshu' | 'xianyu' | 'qianniu', platform: PlatformInfo }
 *
 * - slug 必须存在且与 platform.slug 一致（防止串行写错行）
 * - platform 经 platformInfoSchema 严格校验（已存在 zod schema）
 * - upsert 写 `market:platform:<slug>`
 * - 返回 { ok: true, platform }，让客户端拿到归一化后的对象
 */
const putBodySchema = z.object({
  slug: z.enum(PLATFORM_SLUGS),
  platform: platformInfoSchema,
});

export async function PUT(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid JSON body' },
      { status: 400 },
    );
  }

  const parsed = putBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: 'validation failed',
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  const { slug, platform } = parsed.data;
  if (platform.slug !== slug) {
    return NextResponse.json(
      { ok: false, error: 'slug mismatch between body.slug and body.platform.slug' },
      { status: 400 },
    );
  }

  try {
    const key = platformSettingKey(slug);
    const value = JSON.stringify(platform);
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    return NextResponse.json({ ok: true, platform });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
