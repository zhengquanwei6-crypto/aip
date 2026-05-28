/**
 * v0.15 · 文档抓取器（API 适配器用）
 *
 * 用户原话：优化 API 适配器，防止出现部分链接文档读取不全或出现错误等情况。
 *
 * 升级要点：
 *   1. 多重候选 URL 拓展（加 raw.githubusercontent / readme.io / mintlify 风格）
 *   2. UA 伪装真实浏览器，提升站点接受度
 *   3. 提高超时上限到 25s，maxLength 到 60k（GPT-4o 等可吃下）
 *   4. 启发式判信息量加 OpenAPI / requestBody / parameters 等关键词
 *   5. 增加二级失败重试（一次 backoff 1.5s）
 *   6. 抓不到时尝试 r.jina.ai（保留）+ readability mode
 */

interface FetchAttempt {
  source: string;
  ok: boolean;
  text: string;
  bytes: number;
  reason?: string;
}

interface FetchResult {
  ok: boolean;
  text: string;
  attempts: FetchAttempt[];
  finalSource: string;
}

const FETCH_TIMEOUT_MS = 25_000;
const MIN_USEFUL_LENGTH = 1200;
const ENDPOINT_HINTS =
  /\b(POST|GET|PUT|DELETE|PATCH)\s+\/|curl\s+|"path"|"endpoint"|"baseUrl"|\/v\d\/|application\/json|Authorization|Bearer\s|requestBody|parameters\s*:|openapi:|swagger|x-api-key/i;

function isUseful(text: string): boolean {
  if (text.length < MIN_USEFUL_LENGTH) return false;
  return ENDPOINT_HINTS.test(text);
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(nav|footer|header|aside|menu)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const REAL_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function timeoutFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(url, {
    ...init,
    headers: {
      'User-Agent': REAL_UA,
      Accept:
        'text/markdown, text/plain, application/json, text/html;q=0.8, */*;q=0.5',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

function deriveMarkdownUrls(originalUrl: string): string[] {
  const candidates: string[] = [];
  try {
    const u = new URL(originalUrl);
    const trimPath = u.pathname.replace(/\/$/, '');

    // 末尾加 markdown 后缀
    if (!u.pathname.endsWith('.md') && !u.pathname.endsWith('.mdx')) {
      candidates.push(`${u.origin}${trimPath}.md${u.search}`);
      candidates.push(`${u.origin}${trimPath}.mdx${u.search}`);
      candidates.push(`${u.origin}${trimPath}.txt${u.search}`);
    }

    // ?format=md / ?raw=true / ?as=md（多家文档站支持）
    const sep = u.search ? '&' : '?';
    candidates.push(`${originalUrl}${sep}format=md`);
    candidates.push(`${originalUrl}${sep}raw=true`);
    candidates.push(`${originalUrl}${sep}as=md`);

    // /raw 子路径
    candidates.push(`${u.origin}/raw${u.pathname}${u.search}`);

    // mintlify / fern / readme.io 风格的 _next/static/data JSON
    candidates.push(`${u.origin}${trimPath}.json${u.search}`);

    // GitHub 仓库链接 → raw.githubusercontent
    const gh = u.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
    if (u.host === 'github.com' && gh) {
      candidates.push(
        `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/${gh[3]}/${gh[4]}`,
      );
    }
  } catch {
    /* invalid url */
  }
  return candidates;
}

function deriveLlmsTxtUrls(originalUrl: string): string[] {
  try {
    const u = new URL(originalUrl);
    return [
      `${u.origin}/llms-full.txt`,
      `${u.origin}/llms.txt`,
      `${u.origin}/openapi.json`,
      `${u.origin}/openapi.yaml`,
      `${u.origin}/swagger.json`,
      `${u.origin}/api-docs.json`,
      `${u.origin}/.well-known/openapi`,
    ];
  } catch {
    return [];
  }
}

function jinaReaderUrl(originalUrl: string): string {
  return `https://r.jina.ai/${originalUrl}`;
}

async function tryFetch(url: string, label: string): Promise<FetchAttempt> {
  // 尝试 2 次（首次失败后退避 1.5s 再试一次）
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await timeoutFetch(url);
      if (!r.ok) {
        if (attempt === 0 && r.status >= 500) {
          await new Promise((res) => setTimeout(res, 1500));
          continue;
        }
        return {
          source: label,
          ok: false,
          text: '',
          bytes: 0,
          reason: `HTTP ${r.status}`,
        };
      }
      const ct = r.headers.get('content-type') || '';
      const raw = await r.text();
      let text: string;
      if (ct.includes('json')) {
        try {
          // OpenAPI / 配置 JSON 直接保留缩进
          text = JSON.stringify(JSON.parse(raw), null, 2);
        } catch {
          text = raw;
        }
      } else if (ct.includes('text/html') || /^<!doctype html/i.test(raw.slice(0, 100))) {
        text = stripHtml(raw);
      } else {
        text = raw.replace(/\r/g, '').trim();
      }
      return {
        source: label,
        ok: text.length > 0,
        text,
        bytes: text.length,
      };
    } catch (e) {
      if (attempt === 0) {
        await new Promise((res) => setTimeout(res, 1500));
        continue;
      }
      return {
        source: label,
        ok: false,
        text: '',
        bytes: 0,
        reason: (e as Error)?.message ?? 'fetch failed',
      };
    }
  }
  return { source: label, ok: false, text: '', bytes: 0, reason: 'unreachable' };
}

/**
 * 主入口：给定 URL，尽最大努力拉一份 LLM 能用的文档文本
 */
export async function fetchDocFromUrl(
  url: string,
  maxLength = 60_000,
): Promise<FetchResult> {
  const attempts: FetchAttempt[] = [];

  // tier 1：直接 + markdown 候选 + llms.txt + openapi（并行）
  const tier1Urls: { url: string; label: string }[] = [
    { url, label: `direct: ${url}` },
    ...deriveMarkdownUrls(url).map((u) => ({ url: u, label: `md-candidate: ${u}` })),
    ...deriveLlmsTxtUrls(url).map((u) => ({ url: u, label: `well-known: ${u}` })),
  ];
  const tier1Results = await Promise.all(
    tier1Urls.map((t) => tryFetch(t.url, t.label)),
  );
  attempts.push(...tier1Results);

  let best = pickBest(tier1Results);
  if (best && isUseful(best.text)) {
    return finalize(best, attempts, maxLength);
  }

  // tier 2：Jina Reader 兜底
  const jinaResult = await tryFetch(
    jinaReaderUrl(url),
    `jina-reader: ${jinaReaderUrl(url)}`,
  );
  attempts.push(jinaResult);
  if (isUseful(jinaResult.text)) {
    return finalize(jinaResult, attempts, maxLength);
  }

  // 全部尝试都没拿到 useful，挑一个最长的凑合
  const all = [...attempts].filter((a) => a.ok && a.text.length > 0);
  best = pickBest(all);
  if (best) return finalize(best, attempts, maxLength);

  return { ok: false, text: '', attempts, finalSource: '(all failed)' };
}

function pickBest(arr: FetchAttempt[]): FetchAttempt | undefined {
  const candidates = arr.filter((a) => a.ok && a.text.length > 0);
  if (candidates.length === 0) return undefined;
  const useful = candidates.filter((a) => isUseful(a.text));
  if (useful.length > 0) {
    return useful.sort((a, b) => b.bytes - a.bytes)[0];
  }
  return candidates.sort((a, b) => b.bytes - a.bytes)[0];
}

function finalize(
  best: FetchAttempt,
  attempts: FetchAttempt[],
  maxLength: number,
): FetchResult {
  let text = best.text;
  if (text.length > maxLength) {
    text = text.slice(0, maxLength) + '\n...[truncated]';
  }
  return { ok: true, text, attempts, finalSource: best.source };
}
