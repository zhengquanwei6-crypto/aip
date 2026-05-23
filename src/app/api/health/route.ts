// /api/health · 轻量健康检查
//
// v0.8 b6：含 version / startedAt / uptime
//
// v0.9 Batch 3 (B5)：
//   - agentRoutes / imageDefaultAdapter / recentFailures / publishDirectorStats
//
// v0.9.2 Batch 1：
//   - customPromptCount
//
// v0.11 Batch 1：
//   - apiKeyPool: { llm: { total, active, lastError }, image: { total, active, lastError } }
//
// 所有新字段都是可选信息，任何失败都用 null/0 兜底，不影响 HTTP 200/503

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { AGENTS } from "@/lib/agent-types";
import { summarizePool } from "@/lib/ai/keys";

const prisma = (globalThis as any).__prisma__ ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") {
  (globalThis as any).__prisma__ = prisma;
}

// 模块加载时记录启动时间
const STARTED_AT = new Date().toISOString();
const STARTED_AT_MS = Date.now();
const APP_VERSION = process.env.APP_VERSION || "v0.11";

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

/** 提取最近一条失败的 input 摘要（不含 key） */
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
        // 不是 JSON 输出 → 视为成功，跳过
      }
    }
  } catch {
    // ignore
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
    // ignore
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

/** v0.11 B1：池摘要 */
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

export async function GET() {
  const t0 = Date.now();
  try {
    await prisma.setting.count();

    const [imageDefaultAdapter, recentFailures, publishDirectorStats, customPromptCount, apiKeyPool] = await Promise.all([
      readImageDefaultAdapter(),
      readRecentFailures(),
      readPublishDirectorStats(),
      readCustomPromptCount(),
      readApiKeyPool(),
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
