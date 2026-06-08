/**
 * v0.17-C1 · GET /api/comfyui/status
 *
 * 返回 ComfyUI 实例当前状态：连通性、版本、GPU、队列、装了哪些节点和模型。
 * 给 /ai-tools/comfy 页面顶部显示用 + 给 /api/health 子段汇总用。
 */
import { NextResponse } from "next/server";
import {
  getSystemStats,
  getQueueStatus,
  getObjectInfo,
  getComfyConfig,
} from "@/lib/adapters/comfyui/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const t0 = Date.now();
  try {
    const cfg = await getComfyConfig();
    const [stats, queue, objects] = await Promise.allSettled([
      getSystemStats(),
      getQueueStatus(),
      getObjectInfo(),
    ]);

    if (stats.status === "rejected") {
      return NextResponse.json(
        {
          ok: false,
          error: `system_stats 失败: ${(stats.reason as Error)?.message ?? "unknown"}`,
          baseUrl: cfg.baseUrl,
          timing: { totalMs: Date.now() - t0 },
        },
        { status: 200 },
      );
    }

    let nodeCount = 0;
    let installed: { ckpts?: string[]; unets?: string[]; loras?: string[]; controlnets?: string[]; vaes?: string[] } = {};
    if (objects.status === "fulfilled") {
      const info = objects.value;
      nodeCount = Object.keys(info).length;
      installed = {
        ckpts: getEnum(info, "CheckpointLoaderSimple", "ckpt_name"),
        unets: getEnum(info, "UNETLoader", "unet_name"),
        loras: getEnum(info, "LoraLoader", "lora_name"),
        controlnets: getEnum(info, "ControlNetLoader", "control_net_name"),
        vaes: getEnum(info, "VAELoader", "vae_name"),
      };
    }

    return NextResponse.json({
      ok: true,
      baseUrl: cfg.baseUrl,
      authConfigured: Boolean(cfg.authToken),
      stats: stats.value,
      queue:
        queue.status === "fulfilled"
          ? queue.value
          : { running: 0, pending: 0, error: (queue.reason as Error)?.message },
      nodeCount,
      installed,
      timing: { totalMs: Date.now() - t0 },
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: (e as Error).message,
        timing: { totalMs: Date.now() - t0 },
      },
      { status: 500 },
    );
  }
}

function getEnum(
  info: Record<string, { inputs: { required: Record<string, unknown> } }>,
  classType: string,
  field: string,
): string[] {
  const node = info[classType];
  const inp = node?.inputs.required[field];
  if (Array.isArray(inp) && Array.isArray(inp[0])) return inp[0] as string[];
  return [];
}
