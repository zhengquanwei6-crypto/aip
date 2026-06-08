/**
 * POST /api/assets/from-output
 *
 * 把 AIOutput 或一次生成结果补录为 Asset。
 * 用途：历史输出、ComfyUI 结果、外部工具结果都能进入素材库，形成「输出 → 素材」闭环。
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function tryJson(input: unknown): any {
  if (typeof input !== 'string') return input ?? null;
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function collectUrls(input: unknown): string[] {
  const parsed = tryJson(input);
  const out = new Set<string>();
  const add = (v: unknown) => {
    const s = asString(v);
    if (s) out.add(s);
  };

  if (typeof input === 'string' && !parsed) add(input);
  if (!parsed) return Array.from(out);

  add(parsed.url);
  add(parsed.assetUrl);
  if (Array.isArray(parsed.urls)) parsed.urls.forEach(add);
  if (Array.isArray(parsed.images)) parsed.images.forEach((x: any) => add(x?.url ?? x));
  if (Array.isArray(parsed.assets)) parsed.assets.forEach((x: any) => add(x?.url ?? x?.assetUrl));
  if (parsed.asset) add(parsed.asset.url ?? parsed.asset.assetUrl);

  return Array.from(out);
}

function inferPrompt(input: unknown, fallback: string | null): string | null {
  const explicit = asString(fallback);
  if (explicit) return explicit;
  const parsed = tryJson(input);
  if (!parsed || typeof parsed !== 'object') return asString(input)?.slice(0, 1000) ?? null;
  return (
    asString(parsed.prompt) ??
    asString(parsed.topic) ??
    asString(parsed.title) ??
    asString(parsed.query) ??
    null
  );
}

function inferFileName(url: string): string | null {
  const clean = url.split('?')[0].split('#')[0];
  const name = clean.split('/').pop();
  return name && name.includes('.') ? name.slice(0, 180) : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const outputId = asString(body.outputId ?? body.aiOutputId);
    const selectedUrl = asString(body.url ?? body.assetUrl);

    let sourceInput: unknown = body.input ?? null;
    let sourceOutput: unknown = body.output ?? null;
    let model: string | null = asString(body.model);

    if (outputId) {
      const row = await prisma.aIOutput.findUnique({ where: { id: outputId } });
      if (!row) {
        return NextResponse.json({ ok: false, error: '找不到 AI 输出记录' }, { status: 404 });
      }
      sourceInput = row.input;
      sourceOutput = row.output;
      model = row.model ?? model;
    }

    const urls = [
      ...(selectedUrl ? [selectedUrl] : []),
      ...collectUrls(sourceOutput),
    ].filter((url, index, arr) => arr.indexOf(url) === index);

    if (urls.length === 0) {
      return NextResponse.json(
        { ok: false, error: '输出里没有可入库的图片 URL' },
        { status: 400 },
      );
    }

    const prompt = inferPrompt(sourceInput, body.prompt);
    const type = asString(body.type ?? body.imageType) ?? '封面图';
    const platform = asString(body.platform) ?? null;
    const category = asString(body.category) ?? null;
    const limit = Math.min(Math.max(Number(body.limit) || urls.length, 1), 20);

    const assets = [];
    for (const url of urls.slice(0, limit)) {
      const asset = await prisma.asset.create({
        data: {
          type,
          source: 'ai_generated',
          platform,
          category,
          url,
          prompt: prompt
            ? [prompt, outputId ? `sourceOutput:${outputId}` : null, model ? `model:${model}` : null]
                .filter(Boolean)
                .join('\n')
            : outputId
              ? `sourceOutput:${outputId}`
              : null,
          fileName: inferFileName(url),
        },
      });
      assets.push(asset);
    }

    return NextResponse.json({
      ok: true,
      asset: assets[0],
      assets,
      count: assets.length,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
