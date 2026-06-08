/**
 * v0.17-C6 · POST /api/comfyui/llm-compose
 *
 * AI 直接生成完整 workflow JSON（不靠模板）。带本地校验 + LLM 自纠回路。
 * 这条路径耗 token 比模板填空多 5 倍，给"用户想要超出 4 个模板范围"的
 * 高级模式用。
 *
 * 请求体：{ userIntent, promptEn?, inputImageName?, maxIterations? }
 * 响应体：{ ok, workflow, explanation, iterations, errorHistory }
 */
import { NextRequest, NextResponse } from "next/server";
import { composeWorkflow } from "@/lib/adapters/comfyui/llm-compose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180; // 自纠 3 轮 × 每轮 ~50s = 150s

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const userIntent = String(body?.userIntent || "").trim();
    if (!userIntent) {
      return NextResponse.json(
        { ok: false, error: "请提供 userIntent" },
        { status: 400 },
      );
    }
    const r = await composeWorkflow({
      userIntent,
      promptEn: body?.promptEn ? String(body.promptEn) : undefined,
      inputImageName: body?.inputImageName ? String(body.inputImageName) : undefined,
      maxIterations: Number(body?.maxIterations) || undefined,
    });
    return NextResponse.json({
      ...r,
      timing: { totalMs: Date.now() - t0 },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message, timing: { totalMs: Date.now() - t0 } },
      { status: 200 },
    );
  }
}
