// /api/health · 轻量健康检查
// - 测 SQLite 是否可写：count 一下任意一张已存在的表
// - 不暴露任何密钥 / 配置
// - 用作 docker healthcheck
//
// v0.8 Batch 6 (B6.7) 增强：
//   返回 { ok, db, version, startedAt, uptimeMs }
//   - version 来自 process.env.APP_VERSION，默认 'v0.8'
//   - startedAt 在模块加载时记一次 ISO 时间，进程存活期内固定
//   - uptimeMs 表示这次请求处理耗时（保留旧含义）
//   - serverUptimeMs 表示进程已经跑了多久

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = (globalThis as any).__prisma__ ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") {
  (globalThis as any).__prisma__ = prisma;
}

// 模块加载时记录启动时间。哪怕 prisma 初始化抛异常，这里也已经赋值。
const STARTED_AT = new Date().toISOString();
const STARTED_AT_MS = Date.now();
const APP_VERSION = process.env.APP_VERSION || "v0.8";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const t0 = Date.now();
  try {
    // 任意一张表（Setting 是 v0.1 起就有的）—— count 比 raw query 安全
    await prisma.setting.count();
    return NextResponse.json(
      {
        ok: true,
        db: "ok",
        version: APP_VERSION,
        startedAt: STARTED_AT,
        uptimeMs: Date.now() - t0,
        serverUptimeMs: Date.now() - STARTED_AT_MS,
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
