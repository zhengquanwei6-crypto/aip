/**
 * /api/tasks/[id]/generate-image · 任务一键生成图片（重构走 adapter）
 *
 * 流程不变：
 *   1) LLM 生 prompt
 *   2) 调图片 API（现在走 image-runner）
 *   3) 写素材库 + 更新 task.imageUrl
 *
 * v0.8 Batch 5：fail 时把 trace 透传（含 adapter / baseUrl / lastError / pollHistory）
 * v0.9.2 b1：走 async builder 接通 /prompts 模板编辑器
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateText, extractJSON } from '@/lib/ai/text';
import { buildImagePromptMessagesAsync } from '@/lib/ai/prompts';
import { runImageGenerate } from '@/lib/image-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const task = await prisma.task.findUnique({ where: { id: params.id } });
    if (!task) {
      return NextResponse.json({ ok: false, error: '任务不存在' }, { status: 404 });
    }

    const platform = task.platform as 'xiaohongshu' | 'xianyu';
    const ratio = platform === 'xiaohongshu' ? '3:4' : '1:1';
    const size = platform === 'xiaohongshu' ? '1024x1536' : '1024x1024';

    // 1) 让 LLM 生成图片提示词（v0.9.2 b1：async builder 路由 image:suggest）
    const messages = await buildImagePromptMessagesAsync({
      platform,
      imageType: platform === 'xiaohongshu' ? '封面图' : '商品首图',
      coverTitle: task.coverText || task.title,
      category: task.category,
      ratio,
    });

    const t = await generateText({
      messages,
      temperature: 0.8,
      responseFormat: 'json',
    });
    if (!t.ok) {
      return NextResponse.json({ ok: false, error: t.error }, { status: 500 });
    }
    const parsed = extractJSON<{ prompt: string; size?: string }>(t.content);
    if (!parsed?.prompt) {
      return NextResponse.json(
        { ok: false, error: '提示词解析失败', raw: t.content },
        { status: 500 },
      );
    }

    // 2) 调图片 API（走 image-runner，兼容 adapter / legacy）
    const r = await runImageGenerate({
      prompt: parsed.prompt,
      size: parsed.size || size,
      n: 1,
      extra: { aspectRatio: ratio },
    });
    if (!r.ok || r.savedUrls.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: r.error || '未返回图片',
          via: r.via,
          adapterSlug: r.adapterSlug,
          durationMs: r.durationMs,
          trace: r.trace,
        },
        { status: 500 },
      );
    }
    const url = r.savedUrls[0];
    const fileName = url.split('/').pop() || '';

    // 3) 写素材库 + 更新 task
    await prisma.asset.create({
      data: {
        type: platform === 'xiaohongshu' ? '封面图' : '商品首图',
        source: 'ai_generated',
        platform,
        category: task.category,
        url,
        prompt: parsed.prompt,
        fileName,
      },
    });
    await prisma.aIOutput.create({
      data: {
        type: 'image',
        input: JSON.stringify({ taskId: task.id, prompt: parsed.prompt }),
        output: JSON.stringify({ url, via: r.via, adapterSlug: r.adapterSlug }),
        model: r.via === 'adapter' ? `adapter:${r.adapterSlug}` : (r.model ?? 'unknown'),
      },
    });

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: { imageUrl: url },
    });
    return NextResponse.json({
      ok: true,
      task: updated,
      prompt: parsed.prompt,
      via: r.via,
      adapterSlug: r.adapterSlug,
      durationMs: r.durationMs,
      trace: r.trace,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
