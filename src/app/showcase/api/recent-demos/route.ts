/**
 * showcase v4 · `/api/showcase/recent-demos`
 *
 * GET 返回最近 5 条 `AIOutput.type='showcase-demo'`。给两类调用方共享：
 *   1) 客户端 LiveStats 5s 轮询，把最新的访客 demo 反馈进 Provenance ledger 顶部
 *   2) 移动端 LiveDemo 只读模式（< 768px viewport）展示其它访客刚跑过的 3 条
 *
 * 仅返回脱敏字段（input.prompt / output 头 200 字 / model / 相对时间），不外抛 IP / meta。
 *
 * Validates: Requirements 3.6, 11.2
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const RECENT_LIMIT = 5;
const PROMPT_PREVIEW = 80;
const OUTPUT_PREVIEW = 200;

function ago(d: Date, now: number): string {
  const sec = Math.max(0, Math.floor((now - d.getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d2 = Math.floor(h / 24);
  return `${d2}d ago`;
}

export async function GET() {
  let rows: Array<{
    id: string;
    input: string | null;
    output: string | null;
    model: string | null;
    createdAt: Date;
  }> = [];
  try {
    rows = await prisma.aIOutput.findMany({
      where: { type: "showcase-demo" },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        input: true,
        output: true,
        model: true,
        createdAt: true,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "prisma_failed",
        reason: (err as Error).message,
      },
      { status: 500 },
    );
  }

  const now = Date.now();
  const items = rows.map((r) => {
    let promptPreview = "";
    try {
      const j = JSON.parse(r.input ?? "{}");
      const raw = typeof j.prompt === "string" ? j.prompt : "";
      promptPreview = raw.length > PROMPT_PREVIEW
        ? raw.slice(0, PROMPT_PREVIEW) + "…"
        : raw;
    } catch {
      promptPreview = "";
    }
    const out = (r.output ?? "").replace(/\s+/g, " ").trim();
    const outputPreview = out.length > OUTPUT_PREVIEW
      ? out.slice(0, OUTPUT_PREVIEW) + "…"
      : out;
    return {
      id: r.id,
      promptPreview,
      outputPreview,
      model: r.model ?? "",
      isoDate: r.createdAt.toISOString(),
      ago: ago(r.createdAt, now),
    };
  });

  return NextResponse.json({ ok: true, items, generatedAt: new Date(now).toISOString() });
}
