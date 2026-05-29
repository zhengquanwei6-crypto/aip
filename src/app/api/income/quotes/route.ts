/**
 * v0.16-H3.2 · GET /api/income/quotes (list)
 *                POST (create)
 */
import { NextRequest, NextResponse } from 'next/server';
import { listQuotes, saveQuote, type Quote, type QuoteStatus } from '@/lib/income/store';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') as QuoteStatus | null;
  const list = await listQuotes({ status: status || undefined });
  return NextResponse.json({ ok: true, list });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ ok: false, error: '至少 1 条 item' }, { status: 400 });
    }
    const total = items.reduce((acc: number, it: any) => acc + Number(it.qty || 1) * Number(it.unitPrice || 0), 0);
    const discount = Math.max(0, Math.min(1, Number(body.discount) || 0));
    const finalPrice = Math.round(total * (1 - discount));
    const id = body.id || randomUUID().slice(0, 12);
    const now = new Date().toISOString();
    const q: Quote = {
      id,
      clientName: String(body.clientName || '匿名客户').slice(0, 60),
      category: String(body.category || 'Logo'),
      difficulty: body.difficulty,
      deadline: body.deadline,
      items: items.map((it: any) => ({
        name: String(it.name || ''),
        qty: Math.max(1, Number(it.qty) || 1),
        unitPrice: Math.max(0, Number(it.unitPrice) || 0),
      })),
      total,
      discount,
      finalPrice,
      status: (['pending','negotiating','won','lost','cancelled'].includes(body.status) ? body.status : 'pending') as QuoteStatus,
      notes: body.notes ? String(body.notes).slice(0, 500) : undefined,
      createdAt: body.createdAt || now,
      updatedAt: now,
    };
    if (q.status === 'won') q.wonAt = now;
    if (q.status === 'lost') q.lostAt = now;
    await saveQuote(q);
    return NextResponse.json({ ok: true, quote: q });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
