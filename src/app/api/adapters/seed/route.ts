/**
 * /api/adapters/seed - 种入 5 个内置 adapter 预设
 *
 * 调用：POST 一下即可种入；已存在则 skip（按 slug 去重）
 *
 * v0.11 B7：PRESETS 数组从 src/lib/adapter-seed.ts 导出（含 sizes / qualities 池）。
 *   - 已存在的 adapter row 不会被覆盖（保留现有 baseUrl / apiKey 等用户定制）
 *   - 要把 sizes/qualities merge 进已存在的 row → 用 /api/adapters/migrate-presets
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  adapterKey,
  adapterConfigSchema,
} from '@/lib/adapter-types';
import { PRESETS } from '@/lib/adapter-seed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  let added = 0;
  let skipped = 0;
  const failed: string[] = [];

  for (const preset of PRESETS) {
    const validated = adapterConfigSchema.safeParse(preset);
    if (!validated.success) {
      failed.push(`${preset.slug}: ${JSON.stringify(validated.error.flatten())}`);
      continue;
    }
    const key = adapterKey(preset.slug);
    const exists = await prisma.setting.findUnique({ where: { key } });
    if (exists) {
      skipped += 1;
      continue;
    }
    const final = {
      ...validated.data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await prisma.setting.create({
      data: { key, value: JSON.stringify(final) },
    });
    added += 1;
  }

  return NextResponse.json({ ok: true, added, skipped, total: PRESETS.length, failed });
}

// 列出当前预设清单（仅元数据，不暴露 bodyTemplate 等敏感模板）
export async function GET() {
  return NextResponse.json({
    ok: true,
    presets: PRESETS.map((p) => ({
      slug: p.slug,
      name: p.name,
      baseUrl: p.baseUrl,
      type: p.flow.type,
      enabled: p.enabled,
      sizesCount: Array.isArray(p.sizes) ? p.sizes.length : 0,
      qualitiesCount: Array.isArray(p.qualities) ? p.qualities.length : 0,
    })),
  });
}
