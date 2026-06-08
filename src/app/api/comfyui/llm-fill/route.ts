/**
 * v0.17-C3 · POST /api/comfyui/llm-fill
 *
 * 用户中文需求 → LLM 选模板 + 填 vars。返回完整 vars 让 UI 显示给用户预览
 * （还没真跑），用户确认后再 POST /api/comfyui/run 提交。
 *
 * 请求体：{ userIntent, promptEn?, forceTemplateSlug?, inputImageName? }
 * 响应体：{ ok, templateSlug, label, vars, reason, model }
 */
import { NextRequest, NextResponse } from "next/server";
import { fillWorkflowWithLLM } from "@/lib/adapters/comfyui/llm-fill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

    const r = await fillWorkflowWithLLM({
      userIntent,
      promptEn: body?.promptEn ? String(body.promptEn) : undefined,
      forceTemplateSlug: body?.forceTemplateSlug
        ? String(body.forceTemplateSlug)
        : undefined,
      hasInputImage: Boolean(body?.inputImageName),
      inputImageName: body?.inputImageName ? String(body.inputImageName) : undefined,
    });

    return NextResponse.json({
      ...(r.ok
        ? {
            ok: true,
            templateSlug: r.template?.slug,
            label: r.template?.label,
            expectedSec: r.template?.expectedSec,
            vars: r.vars,
            reason: r.reason,
          }
        : {
            ok: false,
            error: r.error,
            rawLlm: r.rawLlm,
          }),
      model: r.model,
      timing: { totalMs: Date.now() - t0 },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message, timing: { totalMs: Date.now() - t0 } },
      { status: 200 },
    );
  }
}
