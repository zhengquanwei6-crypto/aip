// /api/adapters/test-run - 干跑测试
//
// POST body: { adapter: AdapterConfig, apiKey: string, input?: GenerateInput }
// 用真实 API key 发一次请求，返回 trace（请求/响应/轮询历史）
//
// 这会消耗中转站额度，所以仅在用户明确点了"测试"按钮时才调用

import { NextRequest, NextResponse } from "next/server";
import { adapterConfigSchema, generateInputSchema } from "@/lib/adapter-types";
import { runAdapter } from "@/lib/adapter-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // Vercel 边界，本地 docker 不受影响

const requestSchema = adapterConfigSchema.pick({
  // 全字段都要，但允许从 body 直接拿
}).extend({}).and(
  // 实际上 adapterConfigSchema 已经 strict，下面我们用 .object 重组
  generateInputSchema.partial(),
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const adapter = adapterConfigSchema.safeParse(body.adapter);
    if (!adapter.success) {
      return NextResponse.json(
        { ok: false, error: "invalid adapter", details: adapter.error.flatten() },
        { status: 400 },
      );
    }
    if (typeof body.apiKey !== "string" || body.apiKey.length < 4) {
      return NextResponse.json(
        { ok: false, error: "apiKey 必填（至少 4 字符）" },
        { status: 400 },
      );
    }
    const input = generateInputSchema.parse({
      prompt: body.input?.prompt || "a cute cat",
      size: body.input?.size,
      n: body.input?.n ?? 1,
      quality: body.input?.quality,
      imageUrl: body.input?.imageUrl,
      extra: body.input?.extra,
    });

    // 给一个 90s 上限的 abort 信号，防 polling 跑飞
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90_000);
    try {
      const result = await runAdapter(adapter.data, input, {
        apiKey: body.apiKey,
        abortSignal: ctrl.signal,
        collectTrace: true,
      });
      return NextResponse.json({ ok: true, result });
    } finally {
      clearTimeout(timer);
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
  }
}
