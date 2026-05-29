/**
 * /api/agents/publish-director/build · v0.9 b3 (+ v0.9.2 b1 async builders + v0.11 B7 size/quality + B9 i2i/aspectRatio)
 *
 * v0.11 B9（图生图 + 比例预设）：
 *   - imageOptions 新增 mode? sourceImageUrl? sourceImageBase64? aspectRatio?
 *   - step3 调 runImageGenerate 时透传：mode/sourceImageUrl/sourceImageBase64/aspectRatio
 *   - 系列模式（n≥2 + sameStyle + asSeries）i2i 仅对**第一张**应用源图；后续仍按系列 promptEn 但 mode='i2i' 共享同源图
 *   - i2i + ImagePreset.size 冲突：用户在 imageOptions.size / aspectRatio 选了具体值时**优先于** preset/style.recommendedSize
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { findAgent } from '@/lib/agent-types';
import { getEffectiveAgentSystemPrompt } from '@/lib/agents/system-prompt';
import { generateText, extractJSON, type ChatMessage } from '@/lib/ai/text';
import { injectGenomeIntoMessages } from '@/lib/style-genome/inject';
import { buildContentMessagesAsync } from '@/lib/ai/prompts';
import { runImageGenerate, type ImageMode } from '@/lib/image-runner';
import { searchHistory } from '@/lib/vector';

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
  /** v0.11 B7 */
  size?: string;
  quality?: string;
  /** v0.11 B9 */
  aspectRatio?: string;
  mode?: ImageMode;
  sourceImageUrl?: string;
  sourceImageBase64?: string;
}

interface BuildBody {
  platform?: Platform;
  category?: string;
  contentType?: string;
  topic?: string;
  audience?: string;
  tone?: string;
  autoImage?: boolean;
  imageOptions?: ImageOptions;
  regenerate?: Regenerate;
  taskId?: string;
  cachedContent?: any;
  cachedStylePrompt?: {
    styleSummary?: string;
    promptEn?: string;
    negativeEn?: string;
    recommendedSize?: SizeStr;
    seriesPrompts?: { scene?: string; promptEn?: string }[];
    seriesPlan?: string;
  };
  styleSummaryHint?: string;
}

interface SeriesItem {
  scene?: string;
  promptEn: string;
}

interface StylePrompt {
  styleSummary: string;
  promptEn: string;
  negativeEn: string;
  recommendedSize: SizeStr;
  tips?: string[];
  seriesPrompts?: SeriesItem[];
  seriesPlan?: string;
}

interface AssetEntry {
  id?: string;
  url?: string;
  scene?: string;
  error?: string;
  trace?: any;
}

const VALID_SIZES: SizeStr[] = ['1024x1024', '1024x1536', '1536x1024'];
const MAX_BASE64_BYTES = 5 * 1024 * 1024 * 4 / 3;

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

function readMode(v: unknown): ImageMode {
  return v === 'i2i' ? 'i2i' : 't2i';
}

async function mergePresetIntoOptions(opts: ImageOptions | undefined): Promise<ImageOptions & { _presetSize?: SizeStr }> {
  const base: ImageOptions & { _presetSize?: SizeStr } = { ...(opts ?? {}) };
  if (!base.stylePresetId) return base;
  try {
    const preset = await prisma.imagePreset.findUnique({ where: { id: base.stylePresetId } });
    if (!preset) return base;
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
    /* ignore */
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

  const imgLines: string[] = [];
  if (opts.styleKeywords) imgLines.push(`styleKeywords: ${opts.styleKeywords}`);
  if (opts.negativePrompt) imgLines.push(`negativePrompt: ${opts.negativePrompt}`);
  if (opts.primaryColor) imgLines.push(`primaryColor: ${opts.primaryColor}`);
  if (opts.accentColor) imgLines.push(`accentColor: ${opts.accentColor}`);
  imgLines.push(`textLanguage: ${opts.textLanguage || 'en'}`);
  if (opts.size) imgLines.push(`size(用户从 adapter 池选): ${opts.size}`);
  if (opts.quality) imgLines.push(`quality(用户从 adapter 池选): ${opts.quality}`);
  if (opts.aspectRatio) imgLines.push(`aspectRatio(用户从 adapter 池选): ${opts.aspectRatio}`);
  if (opts.mode === 'i2i') imgLines.push(`mode: i2i（请把 promptEn 写成"基于源图改..."的指令）`);
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
    maxTokens: wantSeries ? 1600 : 700,
    responseFormat: 'json',
  });
  if (!r.ok) return { ok: false, error: r.error || 'style LLM 调用失败', model: r.model };

  const parsed = extractJSON<any>(r.content);
  if (!parsed) {
    return { ok: false, error: 'style LLM 输出不是合法 JSON', model: r.model, raw: r.content };
  }

  const styleSummary =
    typeof parsed.styleSummary === 'string' && parsed.styleSummary.trim()
      ? parsed.styleSummary
      : '';

  const negativeEn =
    typeof parsed.negativeEn === 'string' && parsed.negativeEn.trim()
      ? parsed.negativeEn
      : 'low quality, blurry, watermark, text artifacts, cluttered, distorted';

  let size: SizeStr = defaultSize(body.platform, body.contentType);
  if (typeof parsed.recommendedSize === 'string' && (VALID_SIZES as string[]).includes(parsed.recommendedSize)) {
    size = parsed.recommendedSize as SizeStr;
  }

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

  let promptEn = '';
  if (typeof parsed.promptEn === 'string' && parsed.promptEn.trim()) {
    promptEn = parsed.promptEn;
  } else if (seriesPrompts && seriesPrompts.length > 0) {
    promptEn = seriesPrompts[0].promptEn;
  }

  if (!wantSeries && (!promptEn || !styleSummary)) {
    return {
      ok: false,
      error: 'style LLM 输出缺失 promptEn 或 styleSummary',
      model: r.model,
      raw: r.content,
    };
  }
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
 * v0.11 B9：runImagesSerial 透传 mode + sourceImageUrl + sourceImageBase64 + aspectRatio
 */
async function runImagesSerial(opts: {
  prompts: { promptEn: string; scene?: string }[];
  negativeEn: string;
  size: string;
  quality?: string;
  aspectRatio?: string;
  mode?: ImageMode;
  sourceImageUrl?: string;
  sourceImageBase64?: string;
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
        ...(opts.aspectRatio !== undefined ? { aspectRatio: opts.aspectRatio } : {}),
        n: 1,
        ...(opts.mode === 'i2i' ? {
          mode: 'i2i' as const,
          ...(opts.sourceImageUrl ? { sourceImageUrl: opts.sourceImageUrl } : {}),
          ...(opts.sourceImageBase64 ? { sourceImageBase64: opts.sourceImageBase64 } : {}),
        } : {}),
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
          /* ignore */
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
          imageOptions: redactImageOptionsForLog(args.body.imageOptions),
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

/** v0.11 B9：图片选项落库时把 sourceImageBase64 替换成长度（避免 AIOutput 表巨大） */
function redactImageOptionsForLog(io: ImageOptions | null | undefined): any {
  if (!io) return null;
  const out: any = { ...io };
  if (typeof io.sourceImageBase64 === 'string') {
    delete out.sourceImageBase64;
    out.sourceImageBase64Len = io.sourceImageBase64.length;
  }
  if (typeof io.sourceImageUrl === 'string') {
    out.sourceImageUrl = io.sourceImageUrl.slice(0, 200);
  }
  return out;
}

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
    // v0.12 B2：解析 effective systemPrompt（Setting `prompt:agent:photo-director:system` 覆盖优先）
    const effectiveStyleSystemPrompt = await getEffectiveAgentSystemPrompt(
      styleAgent.slug,
      styleAgent.systemPrompt,
    );

    const body = (await req.json()) as BuildBody;
    if (!body.platform || !['xiaohongshu', 'xianyu'].includes(body.platform)) {
      return NextResponse.json({ ok: false, error: '平台不正确（xiaohongshu/xianyu）' }, { status: 400 });
    }
    const regenerate: Regenerate = body.regenerate || 'all';

    const rawOpts: ImageOptions = body.imageOptions ?? {};
    const opts = await mergePresetIntoOptions(rawOpts);
    const autoImage =
      typeof opts.autoImage === 'boolean'
        ? opts.autoImage
        : body.autoImage !== false;
    const n = clampN(opts.n, 1);
    const wantSeries = n >= 2 && opts.sameStyle !== false && opts.asSeries !== false;
    const mode = readMode(opts.mode);

    // i2i 校验（autoImage 才校；不开自动出图也允许传，方便前端预填）
    if (autoImage && mode === 'i2i') {
      if (!opts.sourceImageUrl && !opts.sourceImageBase64) {
        return NextResponse.json(
          { ok: false, error: 'i2i 模式需在 imageOptions 提供 sourceImageUrl 或 sourceImageBase64' },
          { status: 400 },
        );
      }
      if (opts.sourceImageBase64 && opts.sourceImageBase64.length > MAX_BASE64_BYTES) {
        return NextResponse.json(
          { ok: false, error: '源图过大（>5MB）' },
          { status: 413 },
        );
      }
    }

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

    // v0.15-c RAG 召回（在 step1 之前外层声明，便于早期 return 也能用）
    let ragRecalled: any[] = [];
    let ragQuery = '';
    try {
      if ((body as any).useRAG !== false) {
        ragQuery = [body.topic || '', body.audience || '', body.tone || '']
          .filter(Boolean)
          .join(' ')
          .slice(0, 200);
        if (ragQuery) {
          const hits = await searchHistory(ragQuery, { topK: 6, filter: 'type == "platform-build"' });
          ragRecalled = hits.filter((h: any) => h.score >= 0.65).slice(0, 3);
        }
      }
    } catch (e) {
      console.warn('[v015-c rag/recall]', (e as Error).message);
    }

    // step 1: 文案
    if (regenerate === 'all' || regenerate === 'content' || !content) {
      const keywords = await prisma.keyword.findMany({
        where: { category: body.category || 'Logo', platform: body.platform },
      });
      const pricePackages = await prisma.pricePackage.findMany({
        where: { category: body.category || 'Logo' },
      });
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
      // v0.15-c RAG: 注入历史参考到 messages（system 优先）
      if (ragRecalled.length > 0) {
        const refText = ragRecalled
          .map((h: any, i: number) => `[${i + 1}] (相似度 ${(h.score * 100).toFixed(0)}%) ${String(h.text || '').slice(0, 250)}`)
          .join('\n\n');
        messages.unshift({
          role: 'system',
          content: `## 你过往做过的相似作品（参考语调与结构，不要照抄）：\n\n${refText}\n\n请在保持上述风格一致性的同时，输出与历史不同的新内容。`,
        });
      }

            // v0.16-H1 genome injection (soft, fail-silent)
      const __sg = await injectGenomeIntoMessages(messages as any, { skip: (body as any)?.useStyleGenome === false }).catch(() => ({ messages: messages as any[], applied: false }));
      const r = await generateText({
        messages: __sg.messages as any,
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
        ragInfo: {
          enabled: (body as any).useRAG !== false,
          recalled: ragRecalled.length,
          query: ragQuery,
          items: ragRecalled.map((h: any) => ({
            id: h.id,
            score: Number(h.score.toFixed(3)),
            preview: String(h.text || '').slice(0, 120),
          })),
        },
        stage: 'content',
        content,
        stylePrompt: null,
        assets: [],
        asset: null,
        contentModel,
        durationMs: Date.now() - t0,
      });
    }

    // step 2: image prompt
    if (
      regenerate === 'all' ||
      regenerate === 'style' ||
      !stylePrompt ||
      (!stylePrompt.promptEn && !stylePrompt.seriesPrompts)
    ) {
      const sr = await runStyleStep(effectiveStyleSystemPrompt, content, body, opts);
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

    if (stylePrompt && opts._presetSize) {
      stylePrompt.recommendedSize = opts._presetSize;
    }

    if (regenerate === 'style') {
      return NextResponse.json({
        ok: true,
        ragInfo: {
          enabled: (body as any).useRAG !== false,
          recalled: ragRecalled.length,
          query: ragQuery,
          items: ragRecalled.map((h: any) => ({
            id: h.id,
            score: Number(h.score.toFixed(3)),
            preview: String(h.text || '').slice(0, 120),
          })),
        },
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

    // step 3: image
    if (
      autoImage &&
      stylePrompt &&
      (regenerate === 'all' || regenerate === 'image')
    ) {
      const prompts: { promptEn: string; scene?: string }[] = [];
      if (wantSeries && stylePrompt.seriesPrompts && stylePrompt.seriesPrompts.length > 0) {
        for (let i = 0; i < n; i++) {
          const item = stylePrompt.seriesPrompts[i] || stylePrompt.seriesPrompts[stylePrompt.seriesPrompts.length - 1];
          prompts.push({ promptEn: item.promptEn, scene: item.scene });
        }
      } else if (wantSeries && (!stylePrompt.seriesPrompts || stylePrompt.seriesPrompts.length === 0)) {
        imageFallbackNote = '系列模式 LLM 未返回 seriesPrompts[]，已降级为 N 次同 promptEn';
        const fallback = stylePrompt.promptEn || '';
        if (!fallback) {
          imageErrors.push({ idx: 0, error: 'LLM 既未返回 seriesPrompts[] 也未返回 promptEn' });
        } else {
          for (let i = 0; i < n; i++) prompts.push({ promptEn: fallback });
        }
      } else {
        const single = stylePrompt.promptEn || '';
        if (single) {
          for (let i = 0; i < n; i++) prompts.push({ promptEn: single });
        }
      }

      if (prompts.length > 0) {
        const finalSize: string = (typeof opts.size === 'string' && opts.size.trim())
          ? opts.size.trim()
          : stylePrompt.recommendedSize;
        const finalQuality: string | undefined =
          typeof opts.quality === 'string' && opts.quality.trim()
            ? opts.quality.trim()
            : undefined;
        const finalAspect: string | undefined =
          typeof opts.aspectRatio === 'string' && opts.aspectRatio.trim()
            ? opts.aspectRatio.trim()
            : undefined;
        const r = await runImagesSerial({
          prompts,
          negativeEn: stylePrompt.negativeEn,
          size: finalSize,
          ...(finalQuality !== undefined ? { quality: finalQuality } : {}),
          ...(finalAspect !== undefined ? { aspectRatio: finalAspect } : {}),
          mode,
          ...(opts.sourceImageUrl ? { sourceImageUrl: opts.sourceImageUrl } : {}),
          ...(opts.sourceImageBase64 ? { sourceImageBase64: opts.sourceImageBase64 } : {}),
          platform: body.platform,
          category: body.category ?? null,
        });
        assets = r.assets;
        imageErrors = imageErrors.concat(r.errors);
        const firstErr = assets.find((a) => a.error && a.trace);
        if (firstErr) imageTrace = firstErr.trace;
      }
    }

    if (
      regenerate === 'all' &&
      content &&
      stylePrompt &&
      !stylePromptError
    ) {
      await persistContentAndStyle({
        body,
        content,
        stylePrompt,
        contentModel,
        styleModel,
      });
    } else if (regenerate === 'image' && stylePrompt && assets.some((a) => a.url)) {
      try {
        await prisma.aIOutput.create({
          data: {
            type: 'image_prompt',
            input: JSON.stringify({
              via: 'publish-director:image',
              platform: body.platform,
              imageOptions: redactImageOptionsForLog(body.imageOptions),
            }),
            output: JSON.stringify(stylePrompt),
            model: styleModel ?? 'unknown',
          },
        });
      } catch {
        /* ignore */
      }
    }

    const firstOk = assets.find((a) => a.url);
    const legacyAsset = firstOk ? { id: firstOk.id, url: firstOk.url } : null;

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
