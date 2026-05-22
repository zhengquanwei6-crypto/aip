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

/** 把远程 URL 下载并保存到本地，返回新的 /uploads/xxx 路径 */
export async function saveImageFromUrl(remoteUrl: string): Promise<SavedFile> {
  await ensureDir(UPLOAD_ROOT);
  const res = await fetch(remoteUrl);
  if (!res.ok) {
    throw new Error(`下载图片失败: ${res.status}`);
  }
  const ct = res.headers.get('content-type');
  const ext = detectExtFromContentType(ct);
  const fileName = randomName(ext);
  const buf = Buffer.from(await res.arrayBuffer());
  const absPath = path.join(UPLOAD_ROOT, fileName);
  await fs.writeFile(absPath, buf);
  return { url: `/uploads/${fileName}`, fileName, absPath };
}

/** 把 base64 字符串保存为图片文件 */
export async function saveImageFromBase64(
  b64: string,
  ext = 'png',
): Promise<SavedFile> {
  await ensureDir(UPLOAD_ROOT);
  const fileName = randomName(ext);
  const buf = Buffer.from(b64, 'base64');
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
