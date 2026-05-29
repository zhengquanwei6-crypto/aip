/**
 * showcase v4 · `/api/showcase/demo` — 匿名 Live Agent Demo 端点
 *
 * 责任：
 *   - 校验访客 prompt（≤ 200 字）+ 可选 preset slot
 *   - 用 `_data/rate-limit.ts` 的双窗（IP 3/24h + 全局 100/24h）做限频
 *   - 在 `lib/api-key-pool` 路径下抢一条 LLM key（slug = "copy-writer"）
 *   - 流式转发上游 OpenAI 兼容 `/chat/completions`（SSE）
 *   - 流结束写入 prisma `AIOutput.type='showcase-demo'`，让本次调用自然回流到 Provenance ledger
 *
 * 返回 header：
 *   - `Content-Type: text/event-stream`
 *   - `X-RateLimit-Remaining`：本次成功后剩余可用名额（min(ip, global)）
 *   - `X-RateLimit-Reset`：epoch ms，下一个名额释放时刻
 *   - `X-Upstream-Model`：上游实际响应的模型 id
 *
 * 限频命中：返回 429 + JSON `{ scope, remaining, resetAt }`。
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { findAgent } from "@/lib/agent-types";
import { getLLMConfigWithSource, recordLLMResult } from "@/lib/ai/text";
import { tryConsume } from "../../_data/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROMPT_MAX = 200;
const STREAM_TIMEOUT_MS = 30_000;

interface DemoBody {
  prompt: string;
  preset?: string;
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "0.0.0.0";
}

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

export async function POST(req: NextRequest) {
  // 1) parse + validate body
  let body: DemoBody;
  try {
    body = (await req.json()) as DemoBody;
  } catch {
    return badRequest("invalid json body");
  }
  const prompt = (body?.prompt ?? "").toString().trim();
  if (prompt.length === 0) return badRequest("prompt required");
  if (prompt.length > PROMPT_MAX) return badRequest(`prompt too long (max ${PROMPT_MAX})`);
  const preset = typeof body.preset === "string" ? body.preset.slice(0, 32) : undefined;

  // 2) rate-limit check
  const ip = clientIp(req);
  const now = Date.now();
  const consume = tryConsume(ip, now);
  if (!consume.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        scope: consume.scope,
        remaining: 0,
        resetAt: consume.resetAt,
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(consume.resetAt),
          "X-RateLimit-Scope": consume.scope ?? "unknown",
        },
      },
    );
  }

  // 3) resolve copy-writer agent + LLM key
  const agent = findAgent("copy-writer");
  if (!agent) {
    return NextResponse.json(
      { error: "copy-writer agent not registered" },
      { status: 500 },
    );
  }
  const cfg = await getLLMConfigWithSource();
  if (!cfg.apiKey || !cfg.baseUrl) {
    return NextResponse.json(
      {
        error: "model_unavailable",
        reason: "no LLM key in pool",
      },
      {
        status: 503,
        headers: {
          "X-RateLimit-Remaining": String(consume.remaining),
          "X-RateLimit-Reset": String(consume.resetAt),
        },
      },
    );
  }

  // 4) build upstream request
  const upstreamUrl = `${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const upstreamBody = {
    model: cfg.model,
    stream: true,
    temperature: 0.7,
    max_tokens: 600,
    messages: [
      { role: "system", content: agent.systemPrompt },
      { role: "user", content: prompt },
    ],
  };

  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), STREAM_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(upstreamBody),
      signal: ac.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    await recordLLMResult(cfg._activeKey, false, (err as Error).message);
    return NextResponse.json(
      { error: "upstream_unreachable", reason: (err as Error).message },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    clearTimeout(timeoutId);
    const errText = (await upstream.text()).slice(0, 500);
    await recordLLMResult(cfg._activeKey, false, `${upstream.status}: ${errText}`);
    return NextResponse.json(
      {
        error: "upstream_error",
        status: upstream.status,
        reason: errText,
      },
      {
        status: upstream.status,
        headers: {
          "X-Upstream-Model": cfg.model ?? "",
          "X-RateLimit-Remaining": String(consume.remaining),
          "X-RateLimit-Reset": String(consume.resetAt),
        },
      },
    );
  }

  // 5) tee SSE: pass through to client byte-for-byte while accumulating
  //    plain-text deltas for AIOutput persistence.
  const upstreamReader = upstream.body?.getReader();
  if (!upstreamReader) {
    clearTimeout(timeoutId);
    await recordLLMResult(cfg._activeKey, false, "empty upstream body");
    return NextResponse.json(
      { error: "upstream_empty_body" },
      { status: 502 },
    );
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let collected = "";
  let tokenCount = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const t0 = Date.now();
      let sseBuffer = "";

      const finish = async (success: boolean, errMsg?: string) => {
        clearTimeout(timeoutId);
        const ms = Date.now() - t0;
        try {
          await prisma.aIOutput.create({
            data: {
              type: "showcase-demo",
              input: JSON.stringify({
                prompt,
                preset,
                ip,
                meta: {
                  tokens: tokenCount,
                  ms,
                  finish: success ? "stop" : "error",
                  error: errMsg ?? null,
                },
              }),
              output: collected,
              model: cfg.model ?? "",
            },
          });
        } catch {
          /* persistence failure is non-fatal for the visitor */
        }
        await recordLLMResult(cfg._activeKey, success, errMsg ?? null);
      };

      try {
        while (true) {
          const { done, value } = await upstreamReader.read();
          if (done) break;
          if (!value) continue;
          // pass-through to client
          controller.enqueue(value);
          // accumulate for persistence
          sseBuffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = sseBuffer.indexOf("\n")) !== -1) {
            const line = sseBuffer.slice(0, idx).trim();
            sseBuffer = sseBuffer.slice(idx + 1);
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const j = JSON.parse(payload);
              const delta =
                j?.choices?.[0]?.delta?.content ??
                j?.choices?.[0]?.message?.content ??
                "";
              if (typeof delta === "string" && delta.length > 0) {
                collected += delta;
                tokenCount += 1;
              }
            } catch {
              /* ignore unparseable line */
            }
          }
        }
        await finish(true);
        controller.close();
      } catch (err) {
        await finish(false, (err as Error).message);
        controller.error(err);
      }
    },
    async cancel() {
      try {
        await upstreamReader.cancel();
      } catch {
        /* ignore */
      }
      clearTimeout(timeoutId);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Upstream-Model": cfg.model ?? "",
      "X-RateLimit-Remaining": String(consume.remaining),
      "X-RateLimit-Reset": String(consume.resetAt),
    },
  });
}
