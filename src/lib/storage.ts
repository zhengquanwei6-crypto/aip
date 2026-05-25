/**
 * 本地图片存储工具：把远程 URL / base64 图片保存到 public/uploads/
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const UPLOAD_ROOT = path.join(process.cwd(), 'public', 'uploads');

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

function randomName(ext = 'png') {
  const id = crypto.randomBytes(8).toString('hex');
  return `${Date.now()}_${id}.${ext}`;
}

function detectExtFromContentType(ct: string | null): string {
  if (!ct) return 'png';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('gif')) return 'gif';
  return 'png';
}

export interface SavedFile {
  url: string; // /uploads/xxx.png
  fileName: string;
  absPath: string;
}

/** 把远程 URL 下载并保存到本地，返回新的 /uploads/xxx 路径
 *  v0.13 BUG-M27: 加超时 / UA / 1 次自动重试，并把失败原因抛清楚。
 */
export async function saveImageFromUrl(remoteUrl: string): Promise<SavedFile> {
  await ensureDir(UPLOAD_ROOT);

  // 仅允许 http(s)；防止把 data:/file:/javascript: 等送进来导致 fetch 报错
  if (!/^https?:\/\//i.test(remoteUrl)) {
    throw new Error(`URL scheme 不支持（仅 http/https）: ${remoteUrl.slice(0, 80)}`);
  }

  const FETCH_TIMEOUT_MS = 30_000;
  const UA = 'design-ai-ops/0.13 (+saveImageFromUrl)';

  async function tryOnce(): Promise<{ buf: Buffer; ct: string | null }> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(remoteUrl, {
        signal: ac.signal,
        headers: { 'User-Agent': UA, 'Accept': 'image/*,*/*;q=0.8' },
        redirect: 'follow',
      });
      if (!res.ok) {
        throw new Error(`下载图片 HTTP ${res.status} ${res.statusText || ''}`.trim());
      }
      const ct = res.headers.get('content-type');
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength === 0) {
        throw new Error('下载图片字节数为 0');
      }
      return { buf, ct };
    } finally {
      clearTimeout(timer);
    }
  }

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { buf, ct } = await tryOnce();
      const ext = detectExtFromContentType(ct);
      const fileName = randomName(ext);
      const absPath = path.join(UPLOAD_ROOT, fileName);
      await fs.writeFile(absPath, buf);
      return { url: `/uploads/${fileName}`, fileName, absPath };
    } catch (e) {
      lastErr = e;
      if (attempt === 0) {
        // 退避 800ms 再重试一次
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`saveImageFromUrl 失败（重试 1 次后仍失败）: ${msg}`);
}

/** 把 base64 字符串保存为图片文件
 *  v0.13 BUG-M27: 兼容含换行/空格的 base64 串。
 */
export async function saveImageFromBase64(
  b64: string,
  ext = 'png',
): Promise<SavedFile> {
  await ensureDir(UPLOAD_ROOT);
  const cleaned = (b64 || '').replace(/\s+/g, '');
  if (!cleaned) {
    throw new Error('saveImageFromBase64: 空 base64');
  }
  const buf = Buffer.from(cleaned, 'base64');
  if (buf.byteLength === 0) {
    throw new Error('saveImageFromBase64: 解码后字节数为 0（base64 串可能损坏）');
  }
  const fileName = randomName(ext);
  const absPath = path.join(UPLOAD_ROOT, fileName);
  await fs.writeFile(absPath, buf);
  return { url: `/uploads/${fileName}`, fileName, absPath };
}

/** 把上传的浏览器 File 数据保存到 public/uploads */
export async function saveUploadedFile(
  buffer: Buffer,
  originalName: string,
): Promise<SavedFile> {
  await ensureDir(UPLOAD_ROOT);
  const ext = (originalName.split('.').pop() || 'png').toLowerCase().slice(0, 5);
  const fileName = randomName(ext);
  const absPath = path.join(UPLOAD_ROOT, fileName);
  await fs.writeFile(absPath, buffer);
  return { url: `/uploads/${fileName}`, fileName, absPath };
}

/** 删除本地文件，忽略错误 */
export async function deleteLocalFile(urlPath: string): Promise<void> {
  if (!urlPath || !urlPath.startsWith('/uploads/')) return;
  const fileName = urlPath.replace('/uploads/', '');
  const absPath = path.join(UPLOAD_ROOT, fileName);
  try {
    await fs.unlink(absPath);
  } catch {
    /* ignore */
  }
}
