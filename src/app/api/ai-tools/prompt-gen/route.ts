/**
 * v0.15-k · POST /api/ai-tools/prompt-gen
 *
 * 提示词生成器：把用户简单中文主题 → 平台调性英文 image prompt × N
 *
 * 用户场景: 复制 prompt 到 Midjourney / Stable Diffusion / Flux / DALL-E 等外部平台直接出图
 *
 * 入参:
 *   { theme: string, platform: 'xiaohongshu'|'xianyu'|'qianniu'|'general', count?: 3|5|10, stylePresetId?: string }
 *
 * 出参:
 *   { ok: true, prompts: [{ promptEn, promptZh, style, aspectRatio }, ...], timing }
 *   | { ok: false, error }
 *
 * 0 IMAGE 调用 (纯文本)，0 schema 改动
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateText, extractJSON, type ChatMessage } from '@/lib/ai/text';
import { injectGenomeIntoMessages } from '@/lib/style-genome/inject';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Platform = 'xiaohongshu' | 'xianyu' | 'qianniu' | 'general';

interface PlatformProfile {
  visualKeywords: string;
  defaultAspectRatio: string;
  defaultSize: string;
  cnLabel: string;
}

const PLATFORM_PROFILES: Record<Platform, PlatformProfile> = {
  xiaohongshu: {
    visualKeywords:
      'soft natural light, muted pastel palette (Morandi tones), lifestyle aesthetic, ins-style, minimalist composition, gentle bokeh, photogenic plating, paper texture overlay',
    defaultAspectRatio: '3:4',
    defaultSize: '1024x1536',
    cnLabel: '小红书（莫兰迪 / ins / 文艺）',
  },
  xianyu: {
    visualKeywords:
      'studio product shot, white seamless background, clean lighting, sharp focus, e-commerce style, neutral backdrop, flat shadow, centered composition, no clutter',
    defaultAspectRatio: '1:1',
    defaultSize: '1024x1024',
    cnLabel: '闲鱼（白底 / 商品 / 电商）',
  },
  qianniu: {
    visualKeywords:
      'professional product scene, brand-aligned, high-end commercial photography, dramatic lighting, premium materials, depth of field, magazine-grade composition, atmospheric mood',
    defaultAspectRatio: '16:9',
    defaultSize: '1536x1024',
    cnLabel: '千牛（场景 / 品牌 / 高端）',
  },
  general: {
    visualKeywords: 'high quality, detailed, well composed, balanced lighting',
    defaultAspectRatio: '1:1',
    defaultSize: '1024x1024',
    cnLabel: '通用（自由风格）',
  },
};

interface GeneratedPrompt {
  promptEn: string;
  promptZh: string;
  style: string;
  aspectRatio: string;
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const theme = String(body?.theme || '').trim();
    const platform = (String(body?.platform || 'general') as Platform);
    const requestedCount = Number(body?.count) || 5;
    const count = [3, 5, 10].includes(requestedCount) ? requestedCount : 5;

    if (!theme) {
      return NextResponse.json({ ok: false, error: '请输入主题' }, { status: 400 });
    }
    if (theme.length > 200) {
      return NextResponse.json({ ok: false, error: '主题不能超过 200 字' }, { status: 400 });
    }
    if (!PLATFORM_PROFILES[platform]) {
      return NextResponse.json({ ok: false, error: '平台参数不合法' }, { status: 400 });
    }

    const profile = PLATFORM_PROFILES[platform];

    const sysPrompt = `你是一个专业的 AI 图像生成提示词工程师，专门为「${profile.cnLabel}」平台优化提示词。

平台调性关键词：${profile.visualKeywords}
默认画面比例：${profile.defaultAspectRatio}（${profile.defaultSize}）

任务：基于用户给出的主题，生成 ${count} 条**完全不同**的英文 image prompt（promptEn），每条都需要：
- 包含主题核心元素 + 平台风格关键词 + 光照 / 构图 / 色彩 / 材质描述
- 适合 Midjourney / Stable Diffusion / Flux / DALL-E 直接使用
- 每条 promptEn 控制在 30-80 个英文 token 内
- 必须是英文（即使主题是中文）
- ${count} 条之间要有明显构图 / 视角 / 光照差异，避免雷同
- 同时给出对应中文翻译（promptZh，用于用户预览意图）
- 给一个简短风格标签（style，比如 "侧拍特写"、"俯拍平铺"、"全景氛围" 等）

严格输出 JSON（不要任何其它文本，不要 markdown 包裹）：
{
  "prompts": [
    { "promptEn": "...", "promptZh": "...", "style": "...", "aspectRatio": "${profile.defaultAspectRatio}" }
  ]
}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: `主题：${theme}\n\n请输出 ${count} 条 prompt。` },
    ];

        // v0.16-H1 genome injection (soft, fail-silent)
    const __sg = await injectGenomeIntoMessages(messages as any, { skip: (body as any)?.useStyleGenome === false }).catch(() => ({ messages: messages as any[], applied: false }));
    const r = await generateText({
      messages: __sg.messages as any,
      temperature: 0.85,
      maxTokens: 1800,
      responseFormat: 'json',
    });

    if (!r.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: r.error || 'LLM 调用失败',
          model: r.model,
          timing: { totalMs: Date.now() - t0 },
        },
        { status: 200 },
      );
    }

    const parsed = extractJSON<{ prompts: GeneratedPrompt[] }>(r.content);
    if (!parsed || !Array.isArray(parsed.prompts) || parsed.prompts.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'LLM 输出不是合法 JSON 或 prompts 为空',
          raw: r.content?.slice(0, 500),
          model: r.model,
          timing: { totalMs: Date.now() - t0 },
        },
        { status: 200 },
      );
    }

    // 清洗：保留前 count 条，统一字段
    const prompts: GeneratedPrompt[] = parsed.prompts
      .slice(0, count)
      .map((p) => ({
        promptEn: String(p.promptEn || '').slice(0, 600),
        promptZh: String(p.promptZh || '').slice(0, 400),
        style: String(p.style || '').slice(0, 60),
        aspectRatio: String(p.aspectRatio || profile.defaultAspectRatio).slice(0, 16),
      }))
      .filter((p) => p.promptEn.length > 0);

    if (prompts.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: '生成结果为空，请换个主题再试',
          timing: { totalMs: Date.now() - t0 },
        },
        { status: 200 },
      );
    }

    // 写 AIOutput 历史 (fire-and-forget; 失败不影响响应)
    try {
      await prisma.aIOutput.create({
        data: {
          type: 'prompt-gen',
          input: JSON.stringify({ theme, platform, count }),
          output: JSON.stringify({ prompts }),
          model: r.model || 'llm',
        },
      });
    } catch (e) {
      console.warn('[prompt-gen/persist]', (e as Error).message);
    }

    return NextResponse.json({
      ok: true,
      theme,
      platform,
      platformLabel: profile.cnLabel,
      count: prompts.length,
      prompts,
      timing: { totalMs: Date.now() - t0 },
      model: r.model,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: `服务端异常：${(err as Error).message}`,
        timing: { totalMs: Date.now() - t0 },
      },
      { status: 500 },
    );
  }
}
