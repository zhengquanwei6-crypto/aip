/**
 * v0.16-H3.1 · 报价数据存储层
 * 0 schema 改动，全用 Setting JSON
 *
 * Key 规则:
 *   quote:list:{id}     单条报价 (含 items + total + status + meta)
 *   quote:income:{id}   实际到账记录
 *   quote:client:{name} 客户元数据 (累积 quote ids + 标签)
 */
import { prisma } from '@/lib/db';

export type QuoteStatus = 'pending' | 'negotiating' | 'won' | 'lost' | 'cancelled';

export interface QuoteItem {
  name: string;
  qty: number;
  unitPrice: number;
}

export interface Quote {
  id: string;
  clientName: string;
  category: string;            // CATEGORIES 之一
  difficulty?: 1 | 2 | 3 | 4 | 5;
  deadline?: string;            // ISO 日期
  items: QuoteItem[];
  total: number;
  discount?: number;            // 0-1
  finalPrice: number;            // total * (1-discount)
  status: QuoteStatus;
  notes?: string;
  createdAt: string;            // ISO
  updatedAt: string;
  // 状态变化时间戳
  wonAt?: string;
  lostAt?: string;
}

export interface IncomeRecord {
  quoteId: string;
  amount: number;
  receivedAt: string;
}

const QUOTE_PREFIX = 'quote:list:';
const INCOME_PREFIX = 'quote:income:';

export async function listQuotes(opts?: { status?: QuoteStatus; limit?: number }): Promise<Quote[]> {
  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: QUOTE_PREFIX } },
    orderBy: { createdAt: 'desc' },
    take: opts?.limit ?? 500,
  });
  const quotes: Quote[] = [];
  for (const r of rows) {
    try {
      const q = JSON.parse(r.value) as Quote;
      if (!opts?.status || q.status === opts.status) quotes.push(q);
    } catch { /* skip */ }
  }
  return quotes;
}

export async function getQuote(id: string): Promise<Quote | null> {
  const r = await prisma.setting.findUnique({ where: { key: QUOTE_PREFIX + id } });
  if (!r?.value) return null;
  try { return JSON.parse(r.value) as Quote; } catch { return null; }
}

export async function saveQuote(q: Quote): Promise<void> {
  q.updatedAt = new Date().toISOString();
  await prisma.setting.upsert({
    where: { key: QUOTE_PREFIX + q.id },
    update: { value: JSON.stringify(q) },
    create: { key: QUOTE_PREFIX + q.id, value: JSON.stringify(q) },
  });
}

export async function deleteQuote(id: string): Promise<void> {
  await prisma.setting.deleteMany({ where: { key: QUOTE_PREFIX + id } });
  await prisma.setting.deleteMany({ where: { key: INCOME_PREFIX + id } });
}

export async function listIncomes(): Promise<IncomeRecord[]> {
  const rows = await prisma.setting.findMany({ where: { key: { startsWith: INCOME_PREFIX } } });
  const list: IncomeRecord[] = [];
  for (const r of rows) {
    try { list.push(JSON.parse(r.value)); } catch { /* */ }
  }
  return list;
}

export async function recordIncome(rec: IncomeRecord): Promise<void> {
  await prisma.setting.upsert({
    where: { key: INCOME_PREFIX + rec.quoteId },
    update: { value: JSON.stringify(rec) },
    create: { key: INCOME_PREFIX + rec.quoteId, value: JSON.stringify(rec) },
  });
}
