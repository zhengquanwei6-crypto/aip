/**
 * POST /api/tasks/from-asset
 *
 * 从素材直接创建发布/运营任务，让「素材 → 发布任务」成为可点击动作。
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function shanghaiTimeHHmm(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

function titleFromAsset(asset: { type: string; category: string | null; prompt: string | null }) {
  const base = asset.category || asset.type || '素材';
  const promptLead = asset.prompt?.split(/\n+/)[0]?.slice(0, 34);
  return promptLead ? `${base} · ${promptLead}` : `${base}发布任务`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const assetId = text(body.assetId);
    if (!assetId) {
      return NextResponse.json({ ok: false, error: '需要 assetId' }, { status: 400 });
    }

    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) {
      return NextResponse.json({ ok: false, error: '找不到素材' }, { status: 404 });
    }

    const platform = text(body.platform) || asset.platform || 'xiaohongshu';
    const category = text(body.category) || asset.category || asset.type || '设计素材';
    const contentType = text(body.contentType) || '素材发布';
    const title = text(body.title) || titleFromAsset(asset);
    const publishTime = text(body.publishTime) || shanghaiTimeHHmm();
    const coverText = text(body.coverText) || asset.type;
    const bodyText =
      text(body.body) ||
      [
        `素材来源：${asset.source === 'ai_generated' ? 'AI 生成' : '手动上传'}`,
        asset.prompt ? `创作提示：${asset.prompt.slice(0, 500)}` : null,
        text(body.clientId) ? `关联客户：${text(body.clientId)}` : null,
        '下一步：补文案、确认平台、发布后回填经营数据。',
      ]
        .filter(Boolean)
        .join('\n');

    const task = await prisma.task.create({
      data: {
        platform,
        publishTime,
        category,
        contentType,
        title,
        body: bodyText,
        coverText,
        imageUrl: asset.url,
        status: text(body.status) || 'pending',
        priority: Math.max(0, Math.min(9, Number(body.priority) || 1)),
      },
    });

    return NextResponse.json({
      ok: true,
      task,
      next: {
        todayUrl: '/today',
        taskUrl: `/today?task=${encodeURIComponent(task.id)}`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
