// /api/adapters - 列出 / 新建 adapter
//
// 列出：从 Setting 表筛 key 以 adapter: 开头的所有项
// 新建：创建一条 Setting，value 是 AdapterConfig JSON
//
// 用最最简单的 Setting 表存储，避免动 Prisma schema

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  adapterConfigSchema,
  adapterKey,
  ADAPTER_SETTING_PREFIX,
  type AdapterConfig,
} from "@/lib/adapter-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ──────────────────────────────────────────────────────────
// GET /api/adapters - 列出全部 adapter
// ──────────────────────────────────────────────────────────

export async function GET() {
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { startsWith: ADAPTER_SETTING_PREFIX } },
      orderBy: { updatedAt: "desc" },
    });
    const adapters: AdapterConfig[] = [];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.value);
        const ok = adapterConfigSchema.safeParse(parsed);
        if (ok.success) adapters.push(ok.data);
      } catch {
        // skip malformed
      }
    }
    return NextResponse.json({ ok: true, adapters });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────────
// POST /api/adapters - 新建/更新 adapter
// ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = adapterConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "invalid adapter config", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const adapter = {
      ...parsed.data,
      updatedAt: new Date().toISOString(),
      createdAt: parsed.data.createdAt ?? new Date().toISOString(),
    };
    const key = adapterKey(adapter.slug);
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(adapter) },
      update: { value: JSON.stringify(adapter) },
    });
    return NextResponse.json({ ok: true, adapter });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
  }
}
