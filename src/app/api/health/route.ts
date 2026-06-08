// /api/health · 轻量健康检查
//
// v0.12 B0：
//   - lastBackupAt: { iso, dir } · 读 Setting `system:lastBackupAt`
//     B0 backup 写入格式 `<ISO>|<dir>`，无 sep 时 fallback iso=value/dir=null
//   - APP_VERSION fallback 升 "v0.12"
//
// v0.11 B15.7：
//   - diskUsage: { rootPercent, rootBytes, rootUsedBytes, uploadsBytes, uploadsCount }
//     (BUG-L12 闭环：磁盘 88% · uploads 59MB / 45 文件 / 给 dashboard DiskWarningCard 用)
//
// v0.11 B10：
//   - marketTrendsModule: { enabled: true, platforms: [...], snapshotCount }
//
// v0.11 B9：
//   - imageCapabilitiesPerAdapter: { '<slug>': { sizes, qualities, aspectRatios, supportsImg2Img } }
//   - 替代 B7 imageSizesPerAdapter（向后兼容多保留 imageSizesPerAdapter）
//
// 之前字段（保留）：
//   - playgroundEnabled (B8)
//   - apiKeyPool (B1)
//   - imageSizesPerAdapter (B7) ← 仍保留兼容前端
//   - agentRoutes / imageDefaultAdapter / recentFailures / publishDirectorStats
//   - customPromptCount

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { AGENTS } from "@/lib/agent-types";
import { summarizePool } from "@/lib/ai/keys";
import { ADAPTER_SETTING_PREFIX } from "@/lib/adapter-types";
import { countMarketSnapshots } from "@/lib/market/store";
import { PLATFORM_SLUGS } from "@/lib/market/types";
import { statfs, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const prisma = (globalThis as any).__prisma__ ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") {
  (globalThis as any).__prisma__ = prisma;
}

const STARTED_AT = new Date().toISOString();
const STARTED_AT_MS = Date.now();
const APP_VERSION = process.env.APP_VERSION || "v0.18-DISCUSS2";
const UPLOADS_DIR = "/app/public/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function readImageDefaultAdapter(): Promise<string | null> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: "IMAGE_DEFAULT_ADAPTER" } });
    const v = row?.value?.trim();
    return v ? v : null;
  } catch {
    return null;
  }
}

function shortFailure(input: string | null | undefined, output: string | null | undefined): string | null {
  if (!output) return null;
  const merged = (output || input || "").slice(0, 240);
  return merged.replace(/sk-[A-Za-z0-9_-]{6,}/g, "sk-***").slice(0, 120);
}

async function readRecentFailures(): Promise<{ llm: string | null; image: string | null }> {
  const out = { llm: null as string | null, image: null as string | null };
  try {
    const rows = await prisma.aIOutput.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    for (const r of rows) {
      try {
        const o = JSON.parse(r.output);
        const looksFail = !!o?.error || (Array.isArray(o?.urls) && o.urls.length === 0);
        if (!looksFail) continue;
        if (r.type === "text" && !out.llm) out.llm = shortFailure(r.input, r.output);
        else if (r.type === "image" && !out.image) out.image = shortFailure(r.input, r.output);
        if (out.llm && out.image) break;
      } catch {
        /* not JSON */
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

async function readPublishDirectorStats(): Promise<{ total: number; success: number; fail: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const out = { total: 0, success: 0, fail: 0 };
  try {
    const rows = await prisma.aIOutput.findMany({
      where: { createdAt: { gte: since } },
      select: { input: true, output: true },
      take: 500,
    });
    for (const r of rows) {
      if (!r.input || !r.input.includes('"via":"publish-director"')) continue;
      out.total++;
      let isFail = false;
      try {
        const o = JSON.parse(r.output);
        if (o?.error) isFail = true;
        if (Array.isArray(o?.imageErrors) && o.imageErrors.length > 0 && (!Array.isArray(o?.assets) || o.assets.every((a: any) => !a?.url))) {
          isFail = true;
        }
      } catch {
        isFail = true;
      }
      if (isFail) out.fail++;
      else out.success++;
    }
  } catch {
    /* ignore */
  }
  return out;
}

async function readCustomPromptCount(): Promise<number> {
  try {
    return await prisma.setting.count({ where: { key: { startsWith: "prompt:" } } });
  } catch {
    return 0;
  }
}

async function readApiKeyPool(): Promise<{
  llm: { total: number; active: number; lastError: string | null };
  image: { total: number; active: number; lastError: string | null };
}> {
  try {
    const [llm, image] = await Promise.all([summarizePool('llm'), summarizePool('image')]);
    return { llm, image };
  } catch {
    return {
      llm: { total: 0, active: 0, lastError: null },
      image: { total: 0, active: 0, lastError: null },
    };
  }
}

interface AdapterCapability {
  sizes: number;
  qualities: number;
  aspectRatios: number;
  supportsImg2Img: boolean;
}

/**
 * v0.11 B9：每个 adapter 的能力清单。
 *   - sizes / qualities / aspectRatios 是数组长度
 *   - supportsImg2Img 是布尔
 *
 * 同时仍兼容 B7 imageSizesPerAdapter 字段（仅 sizes/qualities）。
 */
async function readImageCapabilitiesPerAdapter(): Promise<{
  capabilities: Record<string, AdapterCapability>;
  imageSizesLegacy: Record<string, { sizes: number; qualities: number }>;
}> {
  const capabilities: Record<string, AdapterCapability> = {};
  const imageSizesLegacy: Record<string, { sizes: number; qualities: number }> = {};
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { startsWith: ADAPTER_SETTING_PREFIX } },
    });
    for (const row of rows) {
      const slug = row.key.slice(ADAPTER_SETTING_PREFIX.length);
      let sizes = 0;
      let qualities = 0;
      let aspectRatios = 0;
      let supportsImg2Img = false;
      try {
        const parsed = JSON.parse(row.value);
        if (Array.isArray(parsed?.sizes)) sizes = parsed.sizes.length;
        if (Array.isArray(parsed?.qualities)) qualities = parsed.qualities.length;
        if (Array.isArray(parsed?.aspectRatios)) aspectRatios = parsed.aspectRatios.length;
        if (parsed?.supportsImg2Img === true) supportsImg2Img = true;
      } catch {
        /* leave 0 */
      }
      capabilities[slug] = { sizes, qualities, aspectRatios, supportsImg2Img };
      imageSizesLegacy[slug] = { sizes, qualities };
    }
  } catch {
    /* ignore */
  }
  return { capabilities, imageSizesLegacy };
}

async function readMarketTrendsModule(): Promise<{
  enabled: true;
  platforms: ReadonlyArray<string>;
  snapshotCount: number;
}> {
  let snapshotCount = 0;
  try {
    snapshotCount = await countMarketSnapshots();
  } catch {
    snapshotCount = 0;
  }
  return {
    enabled: true,
    platforms: PLATFORM_SLUGS,
    snapshotCount,
  };
}

/**
 * v0.11 B15.7 · 磁盘 / uploads 用量
 *
 * - rootPercent: 容器 / 挂载点已用 % (整数)
 * - rootBytes / rootUsedBytes: 总字节 / 已用字节
 * - uploadsBytes: /app/public/uploads 累计 bytes
 * - uploadsCount: 文件数（不含目录）
 *
 * 任一字段读不到时 fallback null（不阻塞 200 响应）。
 * Dashboard DiskWarningCard 在 rootPercent ≥ 85 时显示「磁盘紧张」徽章 + 跳 /docs/08。
 */
async function readDiskUsage(): Promise<{
  rootPercent: number | null;
  rootBytes: number | null;
  rootUsedBytes: number | null;
  uploadsBytes: number | null;
  uploadsCount: number | null;
}> {
  const out = {
    rootPercent: null as number | null,
    rootBytes: null as number | null,
    rootUsedBytes: null as number | null,
    uploadsBytes: null as number | null,
    uploadsCount: null as number | null,
  };
  try {
    // statfs 在 node 18.15+ 可用（容器是 node 20）
    const s: any = await (statfs as any)("/");
    const blockSize = Number(s.bsize) || 0;
    const total = Number(s.blocks) * blockSize;
    const free = Number(s.bfree) * blockSize;
    const used = total - free;
    if (total > 0) {
      out.rootBytes = total;
      out.rootUsedBytes = used;
      out.rootPercent = Math.round((used / total) * 100);
    }
  } catch {
    /* ignore */
  }
  try {
    const entries = await readdir(UPLOADS_DIR);
    let bytes = 0;
    let count = 0;
    for (const name of entries) {
      try {
        const st = await stat(join(UPLOADS_DIR, name));
        if (st.isFile()) {
          bytes += st.size;
          count++;
        }
      } catch {
        /* skip unreadable */
      }
    }
    out.uploadsBytes = bytes;
    out.uploadsCount = count;
  } catch {
    /* ignore — uploads dir may not exist */
  }
  return out;
}

/**
 * v0.12 B0 · 上次备份时间戳
 *
 * Setting `system:lastBackupAt` 写入格式：`<ISO 8601>|<backup dir>`
 *   - 由 B0 push.sh + 后续 cron 备份脚本写
 *   - 没 `|` 分隔时 fallback iso=value, dir=null
 *
 * 用于 dashboard SystemHealth 卡显示「上次备份距今 X 小时」+ 老化告警。
 */
async function readLastBackupAt(): Promise<{
  iso: string | null;
  dir: string | null;
}> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: "system:lastBackupAt" } });
    const v = row?.value?.trim();
    if (!v) return { iso: null, dir: null };
    const sep = v.indexOf("|");
    if (sep < 0) return { iso: v, dir: null };
    return { iso: v.slice(0, sep) || null, dir: v.slice(sep + 1) || null };
  } catch {
    return { iso: null, dir: null };
  }
}

export async function GET() {
  const t0 = Date.now();
  try {
    await prisma.setting.count();

    const [
      imageDefaultAdapter,
      recentFailures,
      publishDirectorStats,
      customPromptCount,
      apiKeyPool,
      caps,
      marketTrendsModule,
      diskUsage,
      lastBackupAt,
    ] = await Promise.all([
      readImageDefaultAdapter(),
      readRecentFailures(),
      readPublishDirectorStats(),
      readCustomPromptCount(),
      readApiKeyPool(),
      readImageCapabilitiesPerAdapter(),
      readMarketTrendsModule(),
      readDiskUsage(),
      readLastBackupAt(),
    ]);

    return NextResponse.json(
      {
        ok: true,
        db: "ok",
        version: APP_VERSION,
        startedAt: STARTED_AT,
        uptimeMs: Date.now() - t0,
        serverUptimeMs: Date.now() - STARTED_AT_MS,
        // v0.9 b3
        agentRoutes: AGENTS.length,
        imageDefaultAdapter,
        recentFailures,
        publishDirectorStats,
        // v0.9.2 b1
        customPromptCount,
        // v0.11 b1
        apiKeyPool,
        // v0.11 b7（向后兼容保留）
        imageSizesPerAdapter: caps.imageSizesLegacy,
        // v0.11 b8
        playgroundEnabled: true,
        // v0.11 b9
        imageCapabilitiesPerAdapter: caps.capabilities,
        // v0.11 b10
        marketTrendsModule,
        // v0.11 b15.7
        diskUsage,
        // v0.12 b0
        lastBackupAt,
      },
      { status: 200 },
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        db: "fail",
        version: APP_VERSION,
        startedAt: STARTED_AT,
        error: e?.message ?? "unknown",
      },
      { status: 503 },
    );
  }
}
