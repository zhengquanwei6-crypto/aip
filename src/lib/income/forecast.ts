/**
 * v0.16-H3.1 · 收入预测算法
 *
 * 简单线性回归 (least squares) + 4 周移动平均 + R²
 * 数据少 (<10 单) 时不预测
 */
import type { Quote, IncomeRecord } from './store';

export interface WeeklyPoint {
  weekStart: string;  // YYYY-MM-DD
  gmv: number;        // 该周成交总额
  signed: number;     // 该周成交单数
  inquired: number;    // 该周询价（创建报价）数
}

function weekStart(d: Date): string {
  const dt = new Date(d);
  const day = dt.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day; // 周一为周首日
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0, 10);
}

export function aggregateWeekly(quotes: Quote[], incomes: IncomeRecord[]): WeeklyPoint[] {
  const map = new Map<string, WeeklyPoint>();
  function get(ws: string): WeeklyPoint {
    if (!map.has(ws)) {
      map.set(ws, { weekStart: ws, gmv: 0, signed: 0, inquired: 0 });
    }
    return map.get(ws)!;
  }
  for (const q of quotes) {
    const created = new Date(q.createdAt);
    get(weekStart(created)).inquired += 1;
    if (q.status === 'won' && q.wonAt) {
      const won = new Date(q.wonAt);
      const p = get(weekStart(won));
      p.signed += 1;
      p.gmv += q.finalPrice;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

/** 4 周移动平均 */
export function movingAverage(series: number[], window = 4): number[] {
  const out: number[] = [];
  for (let i = 0; i < series.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = series.slice(start, i + 1);
    out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return out;
}

/** 简单线性回归 y = a + b*x */
export function linearRegression(ys: number[]): { a: number; b: number; r2: number } {
  const n = ys.length;
  if (n < 2) return { a: ys[0] || 0, b: 0, r2: 0 };
  const xs = ys.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const b = den === 0 ? 0 : num / den;
  const a = meanY - b * meanX;
  // R²
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const yhat = a + b * xs[i];
    ssRes += (ys[i] - yhat) ** 2;
    ssTot += (ys[i] - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { a, b, r2 };
}

/** 下月 GMV 预测 (平均每周 * 4) */
export function forecastNextMonth(weekly: WeeklyPoint[]): {
  predictedGmv: number;
  lower: number;
  upper: number;
  confidence: number; // R² 0-1
  basis: string;
} {
  const gmv = weekly.map((p) => p.gmv);
  if (gmv.length < 4) {
    const avg = gmv.length ? gmv.reduce((a, b) => a + b, 0) / gmv.length : 0;
    return {
      predictedGmv: avg * 4,
      lower: avg * 3,
      upper: avg * 5,
      confidence: 0,
      basis: `数据不足 (${gmv.length} 周) · 用现有平均 × 4`,
    };
  }
  const ma = movingAverage(gmv, 4);
  const reg = linearRegression(ma);
  const nextWeek1 = reg.a + reg.b * ma.length;
  const nextWeek2 = reg.a + reg.b * (ma.length + 1);
  const nextWeek3 = reg.a + reg.b * (ma.length + 2);
  const nextWeek4 = reg.a + reg.b * (ma.length + 3);
  const predicted = Math.max(0, nextWeek1 + nextWeek2 + nextWeek3 + nextWeek4);
  const stdDev = Math.sqrt(
    gmv.reduce((acc, v, i) => acc + (v - ma[i]) ** 2, 0) / gmv.length,
  );
  return {
    predictedGmv: Math.round(predicted),
    lower: Math.max(0, Math.round(predicted - stdDev * 4)),
    upper: Math.round(predicted + stdDev * 4),
    confidence: Math.max(0, Math.min(1, reg.r2)),
    basis: `线性回归 (${gmv.length} 周, R²=${reg.r2.toFixed(2)})`,
  };
}
