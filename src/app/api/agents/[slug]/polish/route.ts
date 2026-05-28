/**
 * v0.15 · /api/agents/[slug]/polish
 *
 * 让 LLM 把用户粗略的主题润色得更具体（结构化、有钩子）。
 * 用于 PlatformWorkspaceClient 的 ✨ AI 润色按钮。
 */
import { NextRequest, NextResponse } from 'next/server';
import { generateText, type ChatMessage } from '@/lib/ai/text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SLUG_TO_NAME: Record<string, string> = {
  'xiaohongshu-operator': '小红书',
  'xianyu-operator': '闲鱼',
  'qianniu-operator': '千牛',
};

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
  if (!topic) {
    return NextResponse.json({ ok: false, error: '请输入主题' }, { status: 400 });
  }
  const llmKeyOverride: string | null = body?.keyOverride?.llm || null;

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `你是${platformName}运营文案润色助手。
任务：把用户给的粗略一句话主题，润色成 1-2 句更具体、更有钩子的描述（中文，≤ 80 字）。
要求：
- 保留原意，不编造产品参数
- 加入目标人群 / 关键卖点 / 适用场景任一维度让主题更具体
- 不要写营销话术，不要排版，直接一段中文文字
- 禁止使用「全网最低 / 100% / 必过稿」等违禁词`,
    },
    {
      role: 'user',
      content: `请润色这个主题：${topic}`,
    },
  ];
  try {
    const res = await generateText({
      messages,
      temperature: 0.7,
      maxTokens: 200,
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: res.error || 'LLM 调用失败' },
        { status: 500 },
      );
    }
    const polished = String(res.content || '').trim();
    return NextResponse.json({ ok: true, polished });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
