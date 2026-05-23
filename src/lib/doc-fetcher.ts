/**
 * 文档抓取器：从 URL 拉到"LLM 能看懂的纯文本"
 *
 * 多重策略（按成本从低到高，依次尝试，看哪个产出"信息量足"）：
 *   1. 直接 fetch + 简单 HTML 剥离 → 适用于 markdown/纯文本/服务端渲染文档
 *   2. 尝试 .md / .mdx 后缀 / ?format=md / raw 路径 → 很多文档站支持
 *   3. 尝试同一 origin 下的 /llms.txt 或 /llms-full.txt（社区标准）
 *   4. fallback 到 Jina Reader: https://r.jina.ai/<url>（免费、能处理 SPA）
 *
 * 启发式：抓到的"信息量足"指什么？
 *   - 长度 > 1500 字符
 *   - 出现 endpoint 关键字（POST / GET / curl / "path" / "url" / "/v1/" 等）
 */

interface FetchAttempt {
  source: string; // 描述这次尝试是从哪个 URL 来的
  ok: boolean;
  text: string;
  bytes: number;
  reason?: string;
}

interface FetchResult {
  ok: boolean;
  text: string;
  attempts: FetchAttempt[];
  /** 最终采用的来源描述 */
  finalSource: string;
}

const FETCH_TIMEOUT_MS = 15_000;
const MIN_USEFUL_LENGTH = 1500;
const ENDPOINT_HINTS = /\b(POST|GET|PUT|DELETE)\s+\/|curl\s+|"path"|"endpoint"|"baseUrl"|\/v\d\/|application\/json|Authorization|Bearer\s/i;

function isUseful(text: string): boolean {
  if (text.length < MIN_USEFUL_LENGTH) return false;
  return ENDPOINT_HINTS.test(text);
}

/** 简单去 HTML 标签 + 折叠空白 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function timeoutFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(url, {
    ...init,
    headers: {
      "User-Agent": "design-ai-ops-doc-fetcher/2.0",
      "Accept": "text/markdown, text/plain, text/html;q=0.8, */*;q=0.5",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

/** 从 URL 推导"可能是 markdown 版"的多个候选 URL */
function deriveMarkdownUrls(originalUrl: string): string[] {
  const candidates: string[] = [];
  try {
    const u = new URL(originalUrl);
    // 末尾加 .md
    if (!u.pathname.endsWith(".md") && !u.pathname.endsWith(".mdx")) {
      candidates.push(`${u.origin}${u.pathname.replace(/\/$/, "")}.md${u.search}`);
      candidates.push(`${u.origin}${u.pathname.replace(/\/$/, "")}.mdx${u.search}`);
    }
    // 加 ?format=md（gitbook/dox 风格）
    const sep = u.search ? "&" : "?";
    candidates.push(`${originalUrl}${sep}format=md`);
    candidates.push(`${originalUrl}${sep}raw=true`);
    // /raw 子路径
    candidates.push(`${u.origin}/raw${u.pathname}${u.search}`);
  } catch { /* invalid url */ }
  return candidates;
}

/** 探测同 origin 下的 llms.txt */
function deriveLlmsTxtUrls(originalUrl: string): string[] {
  try {
    const u = new URL(originalUrl);
    return [
      `${u.origin}/llms-full.txt`,
      `${u.origin}/llms.txt`,
    ];
  } catch {
    return [];
  }
}

/** Jina Reader：把任意 URL 转成"对 LLM 友好"的纯文本（免费 API） */
function jinaReaderUrl(originalUrl: string): string {
  return `https://r.jina.ai/${originalUrl}`;
}

async function tryFetch(url: string, label: string): Promise<FetchAttempt> {
  try {
    const r = await timeoutFetch(url);
    if (!r.ok) return { source: label, ok: false, text: "", bytes: 0, reason: `HTTP ${r.status}` };
    const ct = r.headers.get("content-type") || "";
    const raw = await r.text();
    const text = ct.includes("text/html") ? stripHtml(raw) : raw.replace(/\r/g, "").trim();
    return { source: label, ok: text.length > 0, text, bytes: text.length };
  } catch (e: any) {
    return { source: label, ok: false, text: "", bytes: 0, reason: e?.message ?? "fetch failed" };
  }
}

/**
 * 主入口：给定 URL，尽最大努力拉一份"LLM 能用"的文档文本
 *
 * @param maxLength 截断长度，太长会让 LLM 上下文爆炸
 */
export async function fetchDocFromUrl(url: string, maxLength = 30_000): Promise<FetchResult> {
  const attempts: FetchAttempt[] = [];

  // 第一拨：直接 fetch + markdown 候选 + llms.txt 候选（并行）
  const tier1Urls: { url: string; label: string }[] = [
    { url, label: `direct: ${url}` },
    ...deriveMarkdownUrls(url).map((u) => ({ url: u, label: `markdown: ${u}` })),
    ...deriveLlmsTxtUrls(url).map((u) => ({ url: u, label: `llms.txt: ${u}` })),
  ];
  const tier1Results = await Promise.all(tier1Urls.map((t) => tryFetch(t.url, t.label)));
  attempts.push(...tier1Results);

  // 选第一拨里"最有信息量的"
  let best = pickBest(tier1Results);
  if (best && isUseful(best.text)) {
    return finalize(best, attempts, maxLength);
  }

  // 第二拨：Jina Reader（处理 SPA 文档站）
  const jinaResult = await tryFetch(jinaReaderUrl(url), `jina-reader: ${jinaReaderUrl(url)}`);
  attempts.push(jinaResult);
  if (isUseful(jinaResult.text)) {
    return finalize(jinaResult, attempts, maxLength);
  }

  // 全部尝试都没拿到"有信息量"的版本，挑一个最长的凑合
  const all = [...attempts].filter((a) => a.ok && a.text.length > 0);
  best = pickBest(all);
  if (best) return finalize(best, attempts, maxLength);

  return { ok: false, text: "", attempts, finalSource: "(all failed)" };
}

function pickBest(arr: FetchAttempt[]): FetchAttempt | undefined {
  const candidates = arr.filter((a) => a.ok && a.text.length > 0);
  if (candidates.length === 0) return undefined;
  // 先选 isUseful 的；否则选最长的
  const useful = candidates.filter((a) => isUseful(a.text));
  if (useful.length > 0) {
    return useful.sort((a, b) => b.bytes - a.bytes)[0];
  }
  return candidates.sort((a, b) => b.bytes - a.bytes)[0];
}

function finalize(best: FetchAttempt, attempts: FetchAttempt[], maxLength: number): FetchResult {
  let text = best.text;
  if (text.length > maxLength) {
    text = text.slice(0, maxLength) + "\n...[truncated]";
  }
  return { ok: true, text, attempts, finalSource: best.source };
}
