import { NextResponse } from 'next/server';
import { getCurrentGenome } from '@/lib/style-genome/inject';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const g = await getCurrentGenome();
  return NextResponse.json({ ok: true, genome: g });
}
