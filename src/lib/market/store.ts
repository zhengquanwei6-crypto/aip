// v0.11 B10 · 市场趋势数据存取层（Setting 表 prefix `market:`）
//
// 设计：
//   - PlatformInfo 存 `market:platform:<slug>`（push.sh 启动时 seed 一次）
//   - Snapshot   存 `market:snapshot:<slug>:<YYYY-MM-DD>`（一天一行，覆盖更新）
//   - 0 schema 改动；纯 Setting 表
//   - 不 throw：解析失败时安静 fallback（避免一行坏数据搞死整个 dashboard）

import { prisma } from '@/lib/db';
import {
  marketSnapshotSchema,
  platformInfoSchema,
  PLATFORM_KEY_PREFIX,
  PLATFORM_SLUGS,
  SNAPSHOT_KEY_PREFIX,
  platformSettingKey,
  snapshotSettingKey,
  type MarketPlatformSlug,
  type MarketSnapshot,
  type PlatformInfo,
} from './types';
import { SEED_PLATFORMS, getSeedPlatform } from './seed';

// ====== PlatformInfo ======

export async function getPlatformInfo(
  slug: MarketPlatformSlug,
): Promise<PlatformInfo> {
  try {
    const row = await prisma.setting.findUnique({
      where: { key: platformSettingKey(slug) },
    });
    if (row?.value) {
      const parsed = platformInfoSchema.safeParse(JSON.parse(row.value));
      if (parsed.success) return parsed.data;
    }
  } catch {
    /* fall through */
  }
  // fallback to seed（保证 UI 不空）
  const seed = getSeedPlatform(slug);
  if (!seed) {
    // 这里 slug 已经经过 zod enum 收窄，理论上不会到 — 但兜底
    throw new Error(`unknown platform slug: ${slug}`);
  }
  return seed;
}

export async function getAllPlatformInfo(): Promise<PlatformInfo[]> {
  const out: PlatformInfo[] = [];
  for (const slug of PLATFORM_SLUGS) {
    out.push(await getPlatformInfo(slug));
  }
  return out;
}

// ====== Snapshot ======

function decodeSnapshotKey(
  key: string,
): { platform: MarketPlatformSlug; date: string } | null {
  // 期望: market:snapshot:<platform>:<YYYY-MM-DD>
  if (!key.startsWith(SNAPSHOT_KEY_PREFIX)) return null;
  const tail = key.slice(SNAPSHOT_KEY_PREFIX.length);
  const idx = tail.indexOf(':');
  if (idx < 0) return null;
  const platform = tail.slice(0, idx) as MarketPlatformSlug;
  const date = tail.slice(idx + 1);
  if (!PLATFORM_SLUGS.includes(platform)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { platform, date };
}

export async function getMarketSnapshots(opts?: {
  platform?: MarketPlatformSlug;
  limit?: number;
}): Promise<MarketSnapshot[]> {
  const limit = Math.max(1, Math.min(opts?.limit ?? 30, 200));
  const where = opts?.platform
    ? { key: { startsWith: `${SNAPSHOT_KEY_PREFIX}${opts.platform}:` } }
    : { key: { startsWith: SNAPSHOT_KEY_PREFIX } };
  const rows = await prisma.setting.findMany({ where });
  const out: MarketSnapshot[] = [];
  for (const r of rows) {
    const decoded = decodeSnapshotKey(r.key);
    if (!decoded) continue;
    try {
      const parsed = marketSnapshotSchema.safeParse(JSON.parse(r.value));
      if (parsed.success) {
        out.push(parsed.data);
      }
    } catch {
      /* skip */
    }
  }
  // desc by date
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out.slice(0, limit);
}

export async function getPlatformLatestSnapshot(
  platform: MarketPlatformSlug,
): Promise<MarketSnapshot | null> {
  const all = await getMarketSnapshots({ platform, limit: 1 });
  return all[0] ?? null;
}

export async function saveMarketSnapshot(
  snap: MarketSnapshot,
): Promise<MarketSnapshot> {
  const parsed = marketSnapshotSchema.parse(snap);
  const key = snapshotSettingKey(parsed.platform, parsed.date);
  const enriched: MarketSnapshot = {
    ...parsed,
    capturedAt: parsed.capturedAt ?? new Date().toISOString(),
  };
  const value = JSON.stringify(enriched);
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  return enriched;
}

/**
 * 启动时 seed：若 Setting 表里没有 PlatformInfo（market:platform:*），
 * 把 SEED_PLATFORMS 三条写一次。幂等。
 *
 * push.sh 内嵌 python3 已经 seed 过一遍，这里是运行时 fallback（容器重启或换 DB 卷时兜底）。
 */
export async function seedMarketPlatformsIfMissing(): Promise<{
  seeded: string[];
  skipped: string[];
}> {
  const seeded: string[] = [];
  const skipped: string[] = [];
  const existing = await prisma.setting.findMany({
    where: { key: { startsWith: PLATFORM_KEY_PREFIX } },
    select: { key: true },
  });
  const existingKeys = new Set(existing.map((r) => r.key));
  for (const info of SEED_PLATFORMS) {
    const key = platformSettingKey(info.slug);
    if (existingKeys.has(key)) {
      skipped.push(info.slug);
      continue;
    }
    await prisma.setting.create({
      data: { key, value: JSON.stringify(info) },
    });
    seeded.push(info.slug);
  }
  return { seeded, skipped };
}

export async function countMarketSnapshots(): Promise<number> {
  return prisma.setting.count({
    where: { key: { startsWith: SNAPSHOT_KEY_PREFIX } },
  });
}
