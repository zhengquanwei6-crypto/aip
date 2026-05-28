/**
 * v0.14-z63 · /api/vector/config
 * GET: 拉所有 vector 相关配置（token 脱敏）
 * POST: 写入 / 更新（partial update，只更新 body 里出现的字段）
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEYS = [
  "VECTOR_ENABLED",
  "VECTOR_ZILLIZ_ENDPOINT",
  "VECTOR_ZILLIZ_TOKEN",
  "EMBEDDING_BASE_URL",
  "EMBEDDING_API_KEY",
  "EMBEDDING_MODEL",
] as const;

const SECRET_KEYS = new Set(["VECTOR_ZILLIZ_TOKEN", "EMBEDDING_API_KEY"]);

function mask(value: string): { isSet: boolean; preview: string; length: number } {
  if (!value) return { isSet: false, preview: "", length: 0 };
  const len = value.length;
  return {
    isSet: true,
    preview: len <= 12 ? "***" : value.slice(0, 6) + "..." + value.slice(-4),
    length: len,
  };
}

export async function GET() {
  const rows = await prisma.setting.findMany({ where: { key: { in: [...KEYS] } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const out: Record<string, unknown> = {};
  for (const k of KEYS) {
    const v = map.get(k) || "";
    if (SECRET_KEYS.has(k)) {
      out[k] = mask(v);
    } else {
      out[k] = v;
    }
  }
  return NextResponse.json({ ok: true, config: out });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const updates: { key: string; value: string }[] = [];
  for (const k of KEYS) {
    if (k in body) {
      const raw = body[k];
      // 空字符串视为"保留原值不动"（防止误清 token）
      if (typeof raw === "string" && raw.trim() === "" && SECRET_KEYS.has(k)) continue;
      updates.push({ key: k, value: String(raw ?? "").trim() });
    }
  }
  for (const u of updates) {
    await prisma.setting.upsert({
      where: { key: u.key },
      update: { value: u.value },
      create: u,
    });
  }
  return NextResponse.json({ ok: true, updated: updates.length });
}
