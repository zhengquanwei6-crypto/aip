/**
 * 文案 / 图片提示词 - prompt 构造
 *
 * v0.8 Batch 4：新增可编辑模板基础设施（DEFAULT_PROMPTS / getPromptTemplate）
 * v0.9.2 Batch 1：新增 *Async 系列 build 函数，真正接通 /prompts 编辑器到 generate 链路。
 *   - buildContentMessagesAsync(input)        -> 路由 xiaohongshu:case / xiaohongshu:tutorial / xianyu:product
 *   - buildImagePromptMessagesAsync(input)    -> image:suggest
 *   - buildSuggestionMessagesAsync(input)     -> suggestion:weekly（本批新增默认条目）
 *   旧 sync builder 全部保留作 fallback：getPromptTemplate 找不到时仍回退 sync 实现。
 */

import type { ChatMessage } from './text';
import { prisma } from '@/lib/db';

/* ---------------- 现有动态构造（保持兼容） ---------------- */

export interface ContentInput {
  platform: 'xiaohongshu' | 'xianyu';
  category: string;
  contentType: string;
  audience?: string;
  tone?: string;
  topic?: string; // 任务标题或自定义主题
  keywords?: string[];
  pricePackages?: { tier: string; name: string; priceRange: string }[];
}

const FORBIDDEN = [
  '全网最低', '100%爆单', '必过稿', '国家级', '顶级', '第一', '最佳',
  '保证提升点击率', '保证成交', '保证爆单', '官方认证', '独家', '唯一',
  '加微信', '加我威信', '加vx', '加QQ',
];

export function buildContentMessages(input: ContentInput): ChatMessage[] {
  const platformLabel = input.platform === 'xiaohongshu' ? '小红书' : '闲鱼';
  const kwLine = input.keywords?.length
    ? `必须自然融入以下关键词（不要堆砌）：${input.keywords.join('、')}`
    : '';
  const priceLine = input.pricePackages?.length
    ? `参考价格阶梯（仅作引用）：\n${input.pricePackages
        .map((p) => `- ${p.tier}：${p.name} ${p.priceRange}`)
        .join('\n')}`
    : '';

  const xhsSchema = `{
  "titles": ["5个标题备选"],
  "body": "笔记正文（结构：问题/痛点 → 案例/方法 → 价值说明 → 轻引导私信，使用换行和分段，要像真人写）",
  "coverText": "封面大字（不超过 14 字）",
  "imageSuggestion": "配图建议（描述应该用什么类型的图，几张）",
  "tags": ["6-10个标签关键词，不要带#"],
  "cta": "私信引导话术（一句，自然，不带绝对化词）"
}`;

  const xianyuSchema = `{
  "title": "闲鱼商品标题（30字内，含核心服务+价格区间）",
  "description": "闲鱼商品详情（按：服务项目 → 价格入口 → 交付范围 → 修改次数 → 下单流程 → 拍前须知 → 咨询引导，分段清楚）",
  "coverText": "首图大字（不超过 12 字）",
  "tiers": [
    { "tier": "引流款", "name": "...", "priceRange": "..." },
    { "tier": "标准款", "name": "...", "priceRange": "..." },
    { "tier": "利润款", "name": "...", "priceRange": "..." }
  ],
  "orderFlow": ["下单步骤数组"],
  "deliveryScope": "交付范围（明确成品形式，是否含源文件）",
  "revisionRule": "修改规则（含修改次数、范围、超出加价规则）",
  "preOrderNotes": ["拍前须知数组（每条独立）"],
  "faq": [{ "q": "常见问题", "a": "回答" }],
  "quickReplies": ["快捷回复话术，3-5 条"]
}`;

  const schema = input.platform === 'xiaohongshu' ? xhsSchema : xianyuSchema;

  const system = `你是「平面设计接单 AI 运营工作台」内置的文案助手。任务：为 ${platformLabel} 撰写一条接单运营内容。

强制规则：
1) 严禁出现以下词或表达：${FORBIDDEN.join('、')}。
2) 严禁伪造客户截图、虚假成交、虚假反馈。
3) 严禁站外强导流（不要写"加微信""加vx"等）。
4) 价格只给区间或"X元起"，不要承诺保过、保爆、保成交。
5) 必须输出严格 JSON，不要带任何解释/前后缀，schema 如下：
${schema}`;

  const user = `平台：${platformLabel}
类目：${input.category}
内容类型：${input.contentType}
${input.audience ? `目标客户：${input.audience}` : ''}
${input.tone ? `文案风格：${input.tone}` : ''}
${input.topic ? `本次主题：${input.topic}` : ''}
${kwLine}
${priceLine}

请输出严格 JSON。`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user.replace(/\n{3,}/g, '\n\n') },
  ];
}

export interface ImagePromptInput {
  platform: 'xiaohongshu' | 'xianyu';
  imageType: string; // 封面图/商品首图...
  coverTitle?: string;
  styleKeywords?: string;
  category?: string;
  ratio: '3:4' | '1:1';
}

/** 让 LLM 生成给 GPT-IMG-2 的英文 / 中英混合 prompt */
export function buildImagePromptMessages(input: ImagePromptInput): ChatMessage[] {
  const platformLabel = input.platform === 'xiaohongshu' ? '小红书' : '闲鱼';
  const ratioHint =
    input.ratio === '3:4' ? '竖版 3:4' : '正方形 1:1';

  const system = `你是平面设计接单工作台内的图片提示词专家，输出会喂给 GPT IMG 2 类图像模型。
要求：
1) 中英混合即可，重点是描述构图、配色、风格、文字位置。
2) 不要描述真实人物面孔、不要伪造客户截图、不要冒用品牌 logo。
3) 输出严格 JSON：
{
  "prompt": "可直接喂给图像模型的高质量提示词（80-200字）",
  "negativePrompt": "避免出现的元素（一段话即可）",
  "size": "建议尺寸字符串，例如 1024x1536 / 1024x1024"
}`;

  const user = `平台：${platformLabel}（${ratioHint}）
图片类型：${input.imageType}
${input.category ? `类目：${input.category}` : ''}
${input.coverTitle ? `封面标题（必须包含在画面文字中）：${input.coverTitle}` : ''}
${input.styleKeywords ? `风格关键词：${input.styleKeywords}` : ''}

请输出严格 JSON。`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user.replace(/\n{3,}/g, '\n\n') },
  ];
}

export interface SuggestionInput {
  weeklyMetrics: any[];
  monthlyMetrics: any[];
}

export function buildSuggestionMessages(input: SuggestionInput): ChatMessage[] {
  const system = `你是平面设计接单的运营复盘顾问。
基于给定的近 7 天 / 近 30 天数据，输出严格 JSON：
{
  "summary": "总体一段话总结（不超过 200 字）",
  "amplifyCategories": ["下周继续放大的类目"],
  "reduceCategories": ["下周减少发布的类目"],
  "rewriteTitles": ["需要重写标题的内容（直接列标题）"],
  "redoCovers": ["需要重做首图的商品（标题）"],
  "raisePrice": ["可以适度提高价格的服务"],
  "pushSubscription": ["适合主推包月的服务"],
  "weekFocus": ["下周发布重点（3-5 条）"],
  "nextWeek10": [
    { "platform": "xiaohongshu/xianyu", "time": "HH:mm", "category": "...", "title": "..." }
  ]
}
nextWeek10 必须给出 10 条建议，覆盖小红书 6 条 + 闲鱼 4 条。`;

  const user = `近7天数据：
${JSON.stringify(input.weeklyMetrics, null, 2)}

近30天数据：
${JSON.stringify(input.monthlyMetrics, null, 2)}

请输出严格 JSON。`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/* ---------------- v0.8 B4 - 模板库 ---------------- */

export interface PromptVar {
  key: string;
  label: string;
  example?: string;
}

export interface PromptTemplate {
  name: string;
  description: string;
  system: string;
  user: string;
  vars: PromptVar[];
}

/**
 * 默认模板（DEFAULT_PROMPTS）
 *
 * key 命名约定：`<场景>:<细分>`，例如 xiaohongshu:case
 * 当用户在 /prompts 页编辑时，自定义内容写入 Setting 表 `prompt:<key>`；
 * 删除自定义条目 → 通过 getPromptTemplate 自动回退到此默认。
 */
export const DEFAULT_PROMPTS: Record<string, PromptTemplate> = {
  'xiaohongshu:case': {
    name: '小红书 · 案例型笔记',
    description: '基于真实/伪真实案例展示设计能力，强调结果与转化路径。',
    system:
      '你是平面设计接单 AI 运营工作台的小红书案例文案助手。以"小细节+真实结果"的口吻写笔记，避免绝对化词汇，避免站外导流。输出严格 JSON：{"titles":[5条],"body":"...","coverText":"≤14字","imageSuggestion":"...","tags":["..."],"cta":"..."}',
    user: '类目：{{category}}\n目标客户：{{audience}}\n本次案例主题：{{topic}}\n关键词：{{keywords}}\n\n请输出严格 JSON。',
    vars: [
      { key: 'category', label: '类目', example: 'Logo' },
      { key: 'audience', label: '目标客户', example: '电商卖家' },
      { key: 'topic', label: '案例主题', example: '奶茶店开业菜单升级' },
      { key: 'keywords', label: '关键词', example: 'Logo设计, 餐饮品牌' },
    ],
  },
  'xiaohongshu:tutorial': {
    name: '小红书 · 教程/干货型',
    description: '通过 N 步流程或 N 个套路输出知识型笔记，建立专业感。',
    system:
      '你是小红书教程文案助手。结构：钩子→3-5 步流程→可执行小贴士→轻引导私信。严格 JSON：{"titles":[5条],"body":"...","coverText":"≤14字","imageSuggestion":"...","tags":["..."],"cta":"..."}',
    user: '类目：{{category}}\n目标客户：{{audience}}\n教程主题：{{topic}}\n步骤数：{{steps}}\n\n请输出严格 JSON。',
    vars: [
      { key: 'category', label: '类目', example: '海报' },
      { key: 'audience', label: '目标客户', example: '创业者' },
      { key: 'topic', label: '教程主题', example: '海报排版 5 步法' },
      { key: 'steps', label: '步骤数', example: '5' },
    ],
  },
  'xianyu:product': {
    name: '闲鱼 · 商品文案',
    description: '强调服务项目、价格阶梯、交付范围、修改规则、下单流程。',
    system:
      '你是闲鱼商品文案助手。给出严格 JSON：{"title":"≤30字","description":"分段详情","coverText":"≤12字","tiers":[{"tier":"...","name":"...","priceRange":"..."}],"orderFlow":["..."],"deliveryScope":"...","revisionRule":"...","preOrderNotes":["..."],"faq":[{"q":"...","a":"..."}],"quickReplies":["..."]}',
    user: '类目：{{category}}\n核心服务：{{topic}}\n参考价格：{{priceRange}}\n\n请输出严格 JSON。',
    vars: [
      { key: 'category', label: '类目', example: 'VI品牌' },
      { key: 'topic', label: '核心服务', example: '小型品牌全套VI' },
      { key: 'priceRange', label: '参考价格', example: '500-2000元' },
    ],
  },
  'title:refine': {
    name: '标题打磨器',
    description: '把一个标题用 5 种风格各改写一版（加钩子/更口语/数字化/痛点切入/反差感）。',
    system:
      '你是标题打磨大师。把原标题用 5 种风格各改写一版：加钩子、更口语、数字化、痛点切入、反差感。每条 ≤ 22 字。严格 JSON：{"refined":[{"style":"...","title":"..."}]}',
    user: '原标题：{{title}}\n平台：{{platform}}',
    vars: [
      { key: 'title', label: '原标题', example: '我帮奶茶店升级菜单的故事' },
      { key: 'platform', label: '平台', example: '小红书' },
    ],
  },
  'image:suggest': {
    name: '图片提示词建议',
    description: '为 GPT IMG 2 生成中英混合的图像 prompt，描述构图、配色、文字位置。',
    system:
      '你是图片提示词专家。中英混合输出，强调构图/配色/风格/文字位置。严格 JSON：{"prompt":"...","negativePrompt":"...","size":"1024x1536"}',
    user: '平台：{{platform}}\n图片类型：{{imageType}}\n类目：{{category}}\n封面标题：{{coverTitle}}\n风格：{{styleKeywords}}',
    vars: [
      { key: 'platform', label: '平台', example: '小红书' },
      { key: 'imageType', label: '图片类型', example: '封面图' },
      { key: 'category', label: '类目', example: 'Logo' },
      { key: 'coverTitle', label: '封面标题', example: '5 步搞定 Logo' },
      { key: 'styleKeywords', label: '风格', example: '极简, 暖色调' },
    ],
  },
  // v0.9.2 b1：把 buildSuggestionMessages 的 system 文本搬进默认条目
  'suggestion:weekly': {
    name: '周度运营复盘建议',
    description: '基于近 7 天 / 近 30 天的 metrics 输出下一周运营建议（标题/封面/价格/订阅/重点）。',
    system:
      '你是平面设计接单的运营复盘顾问。\n基于给定的近 7 天 / 近 30 天数据，输出严格 JSON：\n{\n  "summary": "总体一段话总结（不超过 200 字）",\n  "amplifyCategories": ["下周继续放大的类目"],\n  "reduceCategories": ["下周减少发布的类目"],\n  "rewriteTitles": ["需要重写标题的内容（直接列标题）"],\n  "redoCovers": ["需要重做首图的商品（标题）"],\n  "raisePrice": ["可以适度提高价格的服务"],\n  "pushSubscription": ["适合主推包月的服务"],\n  "weekFocus": ["下周发布重点（3-5 条）"],\n  "nextWeek10": [\n    { "platform": "xiaohongshu/xianyu", "time": "HH:mm", "category": "...", "title": "..." }\n  ]\n}\nnextWeek10 必须给出 10 条建议，覆盖小红书 6 条 + 闲鱼 4 条。',
    user:
      '近7天数据：\n{{weeklyMetrics}}\n\n近30天数据：\n{{monthlyMetrics}}\n\n请输出严格 JSON。',
    vars: [
      { key: 'weeklyMetrics', label: '近 7 天 metrics', example: '[]' },
      { key: 'monthlyMetrics', label: '近 30 天 metrics', example: '[]' },
    ],
  },
};

const PROMPT_KEY_RE = /^[a-z0-9:_-]+$/;
const PROMPT_PREFIX = 'prompt:';

export function isValidPromptKey(key: string): boolean {
  return typeof key === 'string' && key.length > 0 && key.length <= 80 && PROMPT_KEY_RE.test(key);
}

export function isPromptTemplateShape(o: any): o is PromptTemplate {
  if (!o || typeof o !== 'object') return false;
  if (typeof o.name !== 'string') return false;
  if (typeof o.description !== 'string') return false;
  if (typeof o.system !== 'string') return false;
  if (typeof o.user !== 'string') return false;
  if (!Array.isArray(o.vars)) return false;
  for (const v of o.vars) {
    if (!v || typeof v.key !== 'string' || typeof v.label !== 'string') return false;
  }
  return true;
}

/**
 * 读取模板：优先从 Setting 表读 `prompt:<key>`，否则回退到 DEFAULT_PROMPTS。
 */
export async function getPromptTemplate(key: string): Promise<PromptTemplate | null> {
  if (!isValidPromptKey(key)) return null;
  try {
    const row = await prisma.setting.findUnique({ where: { key: PROMPT_PREFIX + key } });
    if (row && row.value) {
      try {
        const parsed = JSON.parse(row.value);
        if (isPromptTemplateShape(parsed)) return parsed;
      } catch {
        /* ignore malformed */
      }
    }
  } catch {
    /* prisma error → fall through */
  }
  return DEFAULT_PROMPTS[key] ?? null;
}

/**
 * 列出所有 prompt 条目（合并：用户自定义 + DEFAULT_PROMPTS 兜底）。
 * 自定义优先；用户没有的 key 用 DEFAULT_PROMPTS 填充。
 */
export async function listPromptTemplates(): Promise<
  { key: string; source: 'custom' | 'default'; tpl: PromptTemplate }[]
> {
  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: PROMPT_PREFIX } },
  });
  const customMap = new Map<string, PromptTemplate>();
  for (const row of rows) {
    const k = row.key.slice(PROMPT_PREFIX.length);
    if (!isValidPromptKey(k)) continue;
    try {
      const parsed = JSON.parse(row.value);
      if (isPromptTemplateShape(parsed)) customMap.set(k, parsed);
    } catch {
      /* skip malformed */
    }
  }
  const allKeys = new Set<string>([
    ...customMap.keys(),
    ...Object.keys(DEFAULT_PROMPTS),
  ]);
  const out: { key: string; source: 'custom' | 'default'; tpl: PromptTemplate }[] = [];
  for (const key of allKeys) {
    const custom = customMap.get(key);
    if (custom) {
      out.push({ key, source: 'custom', tpl: custom });
    } else {
      out.push({ key, source: 'default', tpl: DEFAULT_PROMPTS[key] });
    }
  }
  // 排序：先 default 排序键名，再 custom 在前
  out.sort((a, b) => {
    if (a.source !== b.source) return a.source === 'custom' ? -1 : 1;
    return a.key.localeCompare(b.key);
  });
  return out;
}

export const PROMPT_KEY_PREFIX = PROMPT_PREFIX;

/* ---------------- v0.9.2 b1 · 真接入 generate ---------------- */

/**
 * 安全的 {{var}} 模板替换。
 * - 未定义的 var 保留 `{{xxx}}` 原样（不 throw）
 * - null/undefined 替换成空串
 * - Array → join(', ')
 * - object → JSON.stringify
 * - 其他用 String(v)
 */
export function renderTemplate(tmpl: string, vars: Record<string, unknown>): string {
  if (typeof tmpl !== 'string' || !tmpl) return '';
  return tmpl.replace(/\{\{\s*([a-zA-Z0-9_:.\-]+)\s*\}\}/g, (full, key) => {
    if (!(key in vars)) return full;
    const v = vars[key];
    if (v === null || v === undefined) return '';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'object') {
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    }
    return String(v);
  });
}

/**
 * v0.9.2 b1：异步版 buildContentMessages
 * - 路由 platform + contentType → key:
 *     xiaohongshu + 教程型/干货型           → xiaohongshu:tutorial
 *     xiaohongshu + 其他（含案例型）         → xiaohongshu:case
 *     xianyu + *                             → xianyu:product
 *     其他平台                                → xiaohongshu:case 兜底
 * - 命中模板 → 用 tpl.system + renderTemplate(tpl.user, varsMap)
 * - 未命中 → 回退旧 sync buildContentMessages(input)
 */
export async function buildContentMessagesAsync(input: ContentInput): Promise<ChatMessage[]> {
  let key = 'xiaohongshu:case';
  if (input.platform === 'xiaohongshu') {
    const ct = input.contentType || '';
    if (/教程|干货/.test(ct)) key = 'xiaohongshu:tutorial';
    else key = 'xiaohongshu:case';
  } else if (input.platform === 'xianyu') {
    key = 'xianyu:product';
  }
  const tpl = await getPromptTemplate(key);
  if (!tpl) {
    return buildContentMessages(input);
  }
  const vars: Record<string, unknown> = {
    platform: input.platform,
    category: input.category,
    contentType: input.contentType,
    audience: input.audience ?? '',
    tone: input.tone ?? '',
    topic: input.topic ?? '',
    keywords: input.keywords ?? [],
    pricePackages: input.pricePackages ?? [],
  };
  const userMsg = renderTemplate(tpl.user, vars);
  return [
    { role: 'system', content: tpl.system },
    { role: 'user', content: userMsg.replace(/\n{3,}/g, '\n\n') },
  ];
}

/**
 * v0.9.2 b1：异步版 buildImagePromptMessages
 * - key=image:suggest
 * - varsMap：platform / imageType / coverTitle / styleKeywords / category / ratio
 * - 未命中 → 回退 sync buildImagePromptMessages
 */
export async function buildImagePromptMessagesAsync(input: ImagePromptInput): Promise<ChatMessage[]> {
  const tpl = await getPromptTemplate('image:suggest');
  if (!tpl) {
    return buildImagePromptMessages(input);
  }
  const vars: Record<string, unknown> = {
    platform: input.platform,
    imageType: input.imageType,
    coverTitle: input.coverTitle ?? '',
    styleKeywords: input.styleKeywords ?? '',
    category: input.category ?? '',
    ratio: input.ratio,
  };
  const userMsg = renderTemplate(tpl.user, vars);
  return [
    { role: 'system', content: tpl.system },
    { role: 'user', content: userMsg.replace(/\n{3,}/g, '\n\n') },
  ];
}

/**
 * v0.9.2 b1：异步版 buildSuggestionMessages
 * - key=suggestion:weekly
 * - varsMap：weeklyMetrics / monthlyMetrics
 * - 未命中 → 回退 sync buildSuggestionMessages
 */
export async function buildSuggestionMessagesAsync(input: SuggestionInput): Promise<ChatMessage[]> {
  const tpl = await getPromptTemplate('suggestion:weekly');
  if (!tpl) {
    return buildSuggestionMessages(input);
  }
  // 渲染时把 metrics JSON 化成可读字符串，与原 sync 行为一致
  const vars: Record<string, unknown> = {
    weeklyMetrics: JSON.stringify(input.weeklyMetrics ?? [], null, 2),
    monthlyMetrics: JSON.stringify(input.monthlyMetrics ?? [], null, 2),
  };
  const userMsg = renderTemplate(tpl.user, vars);
  return [
    { role: 'system', content: tpl.system },
    { role: 'user', content: userMsg },
  ];
}
