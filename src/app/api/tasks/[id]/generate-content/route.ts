import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateText, extractJSON } from '@/lib/ai/text';
import { buildContentMessagesAsync } from '@/lib/ai/prompts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const task = await prisma.task.findUnique({ where: { id: params.id } });
    if (!task) {
      return NextResponse.json({ ok: false, error: '任务不存在' }, { status: 404 });
    }

    const keywords = await prisma.keyword.findMany({
      where: { category: task.category, platform: task.platform },
    });
    const pricePackages = await prisma.pricePackage.findMany({
      where: { category: task.category },
    });

    // v0.9.2 b1：async builder 接通模板编辑器
    const messages = await buildContentMessagesAsync({
      platform: task.platform as 'xiaohongshu' | 'xianyu',
      category: task.category,
      contentType: task.contentType,
      topic: task.title,
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

    // 保存 AI 输出历史
    await prisma.aIOutput.create({
      data: {
        type: 'text',
        input: JSON.stringify({ taskId: task.id, ...task }),
        output: JSON.stringify(parsed),
        model: r.model,
      },
    });

    // 反写到 task / post / product
    let updateData: any = { status: 'generated' };
    if (task.platform === 'xiaohongshu') {
      const titles: string[] = parsed.titles ?? [];
      const title0 = titles[0] || task.title;
      updateData = {
        ...updateData,
        title: title0,
        body: parsed.body ?? '',
        coverText: parsed.coverText ?? '',
      };
      await prisma.post.create({
        data: {
          taskId: task.id,
          platform: 'xiaohongshu',
          title: title0,
          body: parsed.body ?? '',
          tags: Array.isArray(parsed.tags) ? parsed.tags.join(',') : '',
          coverText: parsed.coverText ?? '',
          cta: parsed.cta ?? '',
          status: 'draft',
        },
      });
    } else {
      updateData = {
        ...updateData,
        title: parsed.title ?? task.title,
        body: parsed.description ?? '',
        coverText: parsed.coverText ?? '',
      };
      await prisma.product.create({
        data: {
          taskId: task.id,
          title: parsed.title ?? task.title,
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

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: updateData,
    });
    return NextResponse.json({ ok: true, task: updated, content: parsed });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
