/**
 * v0.17-C1 · GET /api/comfyui/result/{promptId}
 *
 * 拉一个 prompt 的最终输出。返回每张图的 ComfyUI 端 filename + 相对该
 * 工作流的节点 id；图片字节本身走 /api/comfyui/view 路由按需取。
 *
 * 也可加 ?download=1 直接拉所有图字节回来落到 prisma。当前简化版本只回
 * filename 引用。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getHistory } from "@/lib/adapters/comfyui/client";
import { persistComfyOutputs } from "@/lib/comfyui/persist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { promptId: string } },
) {
  const t0 = Date.now();
  try {
    const h = await getHistory(params.promptId);
    if (!h) {
      // history 里没找到通常意味着两种情况：
      //   1. prompt 还在 queue / 正在跑 —— ComfyUI 只在完成（success / error）
      //      后才把它加进 /history，所以这是正常状态而非错误。
      //   2. ComfyUI 重启 / 老了被淘汰（默认只保留 maxsize ≈ 10000，但
      //      重启后清零），这时确实拿不到结果。
      // 我们回 200 + status="pending"，让客户端继续轮询；UI 看到第 N 次
      // 都还 pending 才认定丢失。这样不会让一个还没跑完的 prompt 在
      // /api/comfyui/result 上永远报错。
      return NextResponse.json({
        ok: true,
        promptId: params.promptId,
        status: "pending",
        outputs: {},
        message: "尚未在 history 中（可能仍在队列/执行中，请继续轮询）",
        timing: { totalMs: Date.now() - t0 },
      });
    }

    // v0.17-CF1: success 时下载图落地本地 Asset (幂等), 不再重复写 comfyui-result
    let persistedAssets: Awaited<ReturnType<typeof persistComfyOutputs>> = [];
    if (h.status === "success") {
      try {
        let promptText;
        let templateSlug;
        try {
          const submitRow = await prisma.aIOutput.findFirst({
            where: { type: "comfyui-submit", output: { contains: params.promptId } },
            orderBy: { createdAt: "desc" },
          });
          if (submitRow?.input) {
            const parsed = JSON.parse(submitRow.input);
            templateSlug = parsed.templateSlug;
            promptText = parsed?.vars?.prompt || parsed?.vars?.positive || undefined;
          }
        } catch { /* ignore */ }
        persistedAssets = await persistComfyOutputs(params.promptId, h.outputs, { templateSlug, prompt: promptText });
      } catch (e) {
        console.warn("[comfyui/result/persist]", (e as Error).message);
      }
    }

    return NextResponse.json({
      ok: true,
      promptId: h.promptId,
      status: h.status,
      outputs: h.outputs,
      assets: persistedAssets,
      timing: { totalMs: Date.now() - t0 },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message, timing: { totalMs: Date.now() - t0 } },
      { status: 200 },
    );
  }
}
