// /api/adapters/[slug] - GET / PUT / DELETE 单个 adapter

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  adapterConfigSchema,
  adapterKey,
  type AdapterConfig,
} from "@/lib/adapter-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Ctx {
  params: { slug: string };
}

// GET /api/adapters/[slug]
export async function GET(_req: NextRequest, { params }: Ctx) {
  const row = await prisma.setting.findUnique({ where: { key: adapterKey(params.slug) } });
  if (!row) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  try {
    const parsed = adapterConfigSchema.parse(JSON.parse(row.value));
    return NextResponse.json({ ok: true, adapter: parsed });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}

// PUT /api/adapters/[slug] - 仅当 slug 一致时更新
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const body = await req.json();
    const parsed = adapterConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "invalid adapter config", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    if (parsed.data.slug !== params.slug) {
      return NextResponse.json({ ok: false, error: "slug mismatch" }, { status: 400 });
    }
    const adapter: AdapterConfig = {
      ...parsed.data,
      updatedAt: new Date().toISOString(),
    };
    await prisma.setting.upsert({
      where: { key: adapterKey(adapter.slug) },
      create: { key: adapterKey(adapter.slug), value: JSON.stringify(adapter) },
      update: { value: JSON.stringify(adapter) },
    });
    return NextResponse.json({ ok: true, adapter });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
  }
}

// DELETE /api/adapters/[slug]
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    await prisma.setting.delete({ where: { key: adapterKey(params.slug) } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.code === "P2025") {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
  }
}
