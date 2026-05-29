/**
 * v0.14-z91 · /api/ai-search
 *
 * 联网搜索 + AI 总结（3 段：优化搜索词 → Tavily 搜索 → LLM 摘要）
 * - 配置：Setting.TAVILY_API_KEY（必填，41 chars 已存）
 * - LLM：走 generateText（池 → Setting → env 优先级）
 * - 失败任意一段 → 返回 ok:false + error，前端弹错；不抛 500
 * - 写 AIOutput type='ai-search' 记录到历史
 *
 * 请求体：{ query: string, keyOverride?: string }
 * 返回体：{ ok, query, optimizedQuery, summary, tavilyAnswer, sources, timing, error? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateText, type ChatMessage } from '@/lib/ai/text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}
interface TavilyResponse {
  query?: string;
  answer?: string;
  results?: TavilyResult[];
}

async function getTavilyKey(): Promise<string | null> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: 'TAVILY_API_KEY' } });
    return row?.value?.trim() || process.env.TAVILY_API_KEY?.trim() || null;
  } catch {
    return process.env.TAVILY_API_KEY?.trim() || null;
  }
}

async function optimizeQuery(raw: string): Promise<{ optimized: string; ms: number }> {
  const t0 = Date.now();
  const r = await generateText({
    messages: [
      {
        role: 'system',
        content:
          '你是一个搜索词优化助手。把用户的中文自然语言问题改写成 1 行精炼的中英文混合搜索词，去掉敬语和填充词，保留专有名词与时间/地点限定。直接输出搜索词，不要解释。',
      },
      { role: 'user', content: raw },
    ],
    temperature: 0.2,
    maxTokens: 80,
  });
  const ms = Date.now() - t0;
  if (!r.ok || !r.content) return { optimized: raw, ms };
  const cleaned = r.content.split('\n')[0].trim().replace(/^["「『]|["」』]$/g, '');
  return { optimized: cleaned || raw, ms };
}

async function callTavily(
  apiKey: string,
  query: string,
): Promise<{ resp: TavilyResponse | null; ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        include_answer: true,
        max_results: 5,
      }),
    });
    const ms = Date.now() - t0;
    if (!r.ok) {
      const txt = await r.text();
      return { resp: null, ms, error: `Tavily ${r.status}: ${txt.slice(0, 200)}` };
    }
    const j = (await r.json()) as TavilyResponse;
    return { resp: j, ms };
  } catch (e) {
    return { resp: null, ms: Date.now() - t0, error: (e as Error).message };
  }
}

async function summarize(
  query: string,
  tavily: TavilyResponse,
): Promise<{ summary: string; ms: number; error?: string }> {
  const t0 = Date.now();
  const sources = (tavily.results || []).slice(0, 5);
  const sourceText = sources
    .map(
      (s, i) =>
        `[${i + 1}] ${s.title}\nURL: ${s.url}\n${s.content?.slice(0, 600) || ''}`,
    )
    .join('\n\n---\n\n');
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        '你是一个搜索结果总结助手。基于给定的搜索结果，用简洁中文回答用户问题。要求：\n' +
        '- 直接给结论，不要客套话\n' +
        '- 用 [1] [2] 等编号引用对应来源\n' +
        '- 列出 3-6 条要点，每条不超过 2 行\n' +
        '- 如果搜索结果矛盾或不足，明确说明',
    },
    {
      role: 'user',
      content: `问题：${query}\n\n搜索结果：\n${sourceText || '（无搜索结果）'}${
        tavily.answer ? `\n\nTavily 自带回答：${tavily.answer}` : ''
      }`,
    },
  ];
  const r = await generateText({ messages, temperature: 0.3, maxTokens: 1200 });
  const ms = Date.now() - t0;
  if (!r.ok) return { summary: '', ms, error: r.error };
  return { summary: r.content || '（LLM 未返回内容）', ms };
}

export async function POST(req: NextRequest) {
  const tStart = Date.now();
  try {
    const body = (await req.json()) as { query?: string };
    const raw = (body.query || '').trim();
    if (!raw) {
      return NextResponse.json({ ok: false, error: '请输入搜索内容' }, { status: 400 });
    }
    if (raw.length > 500) {
      return NextResponse.json({ ok: false, error: '搜索内容不能超过 500 字' }, { status: 400 });
    }

    const tavilyKey = await getTavilyKey();
    if (!tavilyKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            '未配置 TAVILY_API_KEY。请前往「设置」找到 TAVILY_API_KEY 字段填入。',
        },
        { status: 200 },
      );
    }

    // Stage 1: optimize（失败兜底用原 query）
    const opt = await optimizeQuery(raw);

    // Stage 2: Tavily search
    const search = await callTavily(tavilyKey, opt.optimized);
    if (!search.resp) {
      return NextResponse.json({
        ok: false,
        query: raw,
        optimizedQuery: opt.optimized,
        error: search.error || '搜索接口无响应',
        timing: {
          optimizeMs: opt.ms,
          searchMs: search.ms,
          summarizeMs: 0,
          totalMs: Date.now() - tStart,
        },
      });
    }

    // Stage 3: summarize
    const summarized = await summarize(raw, search.resp);

    const timing = {
      optimizeMs: opt.ms,
      searchMs: search.ms,
      summarizeMs: summarized.ms,
      totalMs: Date.now() - tStart,
    };

    if (summarized.error) {
      // 即使总结失败也把搜索结果交给前端
      return NextResponse.json({
        ok: false,
        query: raw,
        optimizedQuery: opt.optimized,
        sources: search.resp.results || [],
        tavilyAnswer: search.resp.answer,
        error: `LLM 总结失败：${summarized.error}`,
        timing,
      });
    }

    // 写 AIOutput 历史（fire-and-forget；失败不影响响应）
    try {
      await prisma.aIOutput.create({
        data: {
          type: 'ai-search',
          input: JSON.stringify({ query: raw, optimizedQuery: opt.optimized }),
          output: JSON.stringify({
            summary: summarized.summary,
            sources: (search.resp.results || []).slice(0, 5).map((s) => ({
              title: s.title,
              url: s.url,
              score: s.score,
            })),
          }),
          model: 'tavily+llm',
        },
      });
    } catch (e) {
      console.warn('[ai-search/persist]', (e as Error).message);
    }

    return NextResponse.json({
      ok: true,
      query: raw,
      optimizedQuery: opt.optimized,
      summary: summarized.summary,
      tavilyAnswer: search.resp.answer,
      sources: search.resp.results || [],
      timing,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: `服务端异常：${(err as Error).message}`,
        timing: { optimizeMs: 0, searchMs: 0, summarizeMs: 0, totalMs: Date.now() - tStart },
      },
      { status: 500 },
    );
  }
}
