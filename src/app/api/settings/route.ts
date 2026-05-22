import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_KEYS = [
  'LLM_API_BASE_URL',
  'LLM_API_KEY',
  'LLM_MODEL',
  'IMAGE_API_BASE_URL',
  'IMAGE_API_KEY',
  'IMAGE_MODEL',
];

export async function GET() {
  const list = await prisma.setting.findMany({
    where: { key: { in: ALLOWED_KEYS } },
  });
  return NextResponse.json({ ok: true, list });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    for (const key of ALLOWED_KEYS) {
      if (key in body) {
        const value = String(body[key] ?? '');
        if (value === '') {
          // 留空则删除（回退到 .env）
          await prisma.setting.deleteMany({ where: { key } });
        } else {
          await prisma.setting.upsert({
            where: { key },
            update: { value },
            create: { key, value },
          });
        }
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
