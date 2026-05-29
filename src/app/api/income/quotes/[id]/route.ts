/**
 * v0.16-H3.2 · PATCH 改状态 / DELETE 删
 */
import { NextRequest, NextResponse } from 'next/server';
import { getQuote, saveQuote, deleteQuote, recordIncome, type QuoteStatus } from '@/lib/income/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const body = await req.json();
    const q = await getQuote(ctx.params.id);
    if (!q) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });

    if (body.status && ['pending','negotiating','won','lost','cancelled'].includes(body.status)) {
      const newStatus = body.status as QuoteStatus;
      const now = new Date().toISOString();
      q.status = newStatus;
      if (newStatus === 'won' && !q.wonAt) q.wonAt = now;
      if (newStatus === 'lost' && !q.lostAt) q.lostAt = now;
    }
    if (typeof body.notes === 'string') q.notes = body.notes.slice(0, 500);
    if (typeof body.discount === 'number') {
      q.discount = Math.max(0, Math.min(1, body.discount));
      q.finalPrice = Math.round(q.total * (1 - q.discount));
    }
    await saveQuote(q);

    // 如果传了 income.amount → 记到账
    if (typeof body.incomeAmount === 'number' && body.incomeAmount > 0) {
      await recordIncome({
        quoteId: q.id,
        amount: body.incomeAmount,
        receivedAt: body.incomeReceivedAt || new Date().toISOString(),
      });
    }

    return NextResponse.json({ ok: true, quote: q });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  await deleteQuote(ctx.params.id);
  return NextResponse.json({ ok: true });
}
