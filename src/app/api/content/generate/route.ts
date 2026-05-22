import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateText, extractJSON } from '@/lib/ai/text';
import { buildContentMessages } from '@/lib/ai/prompts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const platform = body.platform as 'xiaohongshu' | 'xianyu';
    if (!platform || !['xiaohongshu', 'xianyu'].includes(platform)) {
      return NextResponse.json({ ok: false, error: '平台不正确' }, { status: 400 });
    }
    const category: string = body.category || 'Logo';
    const contentType: string = body.contentType || '案例型';

    // 自动加载关键词 / 价格
    const keywords = await prisma.keyword.findMany({
      where: { category, platform },
    });
    const pricePackages = await prisma.pricePackage.findMany({
      where: { category },
    });

    const messages = buildContentMessages({
      platform,
      category,
      contentType,
      audience: body.audience,
      tone: body.tone,
      topic: body.topic,
      keywords: keywords.map((k) => k.keyword),
      pricePackages: pricePackages.map((p) => ({
        tier: p.tier,
        name: p.name,
        priceRange: p.priceRange,
      })),
    });

    const r = await generateText({
      messages,
      responseFormat: 'json',
      temperature: 0.8,
    });
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
    }
    const parsed = extractJSON<any>(r.content);
    if (!parsed) {
      return NextResponse.json(
        { ok: false, error: 'AI 输出无法解析为 JSON', raw: r.content },
        { status: 500 },
      );
    }

    await prisma.aIOutput.create({
      data: {
        type: 'text',
        input: JSON.stringify({ platform, category, contentType, ...body }),
        output: JSON.stringify(parsed),
        model: r.model,
      },
    });

    // 同时保存为 Post / Product，方便复用
    if (platform === 'xiaohongshu') {
      const titles: string[] = parsed.titles ?? [];
      await prisma.post.create({
        data: {
          platform: 'xiaohongshu',
          title: titles[0] || body.topic || '',
          body: parsed.body ?? '',
          tags: Array.isArray(parsed.tags) ? parsed.tags.join(',') : '',
          coverText: parsed.coverText ?? '',
          cta: parsed.cta ?? '',
          status: 'draft',
        },
      });
    } else {
      await prisma.product.create({
        data: {
          title: parsed.title ?? body.topic ?? '',
          description: parsed.description ?? '',
          coverText: parsed.coverText ?? '',
          priceTier: Array.isArray(parsed.tiers)
            ? parsed.tiers.map((t: any) => `${t.tier}:${t.priceRange}`).join(' / ')
            : '',
          deliveryScope: parsed.deliveryScope ?? '',
          revisionRule: parsed.revisionRule ?? '',
          status: 'draft',
        },
      });
    }

    return NextResponse.json({ ok: true, content: parsed, model: r.model });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
