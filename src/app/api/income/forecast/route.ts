import { NextResponse } from 'next/server';
import { listQuotes, listIncomes } from '@/lib/income/store';
import { aggregateWeekly, forecastNextMonth } from '@/lib/income/forecast';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [quotes, incomes] = await Promise.all([listQuotes(), listIncomes()]);
  const weekly = aggregateWeekly(quotes, incomes);
  const f = forecastNextMonth(weekly);
  return NextResponse.json({
    ok: true,
    weekly,
    forecast: f,
  });
}
