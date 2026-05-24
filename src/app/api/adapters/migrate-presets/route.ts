/**
 * /api/adapters/migrate-presets · v0.11 B7
 *
 * 一次性 merge sizes/qualities 字段进已有的 adapter Setting row，幂等。
 *   - 读 Setting WHERE key LIKE 'adapter:%'
 *   - 按 slug 找 SLUG_PRESET_MAP 对应的 sizes/qualities 池
 *   - 解析 row.value JSON，把 sizes/qualities merge 进去（保留 sourceUrl/baseUrl/auth/flow/enabled 等）
 *   - 重写 row.value，updatedAt 更新
 *
 * 调用：POST 一次即可（push.sh build 完之后 curl 一次）
 *
 * 0 LLM/IMAGE 消耗 · 0 schema 改动
 *
 * 幂等性：
 *   - 已经有 sizes/qualities 字段的 row 仍会被 merge（pool 是权威），但 value 字符串等价
 *     时不重写（避免 updatedAt 抖动）
 *   - SLUG_PRESET_MAP 没匹配的 slug → 跳过（标 unknown）
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
  before?: { sizes: number; qualities: number };
  after?: { sizes: number; qualities: number };
  error?: string;
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

    const merged = {
      ...parsed,
      sizes: preset.sizes,
      qualities: preset.qualities,
      updatedAt: new Date().toISOString(),
    };
    const newValue = JSON.stringify(merged);

    // 幂等：如果原 sizes/qualities 已经一致，且只是 updatedAt 不同 → 也算 updated（一次性）
    // 这里不做字符串等价判断，每次 POST 都强写 sizes/qualities + 更新 updatedAt
    if (beforeSizes === preset.sizes.length && beforeQualities === preset.qualities.length) {
      // 已经有了，跳过实际 update（避免 updatedAt 抖）
      // 但也要确保 sizes 内容完全一致；保险起见仍写一次（成本 < 1ms）
      const sameSizes =
        Array.isArray(parsed.sizes) &&
        parsed.sizes.length === preset.sizes.length &&
        parsed.sizes.every((s: any, i: number) =>
          s?.value === preset.sizes[i].value && s?.label === preset.sizes[i].label,
        );
      const sameQualities =
        Array.isArray(parsed.qualities) &&
        parsed.qualities.length === preset.qualities.length &&
        parsed.qualities.every((q: any, i: number) =>
          q?.value === preset.qualities[i].value && q?.label === preset.qualities[i].label,
        );
      if (sameSizes && sameQualities) {
        skipped++;
        results.push({
          slug,
          status: 'skipped',
          before: { sizes: beforeSizes, qualities: beforeQualities },
          after: { sizes: preset.sizes.length, qualities: preset.qualities.length },
        });
        continue;
      }
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
        before: { sizes: beforeSizes, qualities: beforeQualities },
        after: { sizes: preset.sizes.length, qualities: preset.qualities.length },
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

/**
 * GET：仅返回当前 adapter row 是否含 sizes/qualities（不动数据）。
 * 方便 walk.mjs / push.sh 验证 migrate 状态。
 */
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
      // ignore
    }
    return {
      slug,
      sizes: Array.isArray(parsed?.sizes) ? parsed.sizes.length : 0,
      qualities: Array.isArray(parsed?.qualities) ? parsed.qualities.length : 0,
      preset: SLUG_PRESET_MAP[slug] ? 'known' : 'unknown',
    };
  });
  return NextResponse.json({ ok: true, items });
}
