/**
 * curl 命令解析器：把用户粘贴的 curl 示例转成结构化对象
 *
 * 支持：
 *   curl -X POST 'https://api.kie.ai/api/v1/jobs/createTask' \
 *     -H 'Authorization: Bearer XXX' \
 *     -H 'Content-Type: application/json' \
 *     -d '{"model":"gpt-image-2-text-to-image","input":{"prompt":"..."}}'
 *
 * 不需要 100% 完美 —— 解析出来的结构当作"提示"塞给 LLM，让它推断出 adapter 配置
 */

export interface ParsedCurl {
  method: string;       // POST / GET / ...
  url: string;
  headers: Record<string, string>;
  body?: unknown;       // 已 JSON.parse；解析失败则是原字符串
  bodyRaw?: string;
}

export function isCurlCommand(text: string): boolean {
  return /\bcurl\s+/i.test(text.trim().slice(0, 200));
}

/**
 * 把 curl 命令解析成结构化对象。容错足够好：
 *   - 支持单引号 / 双引号 / 反斜杠续行
 *   - 支持 -H / --header
 *   - 支持 -d / --data / --data-raw / --data-binary
 *   - 支持 -X / --request
 *   - 没显式 method：有 -d 就是 POST，否则 GET
 */
export function parseCurl(input: string): ParsedCurl | null {
  const text = input
    .replace(/\\\r?\n/g, " ")     // 反斜杠续行
    .replace(/\s+/g, " ")
    .trim();
  if (!text.toLowerCase().startsWith("curl")) return null;

  // 简单 tokenizer：拆 quoted segments + 普通 token
  const tokens = tokenize(text);
  if (tokens.length === 0) return null;

  let method = "";
  let url = "";
  const headers: Record<string, string> = {};
  let bodyRaw: string | undefined;

  // 跳过开头的 'curl'
  let i = 1;
  while (i < tokens.length) {
    const t = tokens[i];
    const next = tokens[i + 1];

    if (t === "-X" || t === "--request") {
      if (next) { method = next.toUpperCase(); i += 2; continue; }
    } else if (t === "-H" || t === "--header") {
      if (next) {
        const idx = next.indexOf(":");
        if (idx > 0) {
          const k = next.slice(0, idx).trim();
          const v = next.slice(idx + 1).trim();
          if (k) headers[k] = v;
        }
        i += 2; continue;
      }
    } else if (t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-binary" || t === "--data-urlencode") {
      if (next) { bodyRaw = next; i += 2; continue; }
    } else if (t === "-u" || t === "--user" || t === "--cookie" || t === "-b" || t === "-A" || t === "--user-agent" || t === "-e" || t === "--referer" || t === "--connect-timeout" || t === "--max-time") {
      // 跳过这些带值的选项
      i += 2; continue;
    } else if (t.startsWith("-")) {
      // 不识别的开关，跳过单个 token
      i += 1; continue;
    } else {
      // 第一个非选项 token 视为 URL
      if (!url && (t.startsWith("http://") || t.startsWith("https://") || t.startsWith("'http") || t.startsWith('"http'))) {
        url = stripQuotes(t);
      }
      i += 1; continue;
    }
    i += 1;
  }

  if (!url) return null;

  if (!method) method = bodyRaw !== undefined ? "POST" : "GET";

  let body: unknown = bodyRaw;
  if (bodyRaw) {
    try { body = JSON.parse(bodyRaw); } catch { /* keep as string */ }
  }

  return { method, url, headers, body, bodyRaw };
}

function tokenize(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === " " || c === "\t") { i += 1; continue; }
    if (c === '"' || c === "'") {
      const q = c;
      const end = text.indexOf(q, i + 1);
      if (end < 0) { out.push(text.slice(i + 1)); break; }
      out.push(text.slice(i + 1, end));
      i = end + 1;
      continue;
    }
    let j = i;
    while (j < text.length && text[j] !== " " && text[j] !== "\t") j += 1;
    out.push(text.slice(i, j));
    i = j;
  }
  return out;
}

function stripQuotes(s: string): string {
  if (s.length >= 2 && (s.startsWith('"') || s.startsWith("'"))) {
    const last = s[s.length - 1];
    if (last === s[0]) return s.slice(1, -1);
  }
  return s;
}

/**
 * 把 ParsedCurl 渲染成"对 LLM 极友好"的 markdown 段，让 LLM 一眼就能识别 endpoint / body
 */
export function renderCurlForLLM(parsed: ParsedCurl): string {
  const lines: string[] = [];
  lines.push("【从 curl 命令解析出来的接口信息】");
  let baseUrl = "";
  let path = "";
  try {
    const u = new URL(parsed.url);
    baseUrl = `${u.origin}`;
    path = `${u.pathname}${u.search}`;
  } catch { /* keep raw */ }
  lines.push(`- METHOD: ${parsed.method}`);
  lines.push(`- URL: ${parsed.url}`);
  if (baseUrl) lines.push(`  - baseUrl 推断: ${baseUrl}`);
  if (path) lines.push(`  - path: ${path}`);

  if (Object.keys(parsed.headers).length > 0) {
    lines.push("- HEADERS:");
    for (const [k, v] of Object.entries(parsed.headers)) {
      // 给 LLM 看到 Authorization 模板，便于推断 auth
      const safeV = /authorization/i.test(k)
        ? v.replace(/\b(sk-[A-Za-z0-9-_]+|[a-f0-9]{20,}|[A-Za-z0-9_-]{20,})\b/g, "{API_KEY}")
        : v;
      lines.push(`  - ${k}: ${safeV}`);
    }
  }

  if (parsed.body !== undefined) {
    lines.push("- REQUEST BODY:");
    if (typeof parsed.body === "string") {
      lines.push("  ```");
      lines.push("  " + parsed.body);
      lines.push("  ```");
    } else {
      lines.push("  ```json");
      lines.push("  " + JSON.stringify(parsed.body, null, 2).split("\n").join("\n  "));
      lines.push("  ```");
    }
  }
  return lines.join("\n");
}
