// /api/health · 轻量健康检查
// - 测 SQLite 是否可写：count 一下任意一张已存在的表
// - 不暴露任何密钥 / 配置
// - 用作 docker healthcheck
//
// v0.8 Batch 6 (B6.7) 增强：
//   返回 { ok, db, version, startedAt, uptimeMs }
//
// v0.9 Batch 3 (B5) 增强：
//   - agentRoutes: number  // findAgent 里注册的 agent 总数（含 publish-director / photo-director）
//   - imageDefaultAdapter: string | null  // 当前 IMAGE_DEFAULT_ADAPTER 实际生效值（脱敏不暴露 key）
//   - recentFailures: { llm: string | null, image: string | null }  // 最近 1 条 LLM/IMAGE 错误的 input 摘要（不含 key）
//   - publishDirectorStats: { total, success, fail }  // 最近 24h via:'publish-director' AIOutput 统计
//
// 所有新字段都是可选信息，任何失败都用 null 兜底，不影响 HTTP 200/503

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { AGENTS } from "@/lib/agent-types";

const prisma = (globalThis as any).__prisma__ ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") {
  (globalThis as any).__prisma__ = prisma;
}

// 模块加载时记录启动时间
const STARTED_AT = new Date().toISOString();
const STARTED_AT_MS = Date.now();
const APP_VERSION = process.env.APP_VERSION || "v0.9";

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
  // 简单截断 ≤120 字符并去掉 sk- 前缀的字符串
  const merged = (output || input || "").slice(0, 240);
  return merged.replace(/sk-[A-Za-z0-9_-]{6,}/g, "sk-***").slice(0, 120);
}

async function readRecentFailures(): Promise<{ llm: string | null; image: string | null }> {
  const out = { llm: null as string | null, image: null as string | null };
  try {
    // 最近 50 条 AIOutput，挑一条 text 失败 + 一条 image 失败
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
      // input 必含 "via":"publish-director"，避免误统计普通 generate
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
        // 解析失败也算失败
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

export async function GET() {
  const t0 = Date.now();
  try {
    await prisma.setting.count();

    // 并行读 4 路扩展字段（任何失败都用 null/空对象兜底，不阻塞 health）
    const [imageDefaultAdapter, recentFailures, publishDirectorStats] = await Promise.all([
      readImageDefaultAdapter(),
      readRecentFailures(),
      readPublishDirectorStats(),
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
