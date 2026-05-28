/**
 * v0.15 · /api/agents/[slug]/build-all · 三个运营智能体核心
 *
 * 用户原话：
 *   - 运营智能体页面统一，不需要过多的内容
 *   - 现在堆积的智能体定义太多了，导致生成的图片过于固定
 *   - 添加或优化更加有用的功能
 *
 * 重构要点：
 *   1. systemPrompt 内置且极简（不引用 findAgent，不堆约束）
 *   2. 不再依赖 image-crop / style-translator（之前缺失导致编译失败）
 *   3. 5 张图：第 1 张 t2i 封面 + 4 张 i2i 同源；i2i 失败回退到独立 t2i
 *   4. 关键信息直接在 build-all 输入：风格、平台、主题、用户答案
 *   5. SSE 心跳保留（避免长任务被网关切断）
 */

import { NextRequest } from 'next/server';
import { generateText, extractJSON, type ChatMessage } from '@/lib/ai/text';
import { runImageGenerate } from '@/lib/image-runner';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

type PlatformKey = 'xiaohongshu' | 'xianyu' | 'qianniu';

const SLUG_TO_PLATFORM: Record<string, PlatformKey> = {
  'xiaohongshu-operator': 'xiaohongshu',
  'xianyu-operator': 'xianyu',
  'qianniu-operator': 'qianniu',
};

const PLATFORM_RATIO: Record<PlatformKey, string> = {
  xiaohongshu: '3:4',
  xianyu: '1:1',
  qianniu: '1:1',
};

const PLATFORM_SIZE: Record<PlatformKey, string> = {
  xiaohongshu: '1024x1536',
  xianyu: '1024x1024',
  qianniu: '1024x1024',
};

const PLATFORM_NAME: Record<PlatformKey, string> = {
  xiaohongshu: '小红书',
  xianyu: '闲鱼',
  qianniu: '千牛 / 淘宝',
};

const PLATFORM_PAGE_ROLES: Record<PlatformKey, string[]> = {
  xiaohongshu: ['封面｜吸引点击', '痛点｜共鸣', '思路｜专业', '结果｜对比', '转化｜引导'],
  xianyu: ['主图｜点击率', '细节｜特写', '场景｜真实', '对比/规格', '诚信｜说明'],
  qianniu: ['主图｜点击', '卖点图', '规格图', '场景图', '信任图'],
};

interface PageSpec {
  pageTitle?: string;
  mainText?: string;
  subText?: string;
  layout?: string;
  color?: string;
  material?: string;
  imagePrompt: string;
}

interface SelfCheckItem {
  question: string;
  passed: boolean;
  note?: string;
}

interface LLMOutput {
  pages?: PageSpec[];
  titles?: string[];
  body?: string;
  commentHook?: string;
  dmKeyword?: string;
  title?: string;
  negotiationReplies?: string[];
  priceTag?: string;
  sellingPoints?: string[];
  marketingPoints?: string[];
  targetUsers?: string[];
  mainSellingPoint?: string;
  tags?: string[];
  selfCheck?: SelfCheckItem[];
  styleSummary?: string;
}

interface ImageOutcome {
  index: number;
  ok: boolean;
  url?: string;
  error?: string;
  imgMs?: number;
  mode?: 't2i' | 'i2i';
}

/**
 * v0.15 · 极简 systemPrompt 工厂
 * 减去过去 v0.14 那套强行 "4 段结构 + 锚点照抄" 的硬约束，
 * 给 LLM 自由度，让它根据主题与用户偏好产出风格多样的高质量 imagePrompt。
 */
function buildSystemPrompt(
  platform: PlatformKey,
  styleHint: string,
  brand: string,
): string {
  const platformName = PLATFORM_NAME[platform];
  const ratio = PLATFORM_RATIO[platform];
  const roles = PLATFORM_PAGE_ROLES[platform];

  const xhsExtras =
    platform === 'xiaohongshu'
      ? `
小红书风格指引：
- 封面：大字标题 + 主视觉清晰，构图留白干净；优先纵向 ${ratio}
- 痛点：用对比 / 反例 / 真实场景制造共鸣
- 思路：流程图 / icon list / 步骤演示
- 结果：实拍/对比图/数据图
- 转化：行动号召 + 评论关键词`
      : platform === 'xianyu'
      ? `
闲鱼风格指引：
- 主图：${ratio} 干净背景，价格醒目，主体居中或黄金分割
- 细节：特写镜头 + 标尺/对比物，体现成色
- 场景：真实使用场景，不做过度修饰
- 对比规格：列表 / 配置表 / 关键参数
- 诚信：实拍 / 凭证 / 包装`
      : `
千牛 / 淘宝风格指引：
- 主图：${ratio} 白底 / 浅底，主体清晰，符合电商主图规范
- 卖点：上 4 个核心卖点 + icon
- 规格：尺寸 / 材质 / 工艺 表
- 场景：使用场景或搭配
- 信任：质检 / 售后 / 物流图`;

  return `你是「${platformName}运营策划」。任务：根据用户主题，一次性产出一篇笔记/商品页 + 5 张统一风格的配图提示词。

输出严格 JSON，禁止 markdown 包裹，禁止注释。

字段：
- titles: 候选标题 5 个（中文，每个 ≤ 20 字，钩子式）
- title: 推荐 1 个标题（${platformName === '小红书' ? '小红书笔记标题' : '商品标题'}）
- body: 正文 / 商品描述（中文，3-6 段，自然分行）
- mainSellingPoint: 主推卖点（中文一句）
- sellingPoints: 卖点列表 3-5 条
- marketingPoints: 营销点 3-5 条（短词，例 "限时" / "顺丰包邮"）
- targetUsers: 目标人群 2-4 条
- tags: 话题标签 5-8 个（不带 #）
- commentHook: 评论引导（中文一句）
- dmKeyword: 私信关键词（4-8 字）
- styleSummary: 一句话描述本组配图的整体调性
- pages: 长度 5 的数组，每个元素：
    - pageTitle: 这页的中文小标题（≤ 12 字）
    - mainText: 这页的主文案（≤ 30 字）
    - subText: 辅助文案（可选）
    - layout: 版式描述（中文一句）
    - color: 配色描述（中文一句，含主色 + 辅色）
    - material: 主体材质 / 拍摄风格描述
    - imagePrompt: 完整英文 prompt（80-180 词），可直接喂给 gpt-image / Flux 等模型
- selfCheck: 合规自检 3-5 条 [{question, passed, note?}]

5 张图功能定位（pages[i]）：
${roles.map((r, i) => `  ${i + 1}. ${r}`).join('\n')}

视觉统一原则（写 imagePrompt 时遵循）：
- 5 张共享同一调色板（在 styleSummary 写明）
- 5 张共享同一字体 / 镜头 / 光线 mood
- 主体 / 构图 / 镜头机位每张不同，避免雷同
- 中文文字 ≤ 8 字，可放可不放；英文文字干净
- 不加水印 / logo 占位 / 模板花纹 / clip art

${xhsExtras}

${styleHint ? `用户偏好风格：${styleHint}（必须在 imagePrompt 与 styleSummary 中体现）` : ''}
${brand ? `品牌 / 店名：${brand}（封面或主图体现一次即可）` : ''}

直接输出 JSON。`;
}

async function generateOneImage(
  index: number,
  page: PageSpec,
  platform: PlatformKey,
  imageKeyOverride: string | null,
  mode: 't2i' | 'i2i',
  sourceImageUrl?: string,
): Promise<ImageOutcome> {
  const t0 = Date.now();
  try {
    const finalPrompt =
      mode === 'i2i' && sourceImageUrl
        ? `Same color palette, font style, mood and overall aesthetic as the reference image, but with completely different layout and main subject.\n\nThis frame: ${page.imagePrompt}`
        : page.imagePrompt;

    const r = await runImageGenerate({
      prompt: finalPrompt,
      size: PLATFORM_SIZE[platform],
      n: 1,
      mode,
      aspectRatio: PLATFORM_RATIO[platform],
      ...(sourceImageUrl ? { sourceImageUrl } : {}),
      imageKeyOverride: imageKeyOverride ?? undefined,
    });
    const imgMs = Date.now() - t0;
    if (!r.ok || r.savedUrls.length === 0) {
      return { index, ok: false, error: r.error || '生图失败', imgMs, mode };
    }
    return { index, ok: true, url: r.savedUrls[0], imgMs, mode };
  } catch (e) {
    return {
      index,
      ok: false,
      error: (e as Error).message,
      imgMs: Date.now() - t0,
      mode,
    };
  }
}

async function doBuildAllInner(
  req: NextRequest,
  ctx: { params: { slug: string } },
): Promise<{ status: number; body: any }> {
  try {
    const slug = ctx.params.slug;
    const platform = SLUG_TO_PLATFORM[slug];
    if (!platform) {
      return { status: 404, body: { ok: false, error: `不支持的 agent: ${slug}` } };
    }

    const body = await req.json();
    const topic = String(body.topic || '').trim();
    const clarifyAnswers: Record<string, string> =
      body.clarifyAnswers && typeof body.clarifyAnswers === 'object'
        ? body.clarifyAnswers
        : {};
    const llmKeyOverride: string | null = body.keyOverride?.llm || null;
    const imageKeyOverride: string | null = body.keyOverride?.image || null;
    if (!topic) return { status: 400, body: { ok: false, error: '请输入主题' } };

    // 把用户偏好（关键问题答案）展平成 styleHint
    const styleHint = [
      clarifyAnswers.tone,
      clarifyAnswers.style,
      clarifyAnswers['视觉调性'],
      clarifyAnswers.primaryColor && `主色 ${clarifyAnswers.primaryColor}`,
      clarifyAnswers.accentColor && `辅色 ${clarifyAnswers.accentColor}`,
    ]
      .filter(Boolean)
      .join('，');
    const brand =
      clarifyAnswers.brandName || clarifyAnswers.shopName || '';

    const systemPrompt = buildSystemPrompt(platform, styleHint, brand);
    const clarifyText =
      Object.keys(clarifyAnswers).length > 0
        ? '\n\n用户已回答的关键问题（必须严格遵循）：\n' +
          Object.entries(clarifyAnswers)
            .map(([k, v]) => `- ${k}: ${v}`)
            .join('\n')
        : '';

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `主题：${topic}${clarifyText}\n\n请按角色卡输出严格 JSON。pages 必须 5 个。`,
      },
    ];

    const llmStart = Date.now();
    const llmRes = await generateText({
      messages,
      temperature: 0.8,
      maxTokens: 4000,
      responseFormat: 'json',
      // llmKeyOverride: 类型未支持，留作 v0.14 之后做
    });
    if (!llmRes.ok) {
      return {
        status: 500,
        body: { ok: false, stage: 'llm', error: llmRes.error || 'LLM 调用失败' },
      };
    }
    const parsed = extractJSON<LLMOutput>(llmRes.content);
    if (!parsed || !Array.isArray(parsed.pages) || parsed.pages.length === 0) {
      return {
        status: 500,
        body: {
          ok: false,
          stage: 'llm',
          error: 'LLM 输出缺 pages[]',
          raw: llmRes.content?.slice(0, 800),
        },
      };
    }
    const llmDurationMs = Date.now() - llmStart;

    // 补齐到 5 页
    const pages: PageSpec[] = parsed.pages.slice(0, 5);
    while (pages.length < 5) {
      const last = pages[pages.length - 1];
      pages.push({
        ...last,
        imagePrompt:
          (last?.imagePrompt || '') +
          `; alternative composition variant ${pages.length + 1}`,
      });
    }

    // 第 1 张 t2i，后 4 张 i2i 基于第 1 张同源
    const imgStart = Date.now();
    const cover = await generateOneImage(
      0,
      pages[0],
      platform,
      imageKeyOverride,
      't2i',
    );

    let rest: ImageOutcome[];
    if (cover.ok && cover.url) {
      rest = await Promise.all(
        pages.slice(1).map((p, i) =>
          generateOneImage(i + 1, p, platform, imageKeyOverride, 'i2i', cover.url),
        ),
      );
    } else {
      // 封面失败 → 后 4 张降级独立 t2i
      rest = await Promise.all(
        pages.slice(1).map((p, i) =>
          generateOneImage(i + 1, p, platform, imageKeyOverride, 't2i'),
        ),
      );
    }
    const outcomes: ImageOutcome[] = [cover, ...rest];
    const imgPipelineMs = Date.now() - imgStart;

    // 落 Asset
    const assetIds: (string | null)[] = [];
    for (const o of outcomes) {
      if (!o.ok || !o.url) {
        assetIds.push(null);
        continue;
      }
      try {
        const a = await prisma.asset.create({
          data: {
            type:
              platform === 'xiaohongshu'
                ? '小红书笔记图'
                : platform === 'xianyu'
                  ? '闲鱼商品图'
                  : '淘宝主图',
            source: 'ai_generated',
            platform,
            category: null,
            url: o.url,
            prompt: pages[o.index].imagePrompt,
            fileName: o.url.split('/').pop() || '',
          },
        });
        assetIds.push(a.id);
      } catch {
        assetIds.push(null);
      }
    }

    // 落 AIOutput
    try {
      await prisma.aIOutput.create({
        data: {
          type: 'platform-build-5img',
          input: JSON.stringify({ platform, topic, clarifyAnswers }),
          output: JSON.stringify({
            ...parsed,
            imageOutcomes: outcomes.map((o) => ({
              index: o.index,
              ok: o.ok,
              url: o.url,
              error: o.error,
              mode: o.mode,
            })),
            pipelineVersion: 'v0.15-clean',
          }),
          model: `${slug}|${llmRes.model || 'unknown'}`,
        },
      });
    } catch {
      /* ignore */
    }

    const successCount = outcomes.filter((o) => o.ok && o.url).length;
    return {
      status: 200,
      body: {
        ok: successCount > 0,
        partialSuccess: successCount > 0 && successCount < 5,
        platform,
        pipeline: 'cover-t2i+rest-i2i',
        text: {
          pages: pages.map((p, i) => ({
            ...p,
            imageUrl: outcomes[i]?.url,
            imageError: outcomes[i]?.error,
            assetId: assetIds[i],
            mode: outcomes[i]?.mode,
          })),
          titles: parsed.titles ?? [],
          title: parsed.title,
          body: parsed.body,
          tags: parsed.tags ?? [],
          commentHook: parsed.commentHook,
          dmKeyword: parsed.dmKeyword,
          negotiationReplies: parsed.negotiationReplies ?? [],
          priceTag: parsed.priceTag,
          sellingPoints: parsed.sellingPoints ?? [],
          marketingPoints: parsed.marketingPoints ?? [],
          targetUsers: parsed.targetUsers ?? [],
          mainSellingPoint: parsed.mainSellingPoint,
          selfCheck: parsed.selfCheck ?? [],
          styleSummary: parsed.styleSummary,
        },
        images: outcomes,
        timing: {
          llmMs: llmDurationMs,
          imgPipelineMs,
          coverMs: cover.imgMs,
          totalMs: llmDurationMs + imgPipelineMs,
        },
        successCount,
        totalImages: pages.length,
        model: llmRes.model,
      },
    };
  } catch (err) {
    return {
      status: 500,
      body: { ok: false, error: (err as Error).message || 'unknown' },
    };
  }
}

/** SSE 包装：每 5 秒 ping 一次，避免网关 60 秒切线
 *
 * 客户端可选两种消费方式：
 *   1. Accept: text/event-stream → 走 SSE，从 event: result 拿 JSON
 *   2. 默认 → 直接返回普通 JSON（PlatformWorkspaceClient 用这个，简单）
 */
export async function POST(
  req: NextRequest,
  ctx: { params: { slug: string } },
) {
  const accept = req.headers.get('accept') || '';
  const wantsSSE = accept.includes('text/event-stream');

  // 普通 JSON 路径
  if (!wantsSSE) {
    const { status, body } = await doBuildAllInner(req, ctx);
    return Response.json(body, { status });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`event: started\ndata: ${Date.now()}\n\n`));
      let alive = true;
      const heartbeat = setInterval(() => {
        if (!alive) return;
        try {
          controller.enqueue(encoder.encode(`event: ping\ndata: ${Date.now()}\n\n`));
        } catch {
          /* ignore */
        }
      }, 5000);

      try {
        const { status, body } = await doBuildAllInner(req, ctx);
        const payload = JSON.stringify({ status, body });
        controller.enqueue(encoder.encode(`event: result\ndata: ${payload}\n\n`));
      } catch (err) {
        const msg = (err as Error).message || 'unknown';
        const payload = JSON.stringify({
          status: 500,
          body: { ok: false, error: msg },
        });
        controller.enqueue(encoder.encode(`event: result\ndata: ${payload}\n\n`));
      } finally {
        alive = false;
        clearInterval(heartbeat);
        controller.enqueue(encoder.encode(`event: done\ndata: ${Date.now()}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
