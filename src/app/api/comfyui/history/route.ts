/**
 * v0.17-C8 · GET /api/comfyui/history
 *
 * 列出最近的 ComfyUI 任务（submit + result 配对）。每条记录里包含：
 *   - promptId · 提交时拿到的 ComfyUI prompt_id
 *   - templateSlug · 用了哪个模板（自由 workflow 时是 "(custom)"）
 *   - vars · 提交时的参数表（可让用户一键复用）
 *   - status · running | success | error | submitted（取决于是否有对应 result 记录）
 *   - outputs · 成品图引用（filename/subfolder/type/nodeId）
 *   - createdAt · 提交时间
 *
 * 数据来源：AIOutput 表里 type='comfyui-submit' / 'comfyui-result' 两类。
 * 同一 promptId 上的 submit + result 合并成单条 entry。
 *
 * 返回最近 50 条（提交时间 desc）。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubmitEntry = {
  promptId?: string;
  templateSlug?: string;
  vars?: Record<string, unknown>;
  workflow?: unknown;
};

type ResultEntry = {
  status?: "success" | "error" | "running" | "unknown";
  outputs?: Record<string, Array<{ filename?: string; subfolder?: string; type?: string }>>;
};

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const limit = Math.min(
    100,
    Math.max(5, Number.parseInt(req.nextUrl.searchParams.get("limit") || "50", 10) || 50),
  );

  try {
    const rows = await prisma.aIOutput.findMany({
      where: {
        type: { in: ["comfyui-submit", "comfyui-result"] },
      },
      orderBy: { createdAt: "desc" },
      take: limit * 2, // submit + result 成对，多取一些再合并
    });

    // 按 promptId 索引；submit 是主，result 是补充
    const byId = new Map<
      string,
      {
        promptId: string;
        templateSlug?: string;
        model?: string;
        vars?: Record<string, unknown>;
        status: "submitted" | "running" | "success" | "error";
        outputs?: ResultEntry["outputs"];
        submittedAt?: string;
        completedAt?: string;
      }
    >();

    for (const r of rows) {
      let inputJson: SubmitEntry | { promptId?: string } = {};
      let outputJson: { promptId?: string; status?: string; outputs?: ResultEntry["outputs"] } = {};
      try { inputJson = JSON.parse(r.input || "{}"); } catch {}
      try { outputJson = JSON.parse(r.output || "{}"); } catch {}

      const pid =
        (r.type === "comfyui-submit" && (outputJson as { promptId?: string }).promptId) ||
        (r.type === "comfyui-result" && (inputJson as { promptId?: string }).promptId) ||
        "";
      if (!pid) continue;

      let entry = byId.get(pid);
      if (!entry) {
        entry = {
          promptId: pid,
          status: "submitted",
        };
        byId.set(pid, entry);
      }

      if (r.type === "comfyui-submit") {
        const sub = inputJson as SubmitEntry;
        entry.templateSlug = sub.templateSlug || "(custom)";
        entry.vars = sub.vars;
        entry.model = r.model || undefined;
        entry.submittedAt = r.createdAt.toISOString();
      } else if (r.type === "comfyui-result") {
        const status = (outputJson.status as typeof entry.status) || "submitted";
        // 只有更"完成"的状态才覆盖（避免老的 running 写覆盖新的 success）
        const rank = { submitted: 0, running: 1, success: 2, error: 2 } as const;
        if (rank[status as keyof typeof rank] >= rank[entry.status as keyof typeof rank]) {
          entry.status = status as typeof entry.status;
        }
        if (outputJson.outputs) entry.outputs = outputJson.outputs;
        entry.completedAt = r.createdAt.toISOString();
      }
    }

    // 按 submittedAt（fallback completedAt）desc 排
    // v0.17-CF5: 用 comfyui:persisted:{promptId} 标记补 status+outputs。
    // CF1 后 result 不再写 comfyui-result AIOutput, 历史 status 改靠落地标记。
    // 落地标记存的是本地 Asset (id + /uploads url), 比远程 filename 更可靠。
    try {
      const ids = Array.from(byId.keys());
      if (ids.length > 0) {
        const marks = await prisma.setting.findMany({
          where: { key: { in: ids.map((id) => "comfyui:persisted:" + id) } },
        });
        for (const m of marks) {
          const pid = m.key.replace("comfyui:persisted:", "");
          const entry = byId.get(pid);
          if (!entry) continue;
          try {
            const persisted = JSON.parse(m.value) as Array<{ assetId: string; url: string; filename: string; nodeId: string }>;
            if (persisted.length > 0) {
              entry.status = "success";
              // 用本地 url 重建 outputs (nodeId -> [{ filename=本地url, localUrl }])
              const outs: Record<string, Array<{ filename?: string; subfolder?: string; type?: string; localUrl?: string; assetId?: string }>> = {};
              for (const a of persisted) {
                const nid = a.nodeId || "9";
                if (!outs[nid]) outs[nid] = [];
                outs[nid].push({ filename: a.filename, subfolder: "", type: "output", localUrl: a.url, assetId: a.assetId });
              }
              entry.outputs = outs as any;
            }
          } catch { /* skip bad json */ }
        }
      }
    } catch (e) {
      console.warn("[comfyui/history/persisted]", (e as Error).message);
    }

    const list = Array.from(byId.values())
      .sort((a, b) => {
        const ta = a.submittedAt || a.completedAt || "";
        const tb = b.submittedAt || b.completedAt || "";
        return tb.localeCompare(ta);
      })
      .slice(0, limit);

    return NextResponse.json({
      ok: true,
      count: list.length,
      items: list,
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
