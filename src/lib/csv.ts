/**
 * 简易 CSV/TSV 解析（自动检测分隔符）。
 * 支持双引号包裹、转义双引号。
 */

export type Row = Record<string, string>;

export interface ParseResult {
  headers: string[];
  rows: Row[];
  delimiter: ',' | '\t' | ';';
}

export function detectDelimiter(text: string): ',' | '\t' | ';' {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const counts: Record<',' | '\t' | ';', number> = {
    ',': (firstLine.match(/,/g) || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
    ';': (firstLine.match(/;/g) || []).length,
  };
  let best: ',' | '\t' | ';' = ',';
  let max = 0;
  for (const k of Object.keys(counts) as (',' | '\t' | ';')[]) {
    if (counts[k] > max) {
      max = counts[k];
      best = k;
    }
  }
  return best;
}

function parseLine(line: string, delim: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === '"') {
        inQuote = true;
      } else if (c === delim) {
        cells.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
  }
  cells.push(cur);
  return cells.map((s) => s.trim());
}

export function parseTable(text: string): ParseResult {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return { headers: [], rows: [], delimiter: ',' };
  const delim = detectDelimiter(trimmed);
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
  const headers = parseLine(lines[0], delim);
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i], delim);
    const row: Row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cells[j] ?? '';
    }
    rows.push(row);
  }
  return { headers, rows, delimiter: delim };
}

/** 字段映射建议：根据中文/英文标题猜数据库字段 */
const FIELD_MAP: Record<string, string> = {
  // 平台
  平台: 'platform',
  platform: 'platform',
  // 日期
  日期: 'date',
  date: 'date',
  // 标题
  标题: 'title',
  title: 'title',
  // 类目
  类目: 'category',
  分类: 'category',
  category: 'category',
  // 数字
  曝光: 'impressions',
  曝光量: 'impressions',
  impressions: 'impressions',
  点击: 'clicks',
  clicks: 'clicks',
  点赞: 'likes',
  likes: 'likes',
  收藏: 'favorites',
  favorites: 'favorites',
  评论: 'comments',
  comments: 'comments',
  私信: 'messages',
  messages: 'messages',
  浏览: 'views',
  views: 'views',
  闲鱼浏览: 'views',
  咨询: 'consultations',
  consultations: 'consultations',
  成交: 'orders',
  成交单数: 'orders',
  orders: 'orders',
  '成交金额': 'revenue',
  金额: 'revenue',
  收入: 'revenue',
  revenue: 'revenue',
  客单价: 'averageOrderValue',
  averageorderValue: 'averageOrderValue',
  包月线索: 'subscriptionLeads',
  subscriptionLeads: 'subscriptionLeads',
  备注: 'notes',
  notes: 'notes',
};

export function suggestMapping(headers: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers) {
    const k = h.toLowerCase().replace(/[\s（）()]/g, '');
    out[h] =
      FIELD_MAP[h] ??
      FIELD_MAP[k] ??
      (FIELD_MAP[k.replace('数', '')] ?? '');
  }
  return out;
}

/** 把平台中文映射为代码 */
export function normalizePlatform(s: string): string {
  if (!s) return 'xiaohongshu';
  const t = s.toLowerCase().trim();
  if (t.includes('小红书') || t.includes('xhs') || t.includes('xiaohongshu'))
    return 'xiaohongshu';
  if (t.includes('闲鱼') || t.includes('xianyu')) return 'xianyu';
  return t;
}
