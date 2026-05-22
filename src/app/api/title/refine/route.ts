import { NextRequest, NextResponse } from 'next/server';
import { generateText, extractJSON } from '@/lib/ai/text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/title/refine
 * body: { title: string, platform?: 'xiaohongshu'|'xianyu', styles?: string[] }
 * 返回 { ok, refined: { style: string, title: string }[] }
 *
 * 5 种改写风格：加钩子 / 更口语 / 数字化 / 痛点切入 / 反差感
 */

const DEFAULT_STYLES = ['加钩子', '更口语', '数字化', '痛点切入', '反差感'];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const title = String(body.title || '').trim();
    if (!title) {
      return NextResponse.json(
        { ok: false, error: '请提供原标题' },
        { status: 400 },
      );
    }
    const platform = body.platform === 'xianyu' ? '闲鱼' : '小红书';
    const styles: string[] =
      Array.isArray(body.styles) && body.styles.length > 0
        ? body.styles
        : DEFAULT_STYLES;

    const messages = [
      {
        role: 'system' as const,
        content: `你是 ${platform} 标题打磨大师。
请把原标题用以下 ${styles.length} 种风格各改写一版：${styles.join('、')}
风格说明：
- 加钩子：开头添加悬念/反问/数字+震惊
- 更口语：去掉书面语，像朋友说话
- 数字化：用具体数字代替形容词（"3 步""5 个套路"）
- 痛点切入：直接戳目标用户的痛
- 反差感：制造意外、对比、反预期

要求：
1) 每条不超过 22 字（小红书要求）
2) 不出现绝对化词、不堆砌特殊符号
3) 严格 JSON：{"refined":[{"style":"加钩子","title":"..."},{"style":"更口语","title":"..."},...]}`,
      },
      {
        role: 'user' as const,
        content: `原标题：${title}\n平台：${platform}\n风格：${styles.join('、')}`,
      },
    ];
    const r = await generateText({
      messages,
      responseFormat: 'json',
      temperature: 0.85,
      maxTokens: 800,
    });
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
    }
    const parsed = extractJSON<{
      refined: { style: string; title: string }[];
    }>(r.content);
    if (!parsed?.refined) {
      return NextResponse.json(
        { ok: false, error: 'AI 输出无法解析', raw: r.content },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, refined: parsed.refined });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
