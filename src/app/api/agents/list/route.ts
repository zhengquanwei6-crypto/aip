import { NextResponse } from 'next/server';
import { AGENTS } from '@/lib/agent-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    agents: AGENTS.map((a) => ({
      slug: a.slug,
      name: a.name,
      description: a.description,
      icon: a.icon,
      scope: a.scope ?? [],
    })),
  });
}
