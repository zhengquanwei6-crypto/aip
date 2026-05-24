/**
 * /api/agents/publish-director/build · v0.9 b3 (+ v0.9.2 b1 async builders + v0.11 B7 size/quality)
 *
 * v0.9 b3 (B1)：
 *   - 新增 body.taskId：由 /today 任务卡触发时传入
 *   - Post.create / Product.create 时把 taskId 写进去（schema 已有）
 *   - step3 全成功 + regenerate==='all' 时调 prisma.task.update：
 *       status='generated', title=titles[0]/title, body, coverText, imageUrl=assets[0]?.url
 *   - 失败容忍：task.update 失败不影响整体响应（会写到响应里 taskUpdateError 字段）
 *
 * v0.9.2 b1：
 *   - step1 改用 buildContentMessagesAsync，让 /prompts 编辑器编辑的
 *     xiaohongshu:case / xiaohongshu:tutorial / xianyu:product 真正影响下一次生成。
 *
 * v0.11 B7（图片尺寸/质量预设池）：
 *   - imageOptions 新增 size?: string · quality?: string
 *   - step3 调 runImageGenerate 时透传：runImageGenerate 内 resolveSize/resolveQuality 按
 *     当前 IMAGE_DEFAULT_ADAPTER 的 sizes/qualities 池收敛
 *   - LLM step2 输出的 recommendedSize 仍存在，但**仅作回显**：用户在 imageOptions 选了 size 时
 *     用户优先（与 stylePresetSize 同优先级行为；避免出现 LLM 推荐 1024x1536 但用户选 2K 的不一致）
 *
 * "先文案再图片"链式编排（含图片选项扩展）：
 *   step 1: buildContentMessagesAsync → generateText(json) → content（小红书/闲鱼 schema）
 *   step 2: 用 photo-director systemPrompt + step1 的 title/coverText/body
 *           + imageOptions (风格/色调/语言/数量/系列) → generateText(json)
 *           → stylePrompt（单图）或 series（N 条 promptEn）
 *   step 3: 若 autoImage===true，按 imageOptions.n 串行调 runImageGenerate N 次
 *           - 系列模式：每次用 seriesPrompts[i].promptEn
 *           - 非系列 / 同 prompt：每次用同一 promptEn
 *           - 单图：兼容老逻辑
 *
 * regenerate 控制：
 *   'all'      ← 默认：跑 1+2+3
 *   'content'  ← 只跑 1
 *   'style'    ← 跑 2
 *   'image'    ← 跑 3（用 cachedContent + cachedStylePrompt）
 *
 * v0.9 b2 imageOptions：
 *   {
 *     autoImage?: boolean,        // 默认 true
 *     stylePresetId?: string,     // ImagePreset.id
 *     styleKeywords?: string,     // 与 preset 二选一，preset 优先
 *     negativePrompt?: string,
 *     primaryColor?: string,      // "#F5C842 暖黄"
 *     accentColor?: string,
 *     textLanguage?: 'zh' | 'en', // 默认 'en'
 *     n?: number,                  // 1-4，默认 1
 *     sameStyle?: boolean,         // n>1 时生效，默认 true
 *     asSeries?: boolean,          // n>1 + sameStyle 时生效，默认 true
 *     // v0.11 B7
 *     size?: string,               // 来自 adapter.sizes[*].value
 *     quality?: string,            // 来自 adapter.qualities[*].value
 *   }
 *
 * Response（v0.9 b2 改造）：
 *   - assets: 数组形式（n=1 时也是 [single]）
 *   - asset: 兼容字段（=assets[0] 或 null）
 *   - imageErrors: [{ scene?, error }]，单张失败不阻塞其他
 *   - seriesPlan: LLM 系列总编排（系列模式才有）
 *
 * 错误容忍：
 *   - step1 失败 → 整体 500
 *   - step2 失败 → 返回 step1 content + stylePrompt:null
 *   - step3 部分失败 → 200 + assets + imageErrors[]
 *   - 系列模式 LLM 没正确输出 seriesPrompts[] → 降级为 N 次同 promptEn，trace 提示
 *
 * 落库（仅 step1/2/3 都成功的 'all' 全链）：
 *   prisma.aIOutput × 2
 *   prisma.post.create / prisma.product.create
 *   prisma.asset.create × N（每张图独立）
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { findAgent } from '@/lib/agent-types';
import { generateText, extractJSON, type ChatMessage } from '@/lib/ai/text';
import { buildContentMessagesAsync } from '@/lib/ai/prompts';
import { runImageGenerate } from '@/lib/image-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 240;

type Platform = 'xiaohongshu' | 'xianyu';
type Regenerate = 'all' | 'content' | 'style' | 'image';
type TextLanguage = 'zh' | 'en';
type SizeStr = '1024x1024' | '1024x1536' | '1536x1024';

interface ImageOptions {
  autoImage?: boolean;
  stylePresetId?: string;
  styleKeywords?: string;
  negativePrompt?: string;
  primaryColor?: string;
  accentColor?: string;
  textLanguage?: TextLanguage;
  n?: number;
  sameStyle?: boolean;
  asSeries?: boolean;
  /** v0.11 B7：用户从 adapter.sizes 池里选的尺寸字符串（"1024x1024" / "2048x2048" / "768x1024" 等）*/
  size?: string;
  /** v0.11 B7：用户从 adapter.qualities 池里选的质量字符串（"low"/"medium"/"high" / "standard"/"hd"）*/
  quality?: string;
}

interface BuildBody {
  platform?: Platform;
  category?: string;
  contentType?: string;
  topic?: string;
  audience?: string;
  tone?: string;
  /** 老字段保留：等价于 imageOptions.autoImage */
  autoImage?: boolean;
  imageOptions?: ImageOptions;
  regenerate?: Regenerate;
  /**
   * v0.9 b3：可选关联 task。给定后：
   *   - Post.create / Product.create 带 taskId
   *   - 全链成功后反写 task（status='generated', title/body/coverText/imageUrl）
   */
  taskId?: string;
  /** 重生时复用上次结果 */
  cachedContent?: any;
  cachedStylePrompt?: {
    styleSummary?: string;
    promptEn?: string;
    negativeEn?: string;
    recommendedSize?: SizeStr;
    seriesPrompts?: { scene?: string; promptEn?: string }[];
    seriesPlan?: string;
  };
  /** 用户手改后的中文 styleSummary，作为 hint */
  styleSummaryHint?: string;
}

interface SeriesItem {
  scene?: string;
  promptEn: string;
}

interface StylePrompt {
  styleSummary: string;
  /** 单图模式 */
  promptEn: string;
  negativeEn: string;
  recommendedSize: SizeStr;
  tips?: string[];
  /** 系列模式 */
  seriesPrompts?: SeriesItem[];
  seriesPlan?: string;
}

interface AssetEntry {
  id?: string;
  url?: string;
  scene?: string;
  /** 仅当本张失败时填 */
  error?: string;
  /** 仅当本张失败时填（精简 trace） */
  trace?: any;
}

const VALID_SIZES: SizeStr[] = ['1024x1024', '1024x1536', '1536x1024'];

function defaultSize(platform?: Platform, contentType?: string): SizeStr {
  if (platform === 'xianyu' || contentType === '商品' || contentType === '商品图') return '1024x1024';
  return '1024x1536';
}

function clampN(n: any, fallback = 1): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  if (v < 1) return 1;
  if (v > 4) return 4;
  return Math.floor(v);
}

/** 从 ImagePreset 表合并 styleKeywords / negativePrompt / size */
async function mergePresetIntoOptions(opts: ImageOptions | undefined): Promise<ImageOptions & { _presetSize?: SizeStr }> {
  const base: ImageOptions & { _presetSize?: SizeStr } = { ...(opts ?? {}) };
  if (!base.stylePresetId) return base;
  try {
    const preset = await prisma.imagePreset.findUnique({ where: { id: base.stylePresetId } });
    if (!preset) return base;
    // preset 优先于用户文本
    base.styleKeywords = preset.styleKeywords || base.styleKeywords;
    if (preset.negativePrompt) {
      base.negativePrompt = base.negativePrompt
        ? `${preset.negativePrompt}, ${base.negativePrompt}`
        : preset.negativePrompt;
    }
    if (preset.size && (VALID_SIZES as string[]).includes(preset.size)) {
      base._presetSize = preset.size as SizeStr;
    }
  } catch {
    // ignore
  }
  return base;
}

function summarizeForStyle(content: any, body: BuildBody, opts: ImageOptions): string {
  const parts: string[] = [];
  if (body.platform) parts.push(`平台：${body.platform}`);
  if (body.category) parts.push(`类目：${body.category}`);
  if (body.contentType) parts.push(`内容类型：${body.contentType}`);
  if (body.styleSummaryHint) parts.push(`用户当前的中文风格描述（请尊重并细化）：${body.styleSummaryHint}`);

  if (content) {
    if (Array.isArray(content.titles) && content.titles.length > 0) {
      parts.push(`标题候选：${content.titles.slice(0, 3).join(' / ')}`);
    }
    if (typeof content.title === 'string') parts.push(`标题：${content.title}`);
    if (typeof content.coverText === 'string') parts.push(`封面文字：${content.coverText}`);
    if (typeof content.body === 'string') parts.push(`正文（前 400 字）：${(content.body as string).slice(0, 400)}`);
    if (typeof content.description === 'string') {
      parts.push(`商品描述（前 400 字）：${(content.description as string).slice(0, 400)}`);
    }
    if (Array.isArray(content.tiers) && content.tiers.length > 0) {
      parts.push(`三档价位：${content.tiers.map((t: any) => `${t.tier}${t.priceRange ?? ''}`).join(' / ')}`);
    }
    if (Array.isArray(content.tags) && content.tags.length > 0) {
      parts.push(`tags：${content.tags.slice(0, 6).join(', ')}`);
    }
  }

  // ─── v0.9 b2 imageOptions 段 ───
  const imgLines: string[] = [];
  if (opts.styleKeywords) imgLines.push(`styleKeywords: ${opts.styleKeywords}`);
  if (opts.negativePrompt) imgLines.push(`negativePrompt: ${opts.negativePrompt}`);
  if (opts.primaryColor) imgLines.push(`primaryColor: ${opts.primaryColor}`);
  if (opts.accentColor) imgLines.push(`accentColor: ${opts.accentColor}`);
  imgLines.push(`textLanguage: ${opts.textLanguage || 'en'}`);
  // v0.11 B7：把 size/quality 也喂给 LLM 做参考（不强求 LLM 输出，仅作 hint）
  if (opts.size) imgLines.push(`size(用户从 adapter 池选): ${opts.size}`);
  if (opts.quality) imgLines.push(`quality(用户从 adapter 池选): ${opts.quality}`);
  const n = clampN(opts.n, 1);
  imgLines.push(`n: ${n}`);
  imgLines.push(`sameStyle: ${opts.sameStyle !== false}`);
  imgLines.push(`asSeries: ${opts.asSeries !== false}`);
  if (n >= 2 && opts.sameStyle !== false && opts.asSeries !== false) {
    imgLines.push(`seriesCount: ${n}（请按系列模式输出 seriesPrompts[]，包含 ${n} 个不同 scene 切片）`);
  }
  if (imgLines.length > 0) {
    parts.push(`\n【imageOptions】\n${imgLines.join('\n')}`);
  }

  return parts.join('\n');
}

async function runStyleStep(
  systemPrompt: string,
  content: any,
  body: BuildBody,
  opts: ImageOptions,
): Promise<
  | { ok: true; result: StylePrompt; model?: string }
  | { ok: false; error: string; model?: string; raw?: string }
> {
  const userBlock = summarizeForStyle(content, body, opts);
  const n = clampN(opts.n, 1);
  const wantSeries = n >= 2 && opts.sameStyle !== false && opts.asSeries !== false;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content:
        '请基于以下已写好的中文文案 + 图片选项，输出 image prompt JSON：\n\n' +
        userBlock +
        (wantSeries
          ? `\n\n系列模式：必须输出 seriesPrompts[] 共 ${n} 条，每条 scene 不同，但 palette/字体/光线/风格完全一致。`
          : '\n\n单图模式：输出 promptEn / negativeEn / recommendedSize / styleSummary。') +
        '\n\n再次提醒：只输出严格 JSON，promptEn / negativeEn 必须英文，styleSummary / seriesPlan / scene / tips 必须中文。',
    },
  ];

  const r = await generateText({
    messages,
    temperature: 0.5,
    // 系列模式下 token 量更大（N × promptEn），相应放大
    maxTokens: wantSeries ? 1600 : 700,
    responseFormat: 'json',
  });
  if (!r.ok) return { ok: false, error: r.error || 'style LLM 调用失败', model: r.model };

  const parsed = extractJSON<any>(r.content);
  if (!parsed) {
    return { ok: false, error: 'style LLM 输出不是合法 JSON', model: r.model, raw: r.content };
  }

  // 解析 styleSummary
  const styleSummary =
    typeof parsed.styleSummary === 'string' && parsed.styleSummary.trim()
      ? parsed.styleSummary
      : '';

  // 解析 negativeEn
  const negativeEn =
    typeof parsed.negativeEn === 'string' && parsed.negativeEn.trim()
      ? parsed.negativeEn
      : 'low quality, blurry, watermark, text artifacts, cluttered, distorted';

  // 解析 recommendedSize
  let size: SizeStr = defaultSize(body.platform, body.contentType);
  if (typeof parsed.recommendedSize === 'string' && (VALID_SIZES as string[]).includes(parsed.recommendedSize)) {
    size = parsed.recommendedSize as SizeStr;
  }

  // 解析系列
  let seriesPrompts: SeriesItem[] | undefined;
  let seriesPlan: string | undefined;
  if (wantSeries) {
    if (Array.isArray(parsed.seriesPrompts) && parsed.seriesPrompts.length > 0) {
      const items: SeriesItem[] = parsed.seriesPrompts
        .map((it: any): SeriesItem | null => {
          if (it && typeof it.promptEn === 'string' && it.promptEn.trim()) {
            return {
              scene: typeof it.scene === 'string' ? it.scene : undefined,
              promptEn: it.promptEn,
            };
          }
          return null;
        })
        .filter((x: SeriesItem | null): x is SeriesItem => !!x);
      if (items.length > 0) seriesPrompts = items;
    }
    if (typeof parsed.seriesPlan === 'string') seriesPlan = parsed.seriesPlan;
  }

  // 单图 promptEn fallback：系列模式如果有 seriesPrompts 就拿第一条做兼容字段
  let promptEn = '';
  if (typeof parsed.promptEn === 'string' && parsed.promptEn.trim()) {
    promptEn = parsed.promptEn;
  } else if (seriesPrompts && seriesPrompts.length > 0) {
    promptEn = seriesPrompts[0].promptEn;
  }

  // 校验：单图模式下必须有 promptEn 与 styleSummary
  if (!wantSeries && (!promptEn || !styleSummary)) {
    return {
      ok: false,
      error: 'style LLM 输出缺失 promptEn 或 styleSummary',
      model: r.model,
      raw: r.content,
    };
  }
  // 系列模式：seriesPrompts 缺失或 styleSummary 缺失都视为软失败 → fallback 由调用方处理
  if (wantSeries && !styleSummary) {
    return {
      ok: false,
      error: 'style LLM 输出缺失 styleSummary（系列模式）',
      model: r.model,
      raw: r.content,
    };
  }

  const result: StylePrompt = {
    styleSummary,
    promptEn,
    negativeEn,
    recommendedSize: size,
    tips: Array.isArray(parsed.tips) ? parsed.tips.filter((x: any) => typeof x === 'string') : undefined,
    seriesPrompts,
    seriesPlan,
  };
  return { ok: true, result, model: r.model };
}

/**
 * 串行执行 N 次出图，每张失败独立记录。
 * - assets 始终是 N 长度（失败的位置 url 缺，error 填）
 *
 * v0.11 B7：传入 size / quality（来自 imageOptions），透传 runImageGenerate
 */
async function runImagesSerial(opts: {
  prompts: { promptEn: string; scene?: string }[];
  negativeEn: string;
  size: string;
  quality?: string;
  platform?: Platform;
  category?: string | null;
}): Promise<{ assets: AssetEntry[]; errors: { idx: number; scene?: string; error: string }[] }> {
  const assets: AssetEntry[] = [];
  const errors: { idx: number; scene?: string; error: string }[] = [];
  for (let i = 0; i < opts.prompts.length; i++) {
    const p = opts.prompts[i];
    const promptForApi =
      p.promptEn + (opts.negativeEn ? `\n\nNegative: ${opts.negativeEn}` : '');
    try {
      const ir = await runImageGenerate({
        prompt: promptForApi,
        size: opts.size,
        ...(opts.quality !== undefined ? { quality: opts.quality } : {}),
        n: 1,
        extra: { sceneTag: p.scene },
      });
      if (ir.ok && ir.savedUrls.length > 0) {
        const url = ir.savedUrls[0];
        const fileName = url.split('/').pop() || '';
        let assetId: string | undefined;
        try {
          const a = await prisma.asset.create({
            data: {
              type: opts.platform === 'xianyu' ? '商品首图' : '封面图',
              source: 'ai_generated',
              platform: opts.platform ?? null,
              category: opts.category ?? null,
              url,
              prompt: p.promptEn,
              fileName,
            },
          });
          assetId = a.id;
        } catch {
          // 忽略落库失败，仍把 url 返回给前端
        }
        assets.push({ id: assetId, url, scene: p.scene });
      } else {
        const errMsg = ir.error || '图片生成失败';
        assets.push({ scene: p.scene, error: errMsg, trace: ir.trace ?? null });
        errors.push({ idx: i, scene: p.scene, error: errMsg });
      }
    } catch (e) {
      const errMsg = (e as Error).message || '未知错误';
      assets.push({ scene: p.scene, error: errMsg });
      errors.push({ idx: i, scene: p.scene, error: errMsg });
    }
  }
  return { assets, errors };
}

async function persistContentAndStyle(args: {
  body: BuildBody;
  content: any;
  stylePrompt: StylePrompt;
  contentModel?: string;
  styleModel?: string;
}) {
  const tasks: Promise<any>[] = [];
  tasks.push(
    prisma.aIOutput.create({
      data: {
        type: 'text',
        input: JSON.stringify({
          via: 'publish-director',
          platform: args.body.platform,
          category: args.body.category,
          contentType: args.body.contentType,
          topic: args.body.topic,
        }),
        output: JSON.stringify(args.content ?? {}),
        model: args.contentModel ?? 'unknown',
      },
    }),
  );
  tasks.push(
    prisma.aIOutput.create({
      data: {
        type: 'image_prompt',
        input: JSON.stringify({
          via: 'publish-director',
          platform: args.body.platform,
          contentSummary: typeof args.content?.title === 'string'
            ? args.content.title
            : Array.isArray(args.content?.titles) ? args.content.titles[0] : '',
          imageOptions: args.body.imageOptions ?? null,
        }),
        output: JSON.stringify(args.stylePrompt),
        model: args.styleModel ?? 'unknown',
      },
    }),
  );
  if (args.body.platform === 'xiaohongshu') {
    const c = args.content ?? {};
    const titles: string[] = Array.isArray(c.titles) ? c.titles : [];
    tasks.push(
      prisma.post.create({
        data: {
          taskId: args.body.taskId || undefined,
          platform: 'xiaohongshu',
          title: titles[0] || args.body.topic || '',
          body: c.body ?? '',
          tags: Array.isArray(c.tags) ? c.tags.join(',') : '',
          coverText: c.coverText ?? '',
          cta: c.cta ?? '',
          status: 'draft',
        },
      }),
    );
  } else if (args.body.platform === 'xianyu') {
    const c = args.content ?? {};
    tasks.push(
      prisma.product.create({
        data: {
          taskId: args.body.taskId || undefined,
          title: c.title ?? args.body.topic ?? '',
          description: c.description ?? '',
          coverText: c.coverText ?? '',
          priceTier: Array.isArray(c.tiers)
            ? c.tiers.map((t: any) => `${t.tier}:${t.priceRange ?? ''}`).join(' / ')
            : '',
          deliveryScope: c.deliveryScope ?? '',
          revisionRule: c.revisionRule ?? '',
          status: 'draft',
        },
      }),
    );
  }
  return Promise.allSettled(tasks);
}

/**
 * v0.9 b3：成功后反写 task。
 *   - status = 'generated'
 *   - title = titles[0]/title
 *   - body = body / description
 *   - coverText = coverText
 *   - imageUrl = 第一张成功的 asset.url（如有）
 * 失败容忍：内部 try/catch，错误返回字符串便于响应记录。
 */
async function writeBackTask(opts: {
  taskId: string;
  platform?: Platform;
  content: any;
  firstImageUrl?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const c = opts.content ?? {};
    let title = '';
    let body = '';
    let coverText = '';
    if (opts.platform === 'xiaohongshu') {
      const titles: string[] = Array.isArray(c.titles) ? c.titles : [];
      title = (titles[0] || '').toString();
      body = (c.body || '').toString();
      coverText = (c.coverText || '').toString();
    } else {
      title = (c.title || '').toString();
      body = (c.description || '').toString();
      coverText = (c.coverText || '').toString();
    }
    const data: Record<string, any> = { status: 'generated' };
    if (title) data.title = title;
    if (body) data.body = body;
    if (coverText) data.coverText = coverText;
    if (opts.firstImageUrl) data.imageUrl = opts.firstImageUrl;
    await prisma.task.update({ where: { id: opts.taskId }, data });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'task.update failed' };
  }
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const styleAgent = findAgent('photo-director');
    const directorAgent = findAgent('publish-director');
    if (!styleAgent || !directorAgent) {
      return NextResponse.json({ ok: false, error: 'agent unavailable' }, { status: 500 });
    }

    const body = (await req.json()) as BuildBody;
    if (!body.platform || !['xiaohongshu', 'xianyu'].includes(body.platform)) {
      return NextResponse.json({ ok: false, error: '平台不正确（xiaohongshu/xianyu）' }, { status: 400 });
    }
    const regenerate: Regenerate = body.regenerate || 'all';

    // imageOptions 合并 + preset 注入
    const rawOpts: ImageOptions = body.imageOptions ?? {};
    const opts = await mergePresetIntoOptions(rawOpts);
    const autoImage =
      typeof opts.autoImage === 'boolean'
        ? opts.autoImage
        : body.autoImage !== false; // 缺省 true（向后兼容）
    const n = clampN(opts.n, 1);
    const wantSeries = n >= 2 && opts.sameStyle !== false && opts.asSeries !== false;

    let content: any = body.cachedContent ?? null;
    let contentModel: string | undefined;
    let stylePrompt: StylePrompt | null = body.cachedStylePrompt
      ? {
          styleSummary: body.cachedStylePrompt.styleSummary || '',
          promptEn: body.cachedStylePrompt.promptEn || '',
          negativeEn: body.cachedStylePrompt.negativeEn || '',
          recommendedSize: body.cachedStylePrompt.recommendedSize || defaultSize(body.platform, body.contentType),
          seriesPrompts: Array.isArray(body.cachedStylePrompt.seriesPrompts)
            ? body.cachedStylePrompt.seriesPrompts
                .filter((x): x is SeriesItem => !!x && typeof x.promptEn === 'string')
                .map((x) => ({ scene: x.scene, promptEn: x.promptEn }))
            : undefined,
          seriesPlan: body.cachedStylePrompt.seriesPlan,
        }
      : null;
    let styleModel: string | undefined;
    let stylePromptError: string | null = null;
    let stylePromptRaw: string | undefined;
    let assets: AssetEntry[] = [];
    let imageErrors: { idx: number; scene?: string; error: string }[] = [];
    let imageTrace: any = null;
    let imageFallbackNote: string | null = null;

    // ─────────────── step 1: 文案 ───────────────
    if (regenerate === 'all' || regenerate === 'content' || !content) {
      const keywords = await prisma.keyword.findMany({
        where: { category: body.category || 'Logo', platform: body.platform },
      });
      const pricePackages = await prisma.pricePackage.findMany({
        where: { category: body.category || 'Logo' },
      });
      // v0.9.2 b1：async builder 接通 /prompts 模板编辑器
      const messages = await buildContentMessagesAsync({
        platform: body.platform,
        category: body.category || 'Logo',
        contentType: body.contentType || '案例型',
        audience: body.audience,
        tone: body.tone,
        topic: body.topic,
        keywords: keywords.map((k) => k.keyword),
        pricePackages: pricePackages.map((p) => ({
          tier: p.tier,
          name: p.name,
          priceRange: p.priceRange,
        })),
      });
      const r = await generateText({
        messages,
        responseFormat: 'json',
        temperature: 0.8,
      });
      contentModel = r.model;
      if (!r.ok) {
        return NextResponse.json(
          {
            ok: false,
            stage: 'content',
            error: r.error || '文案 LLM 失败',
            model: r.model,
            durationMs: Date.now() - t0,
          },
          { status: 500 },
        );
      }
      const parsed = extractJSON<any>(r.content);
      if (!parsed) {
        return NextResponse.json(
          {
            ok: false,
            stage: 'content',
            error: '文案 LLM 输出不是合法 JSON',
            raw: r.content,
            model: r.model,
            durationMs: Date.now() - t0,
          },
          { status: 500 },
        );
      }
      content = parsed;
    }

    if (regenerate === 'content') {
      return NextResponse.json({
        ok: true,
        stage: 'content',
        content,
        stylePrompt: null,
        assets: [],
        asset: null,
        contentModel,
        durationMs: Date.now() - t0,
      });
    }

    // ─────────────── step 2: image prompt ───────────────
    if (
      regenerate === 'all' ||
      regenerate === 'style' ||
      !stylePrompt ||
      (!stylePrompt.promptEn && !stylePrompt.seriesPrompts)
    ) {
      const sr = await runStyleStep(styleAgent.systemPrompt, content, body, opts);
      if (sr.ok) {
        stylePrompt = sr.result;
        styleModel = sr.model;
      } else {
        stylePromptError = sr.error;
        styleModel = sr.model;
        stylePromptRaw = sr.raw;
        stylePrompt = null;
      }
    }

    // 如果用户预设里指定了 size，覆盖 LLM 推断的 size
    if (stylePrompt && opts._presetSize) {
      stylePrompt.recommendedSize = opts._presetSize;
    }

    if (regenerate === 'style') {
      return NextResponse.json({
        ok: true,
        stage: 'style',
        content,
        stylePrompt,
        stylePromptError,
        stylePromptRaw,
        assets: [],
        asset: null,
        contentModel,
        styleModel,
        durationMs: Date.now() - t0,
      });
    }

    // ─────────────── step 3: image（N 张串行） ───────────────
    if (
      autoImage &&
      stylePrompt &&
      (regenerate === 'all' || regenerate === 'image')
    ) {
      // 构造 N 条 prompt
      const prompts: { promptEn: string; scene?: string }[] = [];
      if (wantSeries && stylePrompt.seriesPrompts && stylePrompt.seriesPrompts.length > 0) {
        // 系列模式正常路径：取前 n 条；不足则末位重复（不应该发生）
        for (let i = 0; i < n; i++) {
          const item = stylePrompt.seriesPrompts[i] || stylePrompt.seriesPrompts[stylePrompt.seriesPrompts.length - 1];
          prompts.push({ promptEn: item.promptEn, scene: item.scene });
        }
      } else if (wantSeries && (!stylePrompt.seriesPrompts || stylePrompt.seriesPrompts.length === 0)) {
        // 降级：用户要系列但 LLM 没给 series → 用同一 promptEn N 次
        imageFallbackNote = '系列模式 LLM 未返回 seriesPrompts[]，已降级为 N 次同 promptEn';
        const fallback = stylePrompt.promptEn || '';
        if (!fallback) {
          // 没 promptEn 也没 seriesPrompts，直接跳出 step3
          imageErrors.push({ idx: 0, error: 'LLM 既未返回 seriesPrompts[] 也未返回 promptEn' });
        } else {
          for (let i = 0; i < n; i++) prompts.push({ promptEn: fallback });
        }
      } else {
        // 单图或同 prompt
        const single = stylePrompt.promptEn || '';
        if (single) {
          for (let i = 0; i < n; i++) prompts.push({ promptEn: single });
        }
      }

      if (prompts.length > 0) {
        // v0.11 B7：用户在 imageOptions 选了 size 时优先用户；否则用 stylePrompt.recommendedSize
        const finalSize: string = (typeof opts.size === 'string' && opts.size.trim())
          ? opts.size.trim()
          : stylePrompt.recommendedSize;
        const finalQuality: string | undefined =
          typeof opts.quality === 'string' && opts.quality.trim()
            ? opts.quality.trim()
            : undefined;
        const r = await runImagesSerial({
          prompts,
          negativeEn: stylePrompt.negativeEn,
          size: finalSize,
          ...(finalQuality !== undefined ? { quality: finalQuality } : {}),
          platform: body.platform,
          category: body.category ?? null,
        });
        assets = r.assets;
        imageErrors = imageErrors.concat(r.errors);
        // 取第一张失败的 trace 作为整体 imageTrace（前端展示用）
        const firstErr = assets.find((a) => a.error && a.trace);
        if (firstErr) imageTrace = firstErr.trace;
      }
    }

    // ─────────────── 落库 ───────────────
    if (
      regenerate === 'all' &&
      content &&
      stylePrompt &&
      !stylePromptError
    ) {
      // 文案 + style + post/product 落一份；asset 已在 runImagesSerial 内逐张落
      await persistContentAndStyle({
        body,
        content,
        stylePrompt,
        contentModel,
        styleModel,
      });
    } else if (regenerate === 'image' && stylePrompt && assets.some((a) => a.url)) {
      // image 重生时只补 image_prompt AIOutput（不重落 Post）
      try {
        await prisma.aIOutput.create({
          data: {
            type: 'image_prompt',
            input: JSON.stringify({
              via: 'publish-director:image',
              platform: body.platform,
              imageOptions: body.imageOptions ?? null,
            }),
            output: JSON.stringify(stylePrompt),
            model: styleModel ?? 'unknown',
          },
        });
      } catch {
        // 忽略
      }
    }

    // 兼容字段：asset = 第一张成功的 url
    const firstOk = assets.find((a) => a.url);
    const legacyAsset = firstOk ? { id: firstOk.id, url: firstOk.url } : null;

    // v0.9 b3：若关联了 task 且全链成功，反写 task
    let taskUpdateError: string | null = null;
    let taskUpdated = false;
    if (
      body.taskId &&
      regenerate === 'all' &&
      content &&
      stylePrompt &&
      !stylePromptError
    ) {
      const wb = await writeBackTask({
        taskId: body.taskId,
        platform: body.platform,
        content,
        firstImageUrl: firstOk?.url,
      });
      if (wb.ok) taskUpdated = true;
      else taskUpdateError = wb.error;
    }

    return NextResponse.json({
      ok: true,
      stage: regenerate,
      content,
      stylePrompt,
      stylePromptError,
      stylePromptRaw,
      assets,
      asset: legacyAsset,
      imageErrors,
      imageTrace,
      imageFallbackNote,
      contentModel,
      styleModel,
      taskId: body.taskId ?? null,
      taskUpdated,
      taskUpdateError,
      durationMs: Date.now() - t0,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: (err as Error).message || 'unknown error',
        durationMs: Date.now() - t0,
      },
      { status: 500 },
    );
  }
}
