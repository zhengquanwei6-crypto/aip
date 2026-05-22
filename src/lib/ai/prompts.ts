/**
 * 文案 / 图片提示词 - prompt 构造
 */

import type { ChatMessage } from './text';

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
