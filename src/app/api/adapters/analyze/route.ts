/**
 * /api/adapters/analyze - LLM 文档分析（v2 自适配版，修 TS any）
 */

import { NextRequest, NextResponse } from "next/server";
import { adapterConfigSchema } from "@/lib/adapter-types";
import { prisma } from "@/lib/db";
import { fetchDocFromUrl } from "@/lib/doc-fetcher";
import { isCurlCommand, parseCurl, renderCurlForLLM } from "@/lib/curl-parser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function readLlmConfig() {
  const rows = await prisma.setting.findMany({
    where: { key: { in: ["LLM_API_BASE_URL", "LLM_API_KEY", "LLM_MODEL"] } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    baseUrl: map["LLM_API_BASE_URL"] || process.env.LLM_API_BASE_URL || "https://api.openai.com/v1",
    apiKey:  map["LLM_API_KEY"]      || process.env.LLM_API_KEY      || "",
    model:   map["LLM_MODEL"]        || process.env.LLM_MODEL        || "gpt-4o-mini",
  };
}

const SYSTEM_PROMPT = `你是 API 适配器配置生成器。给定一份"图片生成 API"的文档（也可能是 curl 示例），输出**严格符合 schema 的 JSON**。

**只输出 JSON，不要带任何说明文字、不要 markdown 代码块**。

Schema:
{
  "slug": "kebab-case-id",
  "name": "显示名（短）",
  "baseUrl": "https://api.example.com/v1",
  "auth": {
    "type": "bearer" | "api-key-header" | "query-param" | "none",
    "headerName": "Authorization",
    "valueTemplate": "Bearer {API_KEY}",
    "paramName": "key"
  },
  "flow": {
    // 同步：
    "type": "sync",
    "endpoint": { "method": "POST", "path": "/v1/images/generations" },
    "request": { "contentType": "application/json", "bodyTemplate": { "prompt": "{prompt}", "size": "{size}", "n": "{n}" } },
    "response": { "imageUrlPath": "data[*].url", "errorPath": "error.message" }
    // 或异步轮询：
    // "type": "async-polling",
    // "submit": { endpoint, request, response: { taskIdPath } },
    // "poll": { endpoint, intervalMs, timeoutMs, statusPath, doneStatuses[], failStatuses[], imageUrlPath, errorPath? }
  },
  "enabled": true
}

**JSONPath**：
- "data.foo[0].url"
- "data.items[*].url"   数组展开
- "data.json>>resultUrls[*]"   双 >> 表示先 JSON.parse 再取（KIE 这种）

**模板变量**：
- {API_KEY} {prompt} {size} {n} {quality} {imageUrl} {taskId}
- {extra.aspectRatio} {extra.resolution} 等任意自定义

**判断**：
- 文档若提到 "taskId / queryById / 异步任务 / record-info / 轮询" → async-polling
- 文档若直接 POST 一次返回图片 url → sync
- bodyTemplate 字段全部按文档照搬，**不要自己加额外字段**
- 不确定的可选字段（sourceUrl / description / errorPath / queryTemplate）**直接省略**，不要写 null
- slug 用 kebab-case，从 name 派生

**关键例外（仅在以下情形返回，唯一允许的非 schema 形式）**：
- 文档**完全不是图片生成 API**（账户管理、文件下载、用量统计、SDK 安装等）：
  返回 { "error": "not_image_api", "summary": "看到的是 XXX 类型文档" }
- 文档是图片生成相关，但**信息不足**（没看到任何 endpoint / 请求体）：
  返回 { "error": "insufficient_info", "summary": "看到了 XXX 但没找到具体 endpoint / 请求体", "hint": "请提供具体接口页 URL，或粘贴 curl 示例" }`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sources: Array<{ kind: string; bytes: number; source?: string }> = [];
    const fetchedParts: string[] = [];

    // ── A) URL 来源（多重 fetch）──
    if (typeof body.url === "string" && body.url.length > 0) {
      const docFetchResult = await fetchDocFromUrl(body.url, 30_000);
      if (docFetchResult.ok && docFetchResult.text) {
        fetchedParts.push(`# 来自 URL（${docFetchResult.finalSource}）\n\n${docFetchResult.text}`);
        sources.push({ kind: "url", bytes: docFetchResult.text.length, source: docFetchResult.finalSource });
      } else {
        sources.push({ kind: "url", bytes: 0, source: "all-fetch-failed" });
      }
    }

    // ── B) 用户粘贴文本 — 自动检测是否 curl ──
    if (typeof body.text === "string" && body.text.trim().length > 0) {
      const raw: string = body.text.trim();
      const curlBlocks = raw
        .split(/\n(?=\s*curl\s)/i)
        .filter((b: string) => isCurlCommand(b));
      if (curlBlocks.length > 0) {
        for (const block of curlBlocks) {
          const parsed = parseCurl(block);
          if (parsed) {
            fetchedParts.push(`# 用户粘贴的 curl 示例（已结构化解析）\n\n${renderCurlForLLM(parsed)}\n\n# 原始 curl\n\n\`\`\`\n${block.trim()}\n\`\`\``);
            sources.push({ kind: "curl", bytes: block.length, source: parsed.url });
          } else {
            fetchedParts.push(`# 用户粘贴的 curl 示例（解析失败，原文）\n\n\`\`\`\n${block}\n\`\`\``);
            sources.push({ kind: "curl-raw", bytes: block.length });
          }
        }
      } else {
        fetchedParts.push(`# 用户粘贴的文档内容\n\n${raw.slice(0, 30_000)}`);
        sources.push({ kind: "text", bytes: raw.length });
      }
    }

    if (fetchedParts.length === 0) {
      return NextResponse.json({
        ok: false,
        error: "需要提供 url 或 text（或粘贴一段 curl 示例）",
      }, { status: 400 });
    }

    const nameHint = typeof body.nameHint === "string" ? body.nameHint : "";

    const { baseUrl, apiKey, model } = await readLlmConfig();
    if (!apiKey) {
      return NextResponse.json({
        ok: false,
        error: "尚未配置 LLM_API_KEY，请到设置页填写",
      }, { status: 400 });
    }

    const userContent = [
      nameHint ? `名称提示：${nameHint}` : "",
      ...fetchedParts,
    ].filter(Boolean).join("\n\n---\n\n");

    const llmResp = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!llmResp.ok) {
      const errText = await llmResp.text();
      return NextResponse.json({
        ok: false,
        error: `LLM HTTP ${llmResp.status}`,
        detail: errText.slice(0, 500),
        sources,
      }, { status: 502 });
    }

    const llmJson = await llmResp.json();
    const content: unknown = llmJson?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return NextResponse.json({
        ok: false,
        error: "LLM 返回格式异常",
        sources,
      }, { status: 502 });
    }

    let parsedJson: any;
    try {
      parsedJson = JSON.parse(content);
    } catch {
      return NextResponse.json({
        ok: false,
        error: "LLM 输出不是合法 JSON",
        rawOutput: content.slice(0, 1500),
        sources,
      }, { status: 422 });
    }

    if (parsedJson && typeof parsedJson === "object" && "error" in parsedJson && !("flow" in parsedJson)) {
      const code = parsedJson.error;
      const summary = parsedJson.summary;
      const hint = parsedJson.hint;
      let userMsg = "";
      if (code === "not_image_api") {
        userMsg = `LLM 判断：这不是图片生成 API。${summary ? `（${summary}）` : ""}`;
      } else if (code === "insufficient_info") {
        userMsg = `LLM 判断：文档信息不足。${summary ? `（${summary}）` : ""}`;
      } else {
        userMsg = `LLM 拒绝分析：${code}`;
      }
      return NextResponse.json({
        ok: false,
        error: userMsg,
        hint: hint ?? "建议：① 换具体接口页 URL；② 直接把 curl 示例粘贴到下方文档框；③ 在设置页换更强的 LLM 模型（gpt-4o / claude-3.5-sonnet）",
        sources,
      }, { status: 422 });
    }

    const validated = adapterConfigSchema.safeParse(parsedJson);
    if (!validated.success) {
      const issues = validated.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
        code: i.code,
      }));
      return NextResponse.json({
        ok: false,
        error: "LLM 输出未通过 schema 校验",
        rawOutput: parsedJson,
        validationIssues: issues,
        validationErrors: validated.error.flatten(),
        sources,
      }, { status: 422 });
    }

    return NextResponse.json({
      ok: true,
      adapter: validated.data,
      sources,
    });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: e?.message ?? "unknown",
    }, { status: 500 });
  }
}
