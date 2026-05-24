/**
 * /api/adapters/migrate-presets · v0.11 B7 + B9
 *
 * v0.11 B7：merge sizes/qualities 进 adapter Setting JSON
 * v0.11 B9：同时 merge aspectRatios + supportsImg2Img + img2imgFlow（幂等）
 *
 * 调用：POST 一次（push.sh build 完后 curl 一次）
 *
 * 0 LLM/IMAGE 消耗 · 0 schema 改动
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ADAPTER_SETTING_PREFIX } from '@/lib/adapter-types';
import { SLUG_PRESET_MAP } from '@/lib/adapter-seed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface MigrateRow {
  slug: string;
  status: 'updated' | 'skipped' | 'unknown' | 'parse-error';
  before?: { sizes: number; qualities: number; aspectRatios: number; supportsImg2Img: boolean };
  after?: { sizes: number; qualities: number; aspectRatios: number; supportsImg2Img: boolean };
  error?: string;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    }
    const ak = Object.keys(a as Record<string, unknown>).sort();
    const bk = Object.keys(b as Record<string, unknown>).sort();
    if (ak.length !== bk.length) return false;
    for (let i = 0; i < ak.length; i++) {
      if (ak[i] !== bk[i]) return false;
      if (!deepEqual((a as any)[ak[i]], (b as any)[bk[i]])) return false;
    }
    return true;
  }
  return false;
}

export async function POST() {
  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: ADAPTER_SETTING_PREFIX } },
  });
  const results: MigrateRow[] = [];
  let updated = 0;
  let skipped = 0;
  let unknown = 0;
  let parseError = 0;

  for (const row of rows) {
    const slug = row.key.slice(ADAPTER_SETTING_PREFIX.length);
    const preset = SLUG_PRESET_MAP[slug];
    if (!preset) {
      unknown++;
      results.push({ slug, status: 'unknown' });
      continue;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(row.value);
    } catch (e) {
      parseError++;
      results.push({ slug, status: 'parse-error', error: (e as Error).message.slice(0, 120) });
      continue;
    }
    const beforeSizes = Array.isArray(parsed.sizes) ? parsed.sizes.length : 0;
    const beforeQualities = Array.isArray(parsed.qualities) ? parsed.qualities.length : 0;
    const beforeAspectRatios = Array.isArray(parsed.aspectRatios) ? parsed.aspectRatios.length : 0;
    const beforeSupportsImg2Img = parsed.supportsImg2Img === true;

    const merged = {
      ...parsed,
      sizes: preset.sizes,
      qualities: preset.qualities,
      aspectRatios: preset.aspectRatios,
      supportsImg2Img: preset.supportsImg2Img,
      ...(preset.img2imgFlow ? { img2imgFlow: preset.img2imgFlow } : {}),
      updatedAt: new Date().toISOString(),
    };
    const newValue = JSON.stringify(merged);

    // 幂等：所有目标字段相等时跳过
    const sameSizes = deepEqual(parsed.sizes, preset.sizes);
    const sameQualities = deepEqual(parsed.qualities, preset.qualities);
    const sameAspectRatios = deepEqual(parsed.aspectRatios, preset.aspectRatios);
    const sameSupports = parsed.supportsImg2Img === preset.supportsImg2Img;
    const sameI2iFlow = preset.img2imgFlow
      ? deepEqual(parsed.img2imgFlow, preset.img2imgFlow)
      : true;
    if (sameSizes && sameQualities && sameAspectRatios && sameSupports && sameI2iFlow) {
      skipped++;
      results.push({
        slug,
        status: 'skipped',
        before: {
          sizes: beforeSizes,
          qualities: beforeQualities,
          aspectRatios: beforeAspectRatios,
          supportsImg2Img: beforeSupportsImg2Img,
        },
        after: {
          sizes: preset.sizes.length,
          qualities: preset.qualities.length,
          aspectRatios: preset.aspectRatios.length,
          supportsImg2Img: preset.supportsImg2Img,
        },
      });
      continue;
    }

    try {
      await prisma.setting.update({
        where: { key: row.key },
        data: { value: newValue },
      });
      updated++;
      results.push({
        slug,
        status: 'updated',
        before: {
          sizes: beforeSizes,
          qualities: beforeQualities,
          aspectRatios: beforeAspectRatios,
          supportsImg2Img: beforeSupportsImg2Img,
        },
        after: {
          sizes: preset.sizes.length,
          qualities: preset.qualities.length,
          aspectRatios: preset.aspectRatios.length,
          supportsImg2Img: preset.supportsImg2Img,
        },
      });
    } catch (e) {
      results.push({
        slug,
        status: 'parse-error',
        error: 'update failed: ' + (e as Error).message.slice(0, 120),
      });
      parseError++;
    }
  }

  return NextResponse.json({
    ok: true,
    summary: { total: rows.length, updated, skipped, unknown, parseError },
    rows: results,
  });
}

export async function GET() {
  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: ADAPTER_SETTING_PREFIX } },
  });
  const items = rows.map((row) => {
    const slug = row.key.slice(ADAPTER_SETTING_PREFIX.length);
    let parsed: any = null;
    try {
      parsed = JSON.parse(row.value);
    } catch {
      /* ignore */
    }
    return {
      slug,
      sizes: Array.isArray(parsed?.sizes) ? parsed.sizes.length : 0,
      qualities: Array.isArray(parsed?.qualities) ? parsed.qualities.length : 0,
      aspectRatios: Array.isArray(parsed?.aspectRatios) ? parsed.aspectRatios.length : 0,
      supportsImg2Img: parsed?.supportsImg2Img === true,
      preset: SLUG_PRESET_MAP[slug] ? 'known' : 'unknown',
    };
  });
  return NextResponse.json({ ok: true, items });
}
