/**
 * /api/agents/[slug]/build-all  v0.14 (i2i 链路 + SSE 流式心跳)
 *
 *  v0.12: 5 张并发 t2i —— 5 张图风格各异
 *  v0.13: 封面 t2i 先出 → 后 4 张并发 i2i 基于封面生 → 5 张同源同色调
 *  v0.14: 整个 POST 包成 SSE，每 5 秒发一次 ping，避免任何中间网关 60 秒超时切线
 *
 * 入参支持新增 clarifyAnswers: Record<string, string> 把问答结果拼进 LLM system 上下文。
 */

import { NextRequest, NextResponse } from 'next/server';
import { findAgent } from '@/lib/agent-types';
import { generateText, extractJSON, type ChatMessage } from '@/lib/ai/text';
import { runImageGenerate } from '@/lib/image-runner';
import { pickUpstreamSizeForPlatform, type PlatformKey } from '@/lib/image-crop';
import { resolveStyle, styleAnchorBlock, PLATFORM_MUST_HAVE } from '@/lib/agents/style-translator';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

const SLUG_TO_PLATFORM: Record<string, PlatformKey> = {
  'xiaohongshu-operator': 'xiaohongshu',
  'xianyu-operator': 'xianyu',
  'qianniu-operator': 'qianniu',
};

const PLATFORM_RATIO: Record<PlatformKey, string> = {
  'xiaohongshu': '3:4',
  'xianyu':      '1:1',
  'qianniu':     '1:1',
};
const PLATFORM_SIZE: Record<PlatformKey, string> = {
  'xiaohongshu': '1536x2048',
  'xianyu':      '2048x2048',
  'qianniu':     '2048x2048',
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
  sellingPoint?: string;
  sellingPoints?: string[];
  marketingPoints?: string[];
  targetUsers?: string[];
  mainSellingPoint?: string;
  tags?: string[];
  selfCheck?: SelfCheckItem[];
  imageNegative?: string;
  styleSummary?: string;
  topicAngle?: string;
  contentStrategy?: string;
  recommendedTitleIdx?: number;
  recommendedReason?: string;
  coverTextOptions?: string[];
  recommendedCoverIdx?: number;
  body3Lines?: string;
  commentHooks?: string[];
  needsSimulatedCaseTag?: boolean;
  needsAiAssistNote?: boolean;
  imageNegativeGlobal?: string;
  imageGenerationGuidance?: string;
}

interface ImageOutcome {
  index: number;
  ok: boolean;
  rawUrl?: string;
  url?: string;
  cropInfo?: { from: string; to: string; bytes: number } | { error: string };
  error?: string;
  imgMs?: number;
  cropMs?: number;
  mode?: 't2i' | 'i2i';
}

async function generateOneImage(
  index: number,
  page: PageSpec,
  platform: PlatformKey,
  upstreamSize: string,
  imageKeyOverride: string | null,
  mode: 't2i' | 'i2i',
  sourceImageUrl?: string,
  aspectRatio?: string,
): Promise<ImageOutcome> {
  const imgStart = Date.now();
  try {
    const finalPrompt = mode === 'i2i' && sourceImageUrl
      ? `基于参考图的【色调/字体/质感】保持一致，但【布局完全不同 + 主体内容完全不同】，绝对不要复制参考图的元素位置。本张要画的是：${page.imagePrompt}`
      : page.imagePrompt;

    const r = await runImageGenerate({
      prompt: finalPrompt,
      size: upstreamSize,
      n: 1,
      mode,
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(sourceImageUrl ? { sourceImageUrl } : {}),
      imageKeyOverride: imageKeyOverride ?? undefined,
    });
    const imgMs = Date.now() - imgStart;
    if (!r.ok || r.savedUrls.length === 0) {
      return { index, ok: false, error: r.error || '生图失败', imgMs, mode };
    }
    const rawUrl = r.savedUrls[0];

    return {
      index, ok: true, rawUrl, url: rawUrl,
      imgMs, mode,
    };
  } catch (e) {
    return { index, ok: false, error: (e as Error).message, imgMs: Date.now() - imgStart, mode };
  }
}

/** v0.14 内核：返回 { status, body } 给 SSE wrapper */
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
    const agent = findAgent(slug);
    if (!agent) {
      return { status: 500, body: { ok: false, error: `agent ${slug} 未注册` } };
    }

    const body = await req.json();
    const topic = String(body.topic || '').trim();
    const clarifyAnswers: Record<string, string> = (body.clarifyAnswers && typeof body.clarifyAnswers === 'object') ? body.clarifyAnswers : {};
    const llmKeyOverride: string | null = body.keyOverride?.llm || null;
    const imageKeyOverride: string | null = body.keyOverride?.image || null;
    const buildMode: 'draft' | 'full' = body.mode === 'draft' ? 'draft' : 'full';
    if (!topic) return { status: 400, body: { ok: false, error: '请输入主题' } };

    const llmStart = Date.now();
    const clarifyText = Object.keys(clarifyAnswers).length > 0
      ? '\n\n用户已回答的关键问题（必须严格遵循）：\n' + Object.entries(clarifyAnswers).map(([k, v]) => `- ${k}: ${v}`).join('\n')
      : '';

    const userTone = clarifyAnswers.tone || clarifyAnswers.style || clarifyAnswers['视觉调性'] || '';
    const visualStyle = resolveStyle(userTone);
    if (clarifyAnswers.primaryColor) {
      visualStyle.primaryColor = clarifyAnswers.primaryColor;
    }
    if (clarifyAnswers.accentColor) {
      visualStyle.accentColor = clarifyAnswers.accentColor;
    }
    const anchorBlock = styleAnchorBlock(visualStyle);

    const brandName = clarifyAnswers.brandName || clarifyAnswers.shopName || clarifyAnswers.extra || '';
    const platformMust = PLATFORM_MUST_HAVE[platform];

    const anchorRequirement = `
【v0.14 强约束 — imagePrompt 必须按 4 段结构写】

每张 pages[].imagePrompt 必须严格按 4 段写，用"｜"分隔，禁止偷工减料：

【1. 主体内容】这页画什么真实物体/场景，≤30 字（必须有具体物，不能纯抽象）

【2. 必有元素】根据这页功能给出具体落地指令：
${platformMust ? '  封面/主图：' + platformMust.cover + '\n  其余张：' + platformMust.rest : ''}
${brandName ? '  店名/品牌名要体现：' + brandName : ''}

【3. 视觉锚点】**所有 5 张图必须照抄下面这段**（只能照抄不能改）：
  "${anchorBlock}"

【4. 反例约束】写明这页绝不要哪些（如"不要纯白底无字、不要莫兰迪艺术展感、不要海报模板感、不要中英混杂"）

----

**重点强调（违反将被视为低质量输出）**：
- 第 1 张（封面/主图）必须是 5 张里**最有点击吸引力的**，必须有"大字标题"或"价格标签"或"主推卖点"画在图上，不能是纯环境图
- 不要让 5 张图视觉上太像，每张的主体内容要明显不同（封面=钩子、第2张=痛点对比、第3张=思路图、第4张=结果实拍、第5张=转化引导）
- 中文图字一定要"清晰可读"，不能模糊不能错位
`;

    const messages: ChatMessage[] = [
      { role: 'system', content: agent.systemPrompt + anchorRequirement },
      { role: 'user', content: `主题：${topic}${clarifyText}\n\n请按角色卡输出严格 JSON（含 pages[5] 数组、每张 imagePrompt 末尾必须有完全一致的"统一锚点段"）。` },
    ];
    const llmRes = await generateText({
      messages, temperature: 0.7, maxTokens: 4000, responseFormat: 'json', llmKeyOverride,
    });
    if (!llmRes.ok) {
      return { status: 500, body: { ok: false, stage: 'llm', error: llmRes.error || 'LLM 调用失败' } };
    }
    const parsed = extractJSON<LLMOutput>(llmRes.content);
    if (!parsed || !Array.isArray(parsed.pages) || parsed.pages.length === 0) {
      return { status: 500, body: { ok: false, stage: 'llm', error: 'LLM 输出缺 pages[]', raw: llmRes.content?.slice(0, 800) } };
    }
    const llmDurationMs = Date.now() - llmStart;

    // v0.13 B6 fix #1: xhs-operator v2 是 6 页 schema (旧逻辑误把第 6 页砍掉再克隆假占位)
    const pages: PageSpec[] = parsed.pages.slice(0, 6);
    const minPages = slug === 'xiaohongshu-operator-legacy' ? 5 : 6;
    while (pages.length < minPages) {
      pages.push({ ...pages[pages.length - 1], imagePrompt: pages[pages.length - 1]?.imagePrompt || topic });
    }

    if (slug === 'xiaohongshu-operator') {
      const expectedRoles = ['噱头封面', '问题展示', '设计思路', '前后对比', '细节拆解', '总结互动'];
      pages.length = Math.min(pages.length, 6);
      for (let i = 0; i < 6 && i < pages.length; i++) {
        const pg: any = pages[i];
        if (pg.pageRole !== expectedRoles[i]) {
          pg.pageRole = expectedRoles[i];
        }
      }
      if (pages.length === 6 && pages[5].imagePrompt === pages[4].imagePrompt) {
        try {
          const fixMsg: ChatMessage[] = [
            { role: 'system', content: '你是小红书图文笔记策划师。仅生成第 6 页（总结互动）的内容。严格 JSON 格式，禁止 markdown。' },
            { role: 'user', content: `主题：${topic}\n\n基于前 5 页（${pages.slice(0,5).map((p:any) => p.pageTitle).join(' / ')}），生成第 6 页"总结互动"，要求：\n- 作用：引导评论收藏\n- 内容：3 个 icon 行（适合谁找我）+ 评论关键词框 + 收藏价值总结\n- 与前 5 页主题完全不同\n- imagePrompt ≥ 200 字按 4 段写\n\n输出 JSON: {"pageRole":"总结互动","pageTitle":"...","mainText":"...","subText":"...","layout":"...","color":"...","material":"...","imagePrompt":"...","imageNegativePrompt":"..."}` },
          ];
          const fixRes = await generateText({ messages: fixMsg, temperature: 0.7, maxTokens: 1200, responseFormat: 'json', llmKeyOverride });
          if (fixRes.ok) {
            const fixed: any = extractJSON(fixRes.content);
            if (fixed && typeof fixed === 'object' && fixed.imagePrompt) {
              pages[5] = { ...pages[5], ...fixed, pageRole: '总结互动' };
              console.log('[xhs-v2] 第 6 页已重生');
            }
          }
        } catch (e) {
          console.warn('[xhs-v2] 第 6 页重生失败:', (e as Error).message);
        }
      }
    }

    if (buildMode === 'draft') {
      const llmTotalMs = Date.now() - llmStart;
      return {
        status: 200,
        body: {
          ok: true,
          mode: 'draft',
          stage: 'llm-only',
          llmMs: llmTotalMs,
          topicAngle: parsed.topicAngle,
          contentStrategy: parsed.contentStrategy,
          titles: parsed.titles ?? [],
          recommendedTitleIdx: parsed.recommendedTitleIdx,
          recommendedReason: parsed.recommendedReason,
          coverTextOptions: parsed.coverTextOptions ?? [],
          recommendedCoverIdx: parsed.recommendedCoverIdx,
          body3Lines: parsed.body3Lines,
          body: parsed.body,
          pages: pages,
          tags: parsed.tags ?? [],
          commentHooks: parsed.commentHooks ?? (parsed.commentHook ? [parsed.commentHook] : []),
          selfCheck: parsed.selfCheck ?? [],
          needsSimulatedCaseTag: parsed.needsSimulatedCaseTag,
          needsAiAssistNote: parsed.needsAiAssistNote,
          imageNegativeGlobal: parsed.imageNegativeGlobal ?? parsed.imageNegative,
          styleSummary: parsed.styleSummary,
          imageGenerationGuidance: parsed.imageGenerationGuidance ?? '本草稿包含 ' + pages.length + ' 张 imagePrompt，建议确认无误后一次性生成所有图，避免重复消耗。',
          images: [],
        },
      };
    }

    const upstreamSize = PLATFORM_SIZE[platform];
    const imgPipelineStart = Date.now();

    const coverOutcome = await generateOneImage(0, pages[0], platform, upstreamSize, imageKeyOverride, 't2i', undefined, PLATFORM_RATIO[platform]);
    let restOutcomes: ImageOutcome[] = [];
    // v0.13 B6 fix #3: cover 失败时记录降级标志
    let coverFailDowngrade = false;
    if (coverOutcome.ok && coverOutcome.url) {
      restOutcomes = await Promise.all(
        pages.slice(1).map((p, i) =>
          generateOneImage(i + 1, p, platform, upstreamSize, imageKeyOverride, 'i2i', coverOutcome.url, PLATFORM_RATIO[platform]),
        ),
      );
    } else {
      coverFailDowngrade = true;
      restOutcomes = await Promise.all(
        pages.slice(1).map((p, i) =>
          generateOneImage(i + 1, p, platform, upstreamSize, imageKeyOverride, 't2i', undefined, PLATFORM_RATIO[platform]),
        ),
      );
    }
    const outcomes: ImageOutcome[] = [coverOutcome, ...restOutcomes];
    const imgPipelineMs = Date.now() - imgPipelineStart;

    const assetIds: (string | null)[] = [];
    for (const o of outcomes) {
      if (!o.ok || !o.url) { assetIds.push(null); continue; }
      const a = await prisma.asset.create({
        data: {
          type: platform === 'xiaohongshu' ? '小红书笔记图' : platform === 'xianyu' ? '闲鱼商品图' : '淘宝主图',
          source: 'ai_generated',
          platform, category: null,
          url: o.url,
          prompt: pages[o.index].imagePrompt,
          fileName: o.url.split('/').pop() || '',
        },
      });
      assetIds.push(a.id);
    }

    await prisma.aIOutput.create({
      data: {
        type: 'platform-build-5img',
        input: JSON.stringify({ platform, topic, clarifyAnswers }),
        output: JSON.stringify({
          ...parsed,
          imageOutcomes: outcomes.map((o) => ({ index: o.index, ok: o.ok, url: o.url, error: o.error, mode: o.mode })),
          pipelineVersion: 'v0.14-sse',
        }),
        model: `${slug}|${llmRes.model || 'unknown'}`,
      },
    });

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
            ...p, imageUrl: outcomes[i]?.url, imageError: outcomes[i]?.error, assetId: assetIds[i],
            mode: outcomes[i]?.mode,
          })),
          titles: parsed.titles || [],
          title: parsed.title,
          body: parsed.body,
          tags: parsed.tags || [],
          commentHook: parsed.commentHook,
          dmKeyword: parsed.dmKeyword,
          negotiationReplies: parsed.negotiationReplies || [],
          priceTag: parsed.priceTag,
          sellingPoint: parsed.sellingPoint,
          sellingPoints: parsed.sellingPoints || [],
          marketingPoints: parsed.marketingPoints || [],
          targetUsers: parsed.targetUsers || [],
          mainSellingPoint: parsed.mainSellingPoint,
          selfCheck: parsed.selfCheck || [],
          styleSummary: parsed.styleSummary,
          imageNegative: parsed.imageNegative,
        },
        images: outcomes,
        timing: {
          llmMs: llmDurationMs,
          imgPipelineMs,
          coverMs: coverOutcome.imgMs,
          totalMs: llmDurationMs + imgPipelineMs,
        },
        successCount, totalImages: pages.length,
        model: llmRes.model,
      },
    };
  } catch (err) {
    return { status: 500, body: { ok: false, error: (err as Error).message || 'unknown' } };
  }
}

/** v0.14 SSE Wrapper —— 心跳 5 秒一次 ping，避免任何中间网关 60 秒超时切线 */
export async function POST(req: NextRequest, ctx: { params: { slug: string } }) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // 立刻先发一个 started 让前端 / 网关知道连接已建立
      controller.enqueue(encoder.encode(`event: started\ndata: ${Date.now()}\n\n`));

      // 心跳定时器：每 5 秒一次 ping
      let alive = true;
      const heartbeat = setInterval(() => {
        if (!alive) return;
        try {
          controller.enqueue(encoder.encode(`event: ping\ndata: ${Date.now()}\n\n`));
        } catch {}
      }, 5000);

      try {
        const { status, body } = await doBuildAllInner(req, ctx);
        const payload = JSON.stringify({ status, body });
        controller.enqueue(encoder.encode(`event: result\ndata: ${payload}\n\n`));
      } catch (err) {
        const msg = (err as Error).message || 'unknown';
        const payload = JSON.stringify({ status: 500, body: { ok: false, error: msg } });
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
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx 关闭 buffer
    },
  });
}
