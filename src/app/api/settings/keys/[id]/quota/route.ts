/**
 * v0.16 · /api/settings/keys/[id]/quota
 *
 * 查询某条 API Key 在上游中转站的额度 / 余额信息。
 *
 * 探测多个 OpenAI 兼容路径，按"最先返回有意义结果"原则：
 *   - GET /v1/dashboard/billing/subscription（OpenAI 历史 API · 多家中转站兼容）
 *   - GET /dashboard/billing/subscription
 *   - GET /v1/dashboard/billing/credit_grants（OpenAI 旧 API · 部分中转兼容）
 *   - GET /v1/users/me  /me  /user  /api/v1/me（CometAPI 等）
 *   - GET /v1/me/balance / /v1/billing
 *
 * 解析逻辑：从返回 JSON 里寻找 {hard_limit_usd / total_used / total_granted /
 * balance / available / quota / remain* / used*} 等字段并给出标准结构。
 *
 * 不消耗 token / image quota（只查账户自身）。
 *
 * 行为：
 *   - 200 + ok:true 表示拿到额度信息（带 quota 对象）
 *   - 200 + ok:false 表示明确失败（带 error 信息）
 *   - 该接口不修改 Setting / ApiKey 错误计数（只读）
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface QuotaInfo {
  /** 总额度 USD（已授予 / hard limit） */
  totalUsd?: number;
  /** 已使用 USD */
  usedUsd?: number;
  /** 剩余 USD */
  remainingUsd?: number;
  /** 一些中转站用 RMB / 积分 */
  unit?: string;
  /** 计划名 */
  plan?: string;
  /** 是否已过期 */
  expired?: boolean;
  /** 上游原始返回（截断） */
  raw?: any;
  /** 命中的探测端点 */
  endpoint: string;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** 从任意返回 JSON 里提取额度字段（多家中转站差异极大，全用启发式） */
function parseQuota(j: any): Partial<QuotaInfo> {
  if (!j || typeof j !== "object") return {};
  const out: Partial<QuotaInfo> = {};

  // 占位检测：CometAPI / OneAPI 等开源转发器
  // 在 /dashboard/billing/subscription 路径上常返回 hard_limit_usd = 100000000
  // (1 亿)等无意义的占位值。识别后忽略，让探测继续往下走真实 user/self 接口。
  const PLACEHOLDER_LIMIT = 99_999_999;

  // 标准 OpenAI dashboard/billing/subscription 形态
  if (typeof j.hard_limit_usd === "number" && j.hard_limit_usd < PLACEHOLDER_LIMIT)
    out.totalUsd = j.hard_limit_usd;
  if (
    typeof j.system_hard_limit_usd === "number" &&
    j.system_hard_limit_usd < PLACEHOLDER_LIMIT &&
    out.totalUsd == null
  )
    out.totalUsd = j.system_hard_limit_usd;
  if (typeof j.total_granted === "number" && out.totalUsd == null)
    out.totalUsd = j.total_granted;
  if (typeof j.total_used === "number") out.usedUsd = j.total_used;
  if (typeof j.total_available === "number") out.remainingUsd = j.total_available;
  if (typeof j.plan?.title === "string") out.plan = j.plan.title;

  // CometAPI / 类似中转：{ data: { quota / used_quota / quota_per_unit / username } }
  const d = j.data && typeof j.data === "object" ? j.data : j;
  // CometAPI 的 quota 是"剩余配额"（int，单位 0.001 USD）
  // quota_per_unit 是 1 USD 的 unit 数（默认 500_000，即 1 quota = 1/500_000 USD）
  if (typeof d.quota === "number") {
    const perUnit = typeof d.quota_per_unit === "number" && d.quota_per_unit > 0
      ? d.quota_per_unit
      : 500_000;
    out.remainingUsd = d.quota / perUnit;
  }
  if (typeof d.used_quota === "number") {
    const perUnit = typeof d.quota_per_unit === "number" && d.quota_per_unit > 0
      ? d.quota_per_unit
      : 500_000;
    out.usedUsd = d.used_quota / perUnit;
  }
  if (typeof d.balance === "number") {
    out.remainingUsd ??= d.balance;
  }
  if (typeof d.usd === "number") {
    out.remainingUsd ??= d.usd;
  }
  if (typeof d.expired === "boolean") out.expired = d.expired;
  if (typeof d.username === "string" && !out.plan) out.plan = `账户 ${d.username}`;
  if (typeof d.group === "string" && !out.plan) out.plan = `分组 ${d.group}`;

  // 一些站会同时返回 totalUsd/usedUsd 但不算 remaining
  if (out.totalUsd != null && out.usedUsd != null && out.remainingUsd == null) {
    out.remainingUsd = Math.max(0, out.totalUsd - out.usedUsd);
  }

  return out;
}

const PROBE_PATHS = [
  // OpenAI 标准 / 多家兼容
  "/dashboard/billing/subscription",
  "/v1/dashboard/billing/subscription",
  "/v1/dashboard/billing/credit_grants",
  // CometAPI / OneAPI / NewAPI 等开源转发器
  "/api/user/self",
  "/api/user/dashboard",
  "/api/v1/me",
  "/v1/me",
  "/v1/user",
  "/v1/users/me",
  "/v1/me/balance",
];

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = params.id;
  if (!id) return NextResponse.json({ ok: false, error: "id 缺失" }, { status: 400 });

  const row = await prisma.apiKey.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ ok: false, error: "key 不存在" }, { status: 404 });

  const baseUrl = (row.baseUrl ?? "").replace(/\/+$/, "");
  const apiKey = row.apiKey ?? "";
  if (!baseUrl || !apiKey) {
    return NextResponse.json({ ok: false, error: "该 key 缺少 baseUrl 或 apiKey" });
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  } as Record<string, string>;

  const tried: { url?: string; status?: number; error?: string }[] = [];

  // 计算"中转站根 origin"（去掉 /v1 后缀），用于探测非 /v1 路径
  let rootOrigin = baseUrl;
  try {
    const u = new URL(baseUrl);
    rootOrigin = u.origin; // https://api.cometapi.com
  } catch {
    /* keep raw baseUrl */
  }

  for (const path of PROBE_PATHS) {
    // 路径以 /v1 开头 → 用 baseUrl（如果 baseUrl 也以 /v1 结尾，避免重复）
    // 路径以 /api 或 /dashboard 等开头 → 用 rootOrigin（不带 /v1）
    let url: string;
    if (path.startsWith("/v1")) {
      url = baseUrl.endsWith("/v1") ? rootOrigin + path : baseUrl + path;
    } else if (path.startsWith("/dashboard")) {
      // /dashboard/billing/subscription 在中转站上常挂在 /v1 下（OpenAI 历史路径）
      url = baseUrl.endsWith("/v1") ? baseUrl + path : rootOrigin + "/v1" + path;
    } else {
      // /api/* /me /user 等用 root
      url = rootOrigin + path;
    }
    try {
      const res = await fetchWithTimeout(url, { method: "GET", headers }, 8000);
      if (!res.ok) {
        tried.push({ url, status: res.status });
        continue;
      }
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        tried.push({ url, status: res.status, error: "非 JSON 响应" });
        continue;
      }
      const parsed = parseQuota(json);
      const hasMeaningful =
        parsed.totalUsd != null ||
        parsed.usedUsd != null ||
        parsed.remainingUsd != null ||
        parsed.plan;
      if (hasMeaningful) {
        const quota: QuotaInfo = {
          ...parsed,
          unit: parsed.unit ?? "USD",
          endpoint: url,
          // raw 截断防止响应过大
          raw: typeof json === "object" ? json : undefined,
        };
        return NextResponse.json({
          ok: true,
          quota,
          tried,
          lastError: row.lastError ?? null,
          consecutiveErrors: row.consecutiveErrors ?? 0,
        });
      }
      tried.push({ url, status: res.status, error: "未解析到额度字段" });
    } catch (e) {
      tried.push({ url, error: (e as Error).message });
    }
  }

  // 兜底探测：发一个最小 embeddings 请求（< 0.0001 USD），从响应里抓真实余额。
  // CometAPI / OneAPI / NewAPI 等中转在余额不足时会把 "remaining quota: $-0.xx" 写进 error.message。
  // 用 LLM key 测 embeddings 端点风险最小：input='·' 只 1 token；失败也是无害的。
  // 仅当当前 row 是 LLM key（provider='llm'）时才走这条路径，IMAGE key 跳过。
  if (row.provider === "llm") {
    try {
      const embedUrl = baseUrl.endsWith("/v1") ? `${baseUrl}/embeddings` : `${baseUrl}/v1/embeddings`;
      const res = await fetchWithTimeout(
        embedUrl,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "text-embedding-3-small", input: "·" }),
        },
        12000,
      );
      const text = await res.text();
      // 失败响应里抓 "remaining quota: $X" / "remaining: $X" / "余额不足" 等字面
      const m = text.match(/remaining\s*(?:quota)?\s*[:：]?\s*\$?(-?[\d.]+)/i);
      if (m) {
        const remaining = parseFloat(m[1]);
        return NextResponse.json({
          ok: true,
          quota: {
            remainingUsd: remaining,
            unit: "USD",
            endpoint: embedUrl,
            plan: remaining < 0 ? "余额不足（已透支）" : "余额正常",
            raw: text.slice(0, 600),
          } satisfies QuotaInfo,
          tried,
          lastError: row.lastError ?? null,
          consecutiveErrors: row.consecutiveErrors ?? 0,
          source: "embedding-probe",
        });
      }
      // 成功了 → 至少账户是激活的（embedding 调用扣费极少）
      if (res.ok) {
        return NextResponse.json({
          ok: true,
          quota: {
            unit: "USD",
            endpoint: embedUrl,
            plan: "账户活跃（embedding 调用成功，但中转站不返回具体余额）",
            raw: text.slice(0, 300),
          } satisfies QuotaInfo,
          tried,
          lastError: row.lastError ?? null,
          consecutiveErrors: row.consecutiveErrors ?? 0,
          source: "embedding-ok",
        });
      }
      tried.push({ url: embedUrl, status: res.status, error: "embeddings 探测：无 quota 字段" });
    } catch (e) {
      tried.push({ error: "embeddings 探测异常: " + (e as Error).message });
    }

    // 二级兜底：发一个最小 chat completion（max_tokens=1），从响应抓真实余额信息。
    // 中转站在 quota 不足时通常会在 error.message 里写 "remaining quota: $-0.xx"。
    // 成本：1 token 约 0.00000015 USD，可忽略。
    try {
      // 选一个该 key 配置的 model，没有就用通用 deepseek/gpt-4o-mini 兜底
      const probeModel = (row.model && row.model.trim()) || "gpt-4o-mini";
      const chatUrl = baseUrl.endsWith("/v1") ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
      const res = await fetchWithTimeout(
        chatUrl,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: probeModel,
            messages: [{ role: "user", content: "·" }],
            max_tokens: 1,
            temperature: 0,
          }),
        },
        15000,
      );
      const text = await res.text();
      // 抓 "remaining quota: $X" / "余额不足" / "balance: $X"
      const m =
        text.match(/remaining\s*(?:quota)?\s*[:：]?\s*\$?(-?[\d.]+)/i) ||
        text.match(/balance\s*[:：]?\s*\$?(-?[\d.]+)/i);
      if (m) {
        const remaining = parseFloat(m[1]);
        return NextResponse.json({
          ok: true,
          quota: {
            remainingUsd: remaining,
            unit: "USD",
            endpoint: chatUrl,
            plan: remaining < 0 ? "余额不足（已透支）" : "余额正常",
            raw: text.slice(0, 600),
          } satisfies QuotaInfo,
          tried,
          lastError: row.lastError ?? null,
          consecutiveErrors: row.consecutiveErrors ?? 0,
          source: "chat-probe",
        });
      }
      if (res.ok) {
        return NextResponse.json({
          ok: true,
          quota: {
            unit: "USD",
            endpoint: chatUrl,
            plan: "账户活跃（chat 调用成功，但中转站不暴露余额；CometAPI 类中转用 API key 无法读真实余额，请去中转站官网控制台查看）",
            raw: text.slice(0, 300),
          } satisfies QuotaInfo,
          tried,
          lastError: row.lastError ?? null,
          consecutiveErrors: row.consecutiveErrors ?? 0,
          source: "chat-ok",
        });
      }
      tried.push({ url: chatUrl, status: res.status, error: "chat 探测：响应里无余额字段：" + text.slice(0, 200) });
    } catch (e) {
      tried.push({ error: "chat 探测异常: " + (e as Error).message });
    }
  }

  return NextResponse.json({
    ok: false,
    error: `当前中转站不支持额度查询（已尝试 ${tried.length} 个路径）`,
    tried,
    lastError: row.lastError ?? null,
    consecutiveErrors: row.consecutiveErrors ?? 0,
  });
}
