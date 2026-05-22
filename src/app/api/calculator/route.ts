import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calcQuote, extractMidPrice } from '@/lib/calculator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const packages = await prisma.pricePackage.findMany({
    orderBy: [{ category: 'asc' }, { tier: 'asc' }],
  });
  return NextResponse.json({
    ok: true,
    packages: packages.map((p) => ({
      id: p.id,
      category: p.category,
      tier: p.tier,
      name: p.name,
      priceRange: p.priceRange,
      midPrice: extractMidPrice(p.priceRange),
      description: p.description ?? '',
    })),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = calcQuote({
      category: body.category,
      tier: body.tier,
      basePrice: Number(body.basePrice) || 0,
      urgent: !!body.urgent,
      sourceFiles: !!body.sourceFiles,
      commercialUse: !!body.commercialUse,
      revisions: Number(body.revisions ?? 3),
      rushFactor: body.rushFactor !== undefined ? Number(body.rushFactor) : undefined,
      extraSourceFiles:
        body.extraSourceFiles !== undefined
          ? Number(body.extraSourceFiles)
          : undefined,
      extraCommercial:
        body.extraCommercial !== undefined
          ? Number(body.extraCommercial)
          : undefined,
    });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
