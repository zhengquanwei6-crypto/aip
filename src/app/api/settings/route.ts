/**
 * /api/settings - 应用配置
 *
 * v0.8 Batch 1（B1.7）：GET 字段脱敏
 *   - key 名包含 "KEY"（大小写不敏感）的字段，返回 { key, value: '', isSet, length }
 *   - 其他字段照旧返回 value
 *   - POST 不变（用户保存仍传明文）
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_KEYS = [
  'LLM_API_BASE_URL',
  'LLM_API_KEY',
  'LLM_MODEL',
  'IMAGE_API_BASE_URL',
  'IMAGE_API_KEY',
  'IMAGE_MODEL',
  // 默认图片 adapter slug（空字符串 / 不存在 = 走 legacy 路径）
  'IMAGE_DEFAULT_ADAPTER',
];

function isSecretKey(key: string): boolean {
  return /key/i.test(key);
}

export async function GET() {
  const rows = await prisma.setting.findMany({
    where: { key: { in: ALLOWED_KEYS } },
  });
  const list = rows.map((row) => {
    if (isSecretKey(row.key)) {
      const length = row.value?.length ?? 0;
      return {
        key: row.key,
        value: '',
        isSet: length > 0,
        length,
      };
    }
    return { key: row.key, value: row.value };
  });
  return NextResponse.json({ ok: true, list });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    for (const key of ALLOWED_KEYS) {
      if (key in body) {
        const value = String(body[key] ?? '');
        if (value === '') {
          await prisma.setting.deleteMany({ where: { key } });
        } else {
          await prisma.setting.upsert({
            where: { key },
            update: { value },
            create: { key, value },
          });
        }
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
