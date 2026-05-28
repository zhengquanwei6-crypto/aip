/**
 * v0.15 · /api/agents/[slug]/recent
 *
 * 列出该运营智能体最近 N 次产出（文案 + 图）。
 * 直接从 AIOutput 表筛 type='platform-build-5img' & model 包含 slug。
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORTED = new Set([
  'xiaohongshu-operator',
  'xianyu-operator',
  'qianniu-operator',
]);

export async function GET(
  req: NextRequest,
  ctx: { params: { slug: string } },
) {
  const slug = ctx.params.slug;
  if (!SUPPORTED.has(slug)) {
    return NextResponse.json(
      { ok: false, error: `不支持的 agent: ${slug}` },
      { status: 404 },
    );
  }
  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 10));

  try {
    // 模糊匹配 model 包含 slug
    const rows = await prisma.aIOutput.findMany({
      where: {
        type: { in: ['platform-build', 'platform-build-5img'] },
        model: { contains: slug },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const items = rows.map((r) => parseRow(r));
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

function parseRow(r: {
  id: string;
  type: string;
  input: string;
  output: string;
  model: string | null;
  createdAt: Date;
}) {
  let topic = '';
  let title = '';
  let titles: string[] = [];
  let body = '';
  let tags: string[] = [];
  const images: { url: string; ok: boolean }[] = [];

  try {
    const inp = JSON.parse(r.input);
    if (typeof inp?.topic === 'string') topic = inp.topic;
  } catch {
    /* ignore */
  }
  try {
    const out = JSON.parse(r.output);
    if (typeof out?.title === 'string') title = out.title;
    if (Array.isArray(out?.titles)) titles = out.titles.slice(0, 5);
    if (typeof out?.body === 'string') body = out.body;
    if (Array.isArray(out?.tags)) tags = out.tags.slice(0, 8);
    if (Array.isArray(out?.imageOutcomes)) {
      for (const o of out.imageOutcomes) {
        images.push({ url: String(o.url || ''), ok: Boolean(o.ok) });
      }
    } else if (Array.isArray(out?.pages)) {
      for (const p of out.pages) {
        images.push({
          url: String(p.imageUrl || ''),
          ok: Boolean(p.imageUrl),
        });
      }
    }
  } catch {
    /* ignore */
  }
  return {
    id: r.id,
    topic,
    title,
    titles,
    body,
    tags,
    images,
    createdAt: r.createdAt.toISOString(),
  };
}
