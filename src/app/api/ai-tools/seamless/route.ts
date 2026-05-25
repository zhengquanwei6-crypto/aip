/**
 * v0.13 B4 · POST /api/ai-tools/seamless
 *
 * Body (multipart/form-data):
 *   file:            原图（PNG / JPG / WebP 等 jimp 可读的格式）
 *   featherPercent:  羽化百分比（0–30，默认 5）
 *   sourceAssetId?:  若提供，复用已有 Asset.url 直接读盘（不重新存原图）
 *
 * Returns:
 *   { ok:true,
 *     original:  { id, url, width, height, bytes },   // 仅 file 上传时返回
 *     seamless:  { id, url, width, height, bytes, featherPx },
 *     durationMs }
 *
 * 0 LLM/IMAGE token · 0 schema 改 · 沿用 Asset 表（source=manual_upload, type=AI 无缝纹理）
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { saveUploadedFile } from '@/lib/storage';
import { makeSeamless } from '@/lib/image-seamless';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const UPLOAD_ROOT = path.join(process.cwd(), 'public', 'uploads');

function clampPercent(v: unknown, fallback = 5): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 30) return 30;
  return Math.round(n * 10) / 10;
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const form = await req.formData();
    const featherPercent = clampPercent(form.get('featherPercent'), 5);
    const sourceAssetId = (form.get('sourceAssetId') as string | null) || null;

    let originalAbsPath: string;
    let originalRecord: {
      id: string;
      url: string;
      width: number;
      height: number;
      bytes: number;
    } | null = null;

    if (sourceAssetId) {
      // 复用已有 asset
      const a = await prisma.asset.findUnique({ where: { id: sourceAssetId } });
      if (!a || !a.url || !a.url.startsWith('/uploads/')) {
        return NextResponse.json(
          { ok: false, error: '指定的 sourceAssetId 不存在或非 /uploads 资源' },
          { status: 400 },
        );
      }
      const fn = a.url.replace('/uploads/', '');
      if (fn.includes('..') || fn.includes('/') || fn.includes('\\')) {
        return NextResponse.json({ ok: false, error: '非法 fileName' }, { status: 400 });
      }
      originalAbsPath = path.join(UPLOAD_ROOT, fn);
    } else {
      // 上传新文件
      const file = form.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json(
          { ok: false, error: '未上传文件 (字段 file 为空)' },
          { status: 400 },
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const saved = await saveUploadedFile(buffer, file.name);
      const a = await prisma.asset.create({
        data: {
          type: 'AI 无缝原图',
          source: 'manual_upload',
          url: saved.url,
          fileName: saved.fileName,
        },
      });
      originalAbsPath = saved.absPath;
      originalRecord = {
        id: a.id,
        url: a.url,
        width: 0,
        height: 0,
        bytes: buffer.byteLength,
      };
    }

    // 跑无缝
    let seamless;
    try {
      seamless = await makeSeamless(originalAbsPath, featherPercent);
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: '无缝处理失败：' + (e as Error).message },
        { status: 500 },
      );
    }

    if (originalRecord) {
      originalRecord.width = seamless.width;
      originalRecord.height = seamless.height;
    }

    // 把无缝结果也入 Asset 表
    const seamlessAsset = await prisma.asset.create({
      data: {
        type: 'AI 无缝纹理',
        source: 'manual_upload',
        url: seamless.url,
        fileName: seamless.fileName,
      },
    });

    return NextResponse.json({
      ok: true,
      original: originalRecord,
      seamless: {
        id: seamlessAsset.id,
        url: seamless.url,
        width: seamless.width,
        height: seamless.height,
        bytes: seamless.bytes,
        featherPx: seamless.featherPx,
        featherPercent,
      },
      durationMs: Date.now() - t0,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message || '未知错误' },
      { status: 500 },
    );
  }
}
