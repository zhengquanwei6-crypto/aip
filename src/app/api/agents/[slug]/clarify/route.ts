/**
 * v0.15 · /api/agents/[slug]/clarify
 *
 * 让 LLM 根据主题给出 2-4 个关键问题（让用户答完后驱动风格更精准）。
 * 第 1 轮：内置 3 个通用问题（视觉调性 + 主色 + 目标人群），不调 LLM 节省 token
 * 第 2 轮：让 LLM 看了第 1 轮答案后决定要不要补问 0-2 个细化问题
 *
 * 入参：{ topic, round, previousAnswers?, keyOverride? }
 * 出参：{ ok, done?, questions?: ClarifyQuestion[] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { generateText, extractJSON, type ChatMessage } from '@/lib/ai/text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SLUG_TO_NAME: Record<string, string> = {
  'xiaohongshu-operator': '小红书',
  'xianyu-operator': '闲鱼',
  'qianniu-operator': '千牛',
};

interface ClarifyQuestion {
  id: string;
  question: string;
  type: 'choice' | 'text';
  options?: string[];
  allowCustom?: boolean;
}

const ROUND_1_QUESTIONS: ClarifyQuestion[] = [
  {
    id: 'tone',
    question: '希望这组图整体是什么调性？',
    type: 'choice',
    options: [
      '简约高级（克制留白）',
      '可爱治愈（柔和暖色）',
      '专业干货（信息密集）',
      '复古胶片（颗粒质感）',
      '黑金商务（深色高端）',
    ],
    allowCustom: true,
  },
  {
    id: 'primaryColor',
    question: '主色调倾向？',
    type: 'choice',
    options: ['白底', '米白 / 奶油', '莫兰迪粉', '深蓝 / 海军蓝', '森林绿', '暖橙 / 黄'],
    allowCustom: true,
  },
  {
    id: 'audience',
    question: '主要面向什么人群？',
    type: 'text',
  },
];

export async function POST(
  req: NextRequest,
  ctx: { params: { slug: string } },
) {
  const slug = ctx.params.slug;
  const platformName = SLUG_TO_NAME[slug];
  if (!platformName) {
    return NextResponse.json(
      { ok: false, error: `不支持的 agent: ${slug}` },
      { status: 404 },
    );
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  const topic = String(body?.topic || '').trim();
  const round = Number(body?.round) === 2 ? 2 : 1;
  const previousAnswers: Record<string, string> =
    body?.previousAnswers && typeof body.previousAnswers === 'object'
      ? body.previousAnswers
      : {};
  const llmKeyOverride: string | null = body?.keyOverride?.llm || null;
  if (!topic) {
    return NextResponse.json({ ok: false, error: '请输入主题' }, { status: 400 });
  }

  if (round === 1) {
    return NextResponse.json({ ok: true, questions: ROUND_1_QUESTIONS });
  }

  // 第 2 轮：交给 LLM 决定要不要补问
  const prevText = Object.entries(previousAnswers)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `你是${platformName}运营策划。基于用户已经回答的关键信息，判断是否还需要补问 0-2 个问题让生成的内容更精准。

输出严格 JSON：
- 如果信息已经够：{"done": true}
- 如果还需要补问：{"done": false, "questions": [{"id":"...", "question":"...", "type":"choice|text", "options":[]?, "allowCustom":true|false}]}

补问准则：
- 最多 2 个（用户已经填了 3 个，不要烦扰）
- 只问对图像生成有直接影响的（如：是否需要文字 / 主体物 / 镜头风格 / 实拍 vs 插画）
- 不要问颜色（已经问过）

直接 JSON。`,
    },
    {
      role: 'user',
      content: `主题：${topic}\n\n用户已回答：\n${prevText}\n\n判断要不要补问。`,
    },
  ];
  try {
    const res = await generateText({
      messages,
      temperature: 0.5,
      maxTokens: 600,
      responseFormat: 'json',
    });
    if (!res.ok) {
      // 即使 LLM 失败也要让流程继续
      return NextResponse.json({ ok: true, done: true });
    }
    const parsed = extractJSON<{ done?: boolean; questions?: ClarifyQuestion[] }>(
      res.content,
    );
    if (!parsed) return NextResponse.json({ ok: true, done: true });
    if (parsed.done) return NextResponse.json({ ok: true, done: true });
    if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
      return NextResponse.json({
        ok: true,
        questions: parsed.questions.slice(0, 2),
      });
    }
    return NextResponse.json({ ok: true, done: true });
  } catch {
    return NextResponse.json({ ok: true, done: true });
  }
}
