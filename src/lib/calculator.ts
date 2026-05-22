/**
 * 报价计算器：基于价格套餐 + 加价规则
 */

export interface QuoteInput {
  category: string;
  tier: string; // 引流款/标准款/利润款
  basePrice: number; // 用户在 UI 选定/输入的基础价（区间中位数）
  urgent: boolean; // 急单
  sourceFiles: boolean; // 含源文件
  commercialUse: boolean; // 商用授权
  revisions: number; // 修改次数（默认 3）
  rushFactor?: number; // 急单加价系数，默认 0.4 = 40%
  extraSourceFiles?: number; // 源文件加价（绝对值），默认 50
  extraCommercial?: number; // 商用授权加价（绝对值），默认 100
}

export interface QuoteResult {
  category: string;
  tier: string;
  basePrice: number;
  finalPrice: number;
  breakdown: { label: string; amount: number }[];
  delivery: string;
  scope: string[];
  notes: string[];
  message: string; // 自动生成的报价话术
}

export function calcQuote(input: QuoteInput): QuoteResult {
  const rushFactor = input.rushFactor ?? 0.4;
  const extraSrc = input.extraSourceFiles ?? 50;
  const extraComm = input.extraCommercial ?? 100;

  const breakdown: { label: string; amount: number }[] = [];
  breakdown.push({ label: `${input.tier} 基础价`, amount: input.basePrice });

  let total = input.basePrice;
  if (input.urgent) {
    const add = Math.round(input.basePrice * rushFactor);
    total += add;
    breakdown.push({ label: `加急 (+${Math.round(rushFactor * 100)}%)`, amount: add });
  }
  if (input.sourceFiles) {
    total += extraSrc;
    breakdown.push({ label: '源文件 (PSD/AI)', amount: extraSrc });
  }
  if (input.commercialUse) {
    total += extraComm;
    breakdown.push({ label: '商用授权', amount: extraComm });
  }

  const delivery = input.urgent ? '当天交付（24h 内）' : '常规 2-3 天交付';
  const scope: string[] = [
    `${input.tier === '引流款' ? '1 稿初稿' : input.tier === '利润款' ? '5 稿备选' : '3 稿备选'}`,
    `${input.revisions} 次免费修改`,
    '成品 JPG / PNG',
  ];
  if (input.sourceFiles) scope.push('源文件 PSD / AI');
  if (input.commercialUse) scope.push('完整商用授权');

  const notes: string[] = [
    `修改 ${input.revisions} 次以上需另议`,
    '不含已下单后的需求重大变更',
  ];
  if (!input.sourceFiles) notes.push('源文件需另加 ' + extraSrc + ' 元');
  if (!input.commercialUse) notes.push('如需商用授权请提前告知');

  // 报价话术
  const lines: string[] = [];
  lines.push(`你这个 ${input.category} 我建议走 ${input.tier}。`);
  lines.push(`总价 ${total} 元，包含 ${scope.join('、')}。`);
  lines.push(`交付节奏：${delivery}。`);
  if (input.urgent) lines.push(`急单加急已含在价里。`);
  lines.push(`没问题就帮你开排期。`);

  return {
    category: input.category,
    tier: input.tier,
    basePrice: input.basePrice,
    finalPrice: total,
    breakdown,
    delivery,
    scope,
    notes,
    message: lines.join(' '),
  };
}

/** 从价格区间字符串里提取中位数。例如 "199-399元" → 299；"9.9元" → 9.9 */
export function extractMidPrice(priceRange: string): number {
  if (!priceRange) return 0;
  const nums = priceRange.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return 0;
  if (nums.length === 1) return parseFloat(nums[0]);
  const a = parseFloat(nums[0]);
  const b = parseFloat(nums[1]);
  return Math.round((a + b) / 2);
}
