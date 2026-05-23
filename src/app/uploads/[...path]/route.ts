/**
 * /uploads/[...path]
 *
 * 修复 BUG：Next.js standalone 启动时把 public/ 目录树缓存了一份。
 * 容器运行时 image-runner 写入 public/uploads/ 的新文件不会被
 * 静态托管识别（永远 404）。这个 catch-all 路由直接从磁盘读取
 * public/uploads/* 并以正确的 Content-Type 返回，绕过缓存。
 *
 * 老文件（容器启动前已存在）也走这条路径，行为一致。
 */
import { NextRequest } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPLOAD_ROOT = path.join(process.cwd(), 'public', 'uploads');

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  // 拒绝路径穿越
  const segs = params.path || [];
  const rel = segs.join('/');
  const abs = path.resolve(UPLOAD_ROOT, rel);
  if (!abs.startsWith(UPLOAD_ROOT + path.sep) && abs !== UPLOAD_ROOT) {
    return new Response('Forbidden', { status: 403 });
  }

  let buf: Buffer;
  try {
    buf = await fs.readFile(abs);
  } catch {
    return new Response('Not Found', { status: 404 });
  }

  const ext = path.extname(abs).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  // 用 Blob 包一层即可绕过 NextResponse / Buffer 的 BodyInit 类型问题
  // Blob 接受 ArrayBuffer / Uint8Array / string，是最稳定的 BodyInit
  const blob = new Blob([new Uint8Array(buf).buffer as ArrayBuffer], {
    type: contentType,
  });

  return new Response(blob, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buf.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
