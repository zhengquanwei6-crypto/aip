/**
 * /api/history - AI 输出历史
 * GET: 列表（最多 500 条，可选 ?type=text|image|suggestion|image_prompt 过滤）
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const type = sp.get('type');
  const take = Math.min(Number(sp.get('limit') ?? 500), 1000);

  const where: any = {};
  if (type) where.type = type;

  const list = await prisma.aIOutput.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
  });

  return NextResponse.json({
    ok: true,
    items: list.map((it) => ({
      id: it.id,
      type: it.type,
      input: it.input,
      output: it.output,
      model: it.model ?? '',
      createdAt: it.createdAt.toISOString(),
    })),
  });
}
