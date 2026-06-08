/**
 * v0.17-C9 · GET /api/comfyui/progress/{promptId} · SSE 中继 + 轮询兜底
 *
 * 双通道完成检测，解决"图早就生成好了但前端一直转圈"的问题：
 *
 *   通道 A（实时）：服务端开 ComfyUI WebSocket，把 progress / preview /
 *     executing 等事件 forward 给浏览器 SSE。延迟最低，有中间预览图。
 *
 *   通道 B（兜底）：服务端每 2 秒查一次 /history。只要任一通道先发现
 *     success / error，就立刻推 `done` 事件（直接带上成品 outputs，前端
 *     无需再单独 fetch /result），然后断流。
 *
 * 为什么需要兜底：
 *   - cloudstudio 反代偶发把 WS upgrade 丢掉 → execution_success 永远收不到
 *   - prompt 在浏览器打开 SSE 之前就跑完了 → WS 不会再补发历史事件
 *   - WS 连上但 clientId 不匹配导致事件被过滤
 *
 * 浏览器侧事件类型：
 *   - "executing" · 当前执行节点
 *   - "progress"  · step / total
 *   - "preview"   · 中间预览图（dataURL）
 *   - "done"      · 完成（data.status = success|error, data.outputs = {...}）
 *   - "execution_error" · 兼容旧前端
 */
import { NextRequest } from "next/server";
import {
  subscribeProgress,
  getHistory,
  type ComfyWsEvent,
} from "@/lib/adapters/comfyui/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function GET(
  req: NextRequest,
  { params }: { params: { promptId: string } },
) {
  const promptId = params.promptId;
  if (!promptId) {
    return new Response("missing promptId", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let finished = false; // 已经推过 done（防止 WS + poll 双触发）

      const send = (eventType: string, data: unknown) => {
        if (closed) return;
        try {
          const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          /* controller may already be closed */
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearInterval(pollTimer);
        try {
          sub.close();
        } catch {
          /* ignore */
        }
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };

      // 统一的"完成"处理：带上 outputs，推 done，再断流。
      const finish = (
        status: "success" | "error",
        outputs: Record<string, unknown> = {},
        extra: Record<string, unknown> = {},
      ) => {
        if (finished || closed) return;
        finished = true;
        send("done", { promptId, status, outputs, ...extra });
        // 兼容旧前端：仍发 execution_success / execution_error
        send(status === "success" ? "execution_success" : "execution_error", {
          prompt_id: promptId,
          ...extra,
        });
        setTimeout(cleanup, 200);
      };

      // 心跳：每 15s，防止反代断 idle 连接
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
        } catch {
          /* ignore */
        }
      }, 15_000);

      // ── 通道 B：轮询兜底 ──────────────────────────────────────────
      // 立刻查一次（覆盖"打开 SSE 时图已生成好"的情况），之后每 2s 查。
      const pollOnce = async () => {
        if (finished || closed) return;
        try {
          const h = await getHistory(promptId);
          if (h && (h.status === "success" || h.status === "error")) {
            finish(h.status, h.outputs as Record<string, unknown>, {
              via: "poll",
            });
          }
        } catch {
          /* 单次轮询失败无所谓，下次再来 */
        }
      };
      const pollTimer = setInterval(pollOnce, 2_000);
      // 首查延迟 800ms，给刚提交的 prompt 一点进队列时间
      setTimeout(pollOnce, 800);

      // ── 通道 A：WebSocket 实时事件 ───────────────────────────────
      // ComfyUI 装了 crystools / kaytool 等监控插件，会每秒推好几条
      // crystools.monitor / kaytool.resources 噪音事件，跟出图无关，
      // 全部丢掉，只转发我们关心的执行类事件 + 预览。
      const FORWARD_EVENTS = new Set([
        "status",
        "execution_start",
        "execution_cached",
        "executing",
        "progress",
        "executed",
        "execution_success",
        "execution_error",
        "execution_interrupted",
      ]);

      const sub = subscribeProgress(
        (e: ComfyWsEvent) => {
          if (closed || finished) return;
          if (e.type === "binary_preview") {
            const data = e.data as { bytes: Buffer; mime: string };
            const dataUrl = `data:${data.mime};base64,${data.bytes.toString("base64")}`;
            send("preview", { dataUrl, mime: data.mime });
            return;
          }
          // 噪音事件直接丢
          if (!FORWARD_EVENTS.has(e.type)) return;
          // 透传实时事件（executing / progress / executed / status...）
          send(e.type, e.data);

          if (e.type === "execution_error") {
            const d = e.data as { exception_message?: string; node_id?: string; node_type?: string };
            finish("error", {}, {
              exception_message: d.exception_message,
              node_id: d.node_id,
              node_type: d.node_type,
            });
          } else if (e.type === "execution_success") {
            // WS 说成功了 — 立刻查 history 拿 outputs 再 done（带图）
            getHistory(promptId)
              .then((h) => finish("success", (h?.outputs as Record<string, unknown>) ?? {}, { via: "ws" }))
              .catch(() => finish("success", {}, { via: "ws" }));
          }
        },
        { promptId, autoCloseMs: 600_000 },
      );

      // 客户端断开 → 清理
      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
