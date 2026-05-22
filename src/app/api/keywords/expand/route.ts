import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateText, extractJSON } from '@/lib/ai/text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/keywords/expand
 * body: { seed: string, category: string, platform: 'xiaohongshu'|'xianyu', count?: number }
 * 返回 { ok, keywords: string[] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const seed = String(body.seed || '').trim();
    const category = String(body.category || '').trim();
    const platform = String(body.platform || 'xiaohongshu');
    const count = Math.min(Math.max(Number(body.count) || 20, 5), 50);
    if (!seed) {
      return NextResponse.json(
        { ok: false, error: '请填写种子词' },
        { status: 400 },
      );
    }

    const platformLabel = platform === 'xiaohongshu' ? '小红书' : '闲鱼';
    const messages = [
      {
        role: 'system' as const,
        content: `你是 ${platformLabel} 关键词扩词器。
请基于「${seed}」（类目：${category || '不限'}）扩展 ${count} 个长尾词。
要求：
1) 真实、用户真的会搜的词
2) 每条 4-12 字
3) 不要含敏感词 / 绝对化用语 / 站外引流词
4) 严格 JSON：{"keywords":["词1","词2",...]}`,
      },
      {
        role: 'user' as const,
        content: `种子词：${seed}\n类目：${category}\n平台：${platformLabel}\n要扩 ${count} 个`,
      },
    ];

    const r = await generateText({
      messages,
      responseFormat: 'json',
      temperature: 0.8,
      maxTokens: 1500,
    });
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
    }
    const parsed = extractJSON<{ keywords: string[] }>(r.content);
    if (!parsed?.keywords) {
      return NextResponse.json(
        { ok: false, error: 'AI 输出无法解析', raw: r.content },
        { status: 500 },
      );
    }

    // 过滤已有关键词
    const existing = await prisma.keyword.findMany({
      where: { category: category || undefined, platform },
      select: { keyword: true },
    });
    const existingSet = new Set(existing.map((e) => e.keyword));
    const filtered = parsed.keywords.filter(
      (k) => k && k.length <= 20 && !existingSet.has(k),
    );

    return NextResponse.json({ ok: true, keywords: filtered });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
