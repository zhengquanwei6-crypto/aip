/**
 * v0.17-C8 · GET /api/ai-tools/prompt-gen/history
 *
 * 列出最近的 prompt-gen 输出。原本 prompt-gen 调用就在 AIOutput 表里
 * 写过 type='prompt-gen'，但前端没拉过显示。这里把它暴露出来。
 *
 * 返回最近 N 条（createdAt desc）。每条带原始 input 和 output JSON
 * 让前端可以一键复用主题 / 平台 / 语言 / 模型选择。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const limit = Math.min(
    100,
    Math.max(5, Number.parseInt(req.nextUrl.searchParams.get("limit") || "30", 10) || 30),
  );

  try {
    const rows = await prisma.aIOutput.findMany({
      where: { type: "prompt-gen" },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const items = rows.map((r) => {
      let input: Record<string, unknown> = {};
      let output: Record<string, unknown> = {};
      try { input = JSON.parse(r.input || "{}"); } catch {}
      try { output = JSON.parse(r.output || "{}"); } catch {}
      // 单条 prompt-gen 通常 prompts 比较多；只保留最高层级 + 第一个 prompt 摘要
      const summary = {
        theme: input.theme,
        platform: input.platform,
        language: input.language,
        count: Array.isArray((output as { prompts?: unknown[] }).prompts)
          ? ((output as { prompts: unknown[] }).prompts).length
          : 0,
        firstTitle:
          Array.isArray((output as { prompts?: { title?: string }[] }).prompts) &&
          (output as { prompts: { title?: string }[] }).prompts[0]?.title,
      };
      return {
        id: r.id,
        model: r.model,
        createdAt: r.createdAt.toISOString(),
        summary,
        input,
        output,
      };
    });

    return NextResponse.json({
      ok: true,
      count: items.length,
      items,
      timing: { totalMs: Date.now() - t0 },
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: (e as Error).message,
        timing: { totalMs: Date.now() - t0 },
      },
      { status: 200 },
    );
  }
}
