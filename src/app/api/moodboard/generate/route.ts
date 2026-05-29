/**
 * v0.16-H4.1 · POST /api/moodboard/generate
 *
 * 入参: { theme, refCount?: 6|9|12, avoidGenome?: bool }
 *
 * 阶段 A: 向量召回 - searchAssets(theme) 取 topK
 * 阶段 B: extractFeature 抽每张图主色 (复用 H1)
 * 阶段 C: avoidGenome 模式 - 与当前 Genome 色板距离 < 30 ΔE 的降权
 * 阶段 D: groupByTone 分组 + jimp composite 排版
 * 阶段 E: 底部 5 色板条 + 写 AIOutput
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { searchAssets } from '@/lib/vector';
import { extractFeature, resolveAssetPath } from '@/lib/style-genome/extractor';
import { groupByTone, buildPalette, type MoodImage } from '@/lib/moodboard/cluster';
import { getCurrentGenome } from '@/lib/style-genome/inject';
import { hexToLab, paletteDistance } from '@/lib/critic/style-distance';
import Jimp from 'jimp';
import { promises as fs } from 'node:fs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const TILE_SIZE = 256;
const GAP = 12;

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const theme = String(body?.theme || '').trim();
    const refCount = [6, 9, 12].includes(Number(body?.refCount)) ? Number(body.refCount) : 9;
    const avoidGenome = body?.avoidGenome !== false;

    if (!theme) {
      return NextResponse.json({ ok: false, error: '请输入主题' }, { status: 400 });
    }
    if (theme.length > 200) {
      return NextResponse.json({ ok: false, error: '主题不能超过 200 字' }, { status: 400 });
    }

    const hits = await searchAssets(theme, { topK: refCount * 3 });
    if (hits.length === 0) {
      return NextResponse.json({
        ok: false,
        error: '向量库召回为空 (本地素材不够)',
        durationMs: Date.now() - t0,
      });
    }

    const assetIds = hits.map((h) => h.id);
    const rows = await prisma.asset.findMany({ where: { id: { in: assetIds } } });
    const byId = new Map(rows.map((r) => [r.id, r]));

    const moodImages: MoodImage[] = [];

    for (const h of hits) {
      const r = byId.get(h.id);
      if (!r) continue;
      const abs = resolveAssetPath(r.url);
      if (!abs) continue;
      try {
        await fs.access(abs);
        const f = await extractFeature(abs);
        const top = f.colors[0];
        if (top) {
          moodImages.push({
            id: r.id,
            url: r.url,
            dominantHex: top.hex,
            prompt: r.prompt ?? undefined,
          });
        }
      } catch (e) {
        console.warn('[moodboard/extract]', r.url, (e as Error).message);
      }
    }

    if (moodImages.length === 0) {
      return NextResponse.json({
        ok: false,
        error: '无法抽取主色',
        durationMs: Date.now() - t0,
      });
    }

    const genome = await getCurrentGenome();
    let scored = moodImages.map((img, i) => ({ img, score: hits[i]?.score ?? 0.5 }));
    if (avoidGenome && genome && genome.primaryPalette.length > 0) {
      scored = scored.map((s) => {
        const dist = paletteDistance([s.img.dominantHex], genome.primaryPalette);
        const penalty = Math.max(0, (30 - Math.min(dist, 30)) / 30) * 0.3;
        return { img: s.img, score: s.score - penalty };
      }).sort((a, b) => b.score - a.score);
    } else {
      scored.sort((a, b) => b.score - a.score);
    }

    const finalImages = scored.slice(0, refCount).map((s) => s.img);
    const palette = buildPalette(finalImages);
    const groups = groupByTone(finalImages);

    let outDataUrl: string | undefined;
    try {
      const cols = refCount === 6 ? 3 : refCount === 9 ? 3 : 4;
      const rows_ = Math.ceil(refCount / cols);
      const W = cols * TILE_SIZE + (cols + 1) * GAP;
      const H = rows_ * TILE_SIZE + (rows_ + 1) * GAP + 80;
      const board = await Jimp.create(W, H, 0xFAFAFAff);

      let placedImages: MoodImage[] = [];
      for (const g of groups) {
        const sorted = [...g.images].sort((a, b) => {
          const la = hexToLab(a.dominantHex);
          const lb = hexToLab(b.dominantHex);
          return (lb?.[0] ?? 0) - (la?.[0] ?? 0);
        });
        placedImages.push(...sorted);
      }
      placedImages = placedImages.slice(0, refCount);

      for (let i = 0; i < placedImages.length; i++) {
        const img = placedImages[i];
        const abs = resolveAssetPath(img.url);
        if (!abs) continue;
        try {
          const tile = await Jimp.read(abs);
          tile.cover(TILE_SIZE, TILE_SIZE);
          const r = Math.floor(i / cols);
          const c = i % cols;
          const x = GAP + c * (TILE_SIZE + GAP);
          const y = GAP + r * (TILE_SIZE + GAP);
          board.composite(tile, x, y);
        } catch (e) { /* skip */ }
      }

      const paletteWidth = (W - 2 * GAP) / Math.max(palette.length, 1);
      for (let i = 0; i < palette.length; i++) {
        const colorInt = (parseInt(palette[i].replace('#', ''), 16) << 8) | 0xff;
        const swatch = await Jimp.create(Math.floor(paletteWidth), 60, colorInt);
        board.composite(swatch, GAP + i * paletteWidth, H - 70);
      }

      const buf = await board.getBufferAsync(Jimp.MIME_PNG);
      outDataUrl = `data:image/png;base64,${buf.toString('base64')}`;
    } catch (e) {
      console.warn('[moodboard/composite]', (e as Error).message);
    }

    try {
      await prisma.aIOutput.create({
        data: {
          type: 'moodboard',
          input: JSON.stringify({ theme, refCount, avoidGenome, sampleCount: finalImages.length }),
          output: JSON.stringify({
            palette,
            groups: groups.map((g) => ({ tone: g.toneLabel, count: g.images.length, ids: g.images.map((i) => i.id) })),
          }),
          model: 'moodboard',
        },
      });
    } catch (e) { console.warn('[moodboard/persist]', (e as Error).message); }

    return NextResponse.json({
      ok: true,
      theme,
      images: finalImages,
      palette,
      groups: groups.map((g) => ({ tone: g.toneLabel, toneHex: g.toneHex, count: g.images.length })),
      composedDataUrl: outDataUrl,
      genomeAvoided: !!(avoidGenome && genome),
      durationMs: Date.now() - t0,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message, durationMs: Date.now() - t0 },
      { status: 500 },
    );
  }
}
