/**
 * v0.16-H2.2 · POST /api/agents/critic/conversation
 *
 * 多轮对话 + 视觉诊断 + 风格匹配度 + overlay 一站式
 *
 * 入参:
 *   {
 *     conversationId?: string,    // 多轮：上轮返回的 id
 *     imageDataUrl?: string,      // 第一轮必须传，后续轮非必须
 *     userMessage: string,        // 用户问题
 *     platform?: 'xiaohongshu' | 'xianyu' | 'qianniu' | 'general'
 *   }
 *
 * 出参:
 *   {
 *     ok: true,
 *     conversationId: string,
 *     turn: number,
 *     reply: { comments: Comment[], suggestion: string, score: number },
 *     overlayDataUrl?: string,
 *     styleMatch?: { score, paletteScore, compositionScore },
 *     visionAvailable: boolean
 *   }
 *
 * 数据存储 (0 schema 改动): Setting `critic:conv:{id}` JSON
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateVision, imageContent, textContent, type VisionMessage } from '@/lib/critic/vision-llm';
import { drawOverlay, shrinkForVision, type Comment } from '@/lib/critic/overlay';
import { extractFeature, resolveAssetPath } from '@/lib/style-genome/extractor';
import { getCurrentGenome } from '@/lib/style-genome/inject';
import { styleMatchScore } from '@/lib/critic/style-distance';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface ConvState {
  id: string;
  turn: number;
  imageDataUrl: string;          // 原始图 (压缩版供 LLM)
  imageOriginalDataUrl?: string; // 原始未压缩 (overlay 时用)
  platform?: string;
  history: { role: 'user' | 'assistant'; content: string; comments?: Comment[] }[];
  createdAt: string;
  imageFeature?: any; // 缓存避免重算
}

async function loadConv(id: string): Promise<ConvState | null> {
  const row = await prisma.setting.findUnique({ where: { key: `critic:conv:${id}` } });
  if (!row?.value) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

async function saveConv(conv: ConvState): Promise<void> {
  // 不存 originalDataUrl 到 DB (太大), 只存压缩版用于多轮 vision
  const toSave = { ...conv, imageOriginalDataUrl: undefined };
  await prisma.setting.upsert({
    where: { key: `critic:conv:${conv.id}` },
    update: { value: JSON.stringify(toSave) },
    create: { key: `critic:conv:${conv.id}`, value: JSON.stringify(toSave) },
  });
}

/** 给 vision LLM 的 system prompt */
function buildSystemPrompt(platform?: string, hasGenome?: boolean): string {
  return `你是一个资深平面设计 / 摄影评审专家，专门给设计师做作品诊断。

你的输出**必须**是严格 JSON：
{
  "score": 0-100,                                  // 整体得分
  "comments": [                                     // 3-5 条具体批注
    {
      "x": 0-1, "y": 0-1, "w": 0-1, "h": 0-1,    // 区域 (左上为原点的比例坐标)
      "severity": "high"|"medium"|"low",
      "label": "<= 8 个英文单词的短标签",
      "message": "中文解释 (<=80 字)"
    }
  ],
  "suggestion": "整体改进建议 1-3 段中文"
}

要求：
- 每条 comment 必须给出**具体区域坐标**（用比例 0-1）
- 严重度 high = 必改 / medium = 建议改 / low = 锦上添花
- label 用英文 (汇总展示用，避免中文 overlay 渲染问题)
- message 用中文 (右侧详情面板展示)
- ${platform ? `针对 ${platform} 平台调性评估` : '通用美学评估'}
- ${hasGenome ? '用户已有风格基因（色板/构图偏好），评审时考虑是否符合该风格' : ''}
- score 综合: 视觉冲击 + 信息层级 + 构图 + 配色 + 平台适配
- 直接输出 JSON，不要任何 markdown 包裹或前缀文字`;
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const userMessage = String(body?.userMessage || '').trim();
    if (!userMessage) {
      return NextResponse.json({ ok: false, error: '请输入对话内容' }, { status: 400 });
    }

    const conversationId = body?.conversationId ? String(body.conversationId) : '';
    let conv: ConvState | null = null;
    let isFirstTurn = false;

    if (conversationId) {
      conv = await loadConv(conversationId);
    }
    if (!conv) {
      // 第一轮必须有图
      const imgUrl = String(body?.imageDataUrl || '').trim();
      if (!imgUrl || !imgUrl.startsWith('data:image/')) {
        return NextResponse.json({ ok: false, error: '请上传图片 (第一轮必须)' }, { status: 400 });
      }
      isFirstTurn = true;
      const shrunk = await shrinkForVision(imgUrl, 1024);
      conv = {
        id: randomUUID(),
        turn: 0,
        imageDataUrl: shrunk,
        imageOriginalDataUrl: imgUrl,
        platform: body?.platform,
        history: [],
        createdAt: new Date().toISOString(),
      };
    } else {
      // 后续轮 vision LLM 不需要重新发图，但仍传 image (大多数 vision API 要求每轮带)
      conv.imageOriginalDataUrl = body?.imageDataUrl || conv.imageDataUrl;
    }

    conv.turn += 1;

    // 当前图特征（首轮 + cache）
    if (!conv.imageFeature) {
      try {
        const tmpName = `critic-${conv.id}.jpg`;
        const tmpPath = path.join(os.tmpdir(), tmpName);
        const m = conv.imageDataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
        if (m) {
          await fs.writeFile(tmpPath, Buffer.from(m[1], 'base64'));
          conv.imageFeature = await extractFeature(tmpPath);
          await fs.unlink(tmpPath).catch(() => null);
        }
      } catch (e) {
        console.warn('[critic/feature]', (e as Error).message);
      }
    }

    // genome 对比
    const genome = await getCurrentGenome();
    let styleMatch: { score: number; paletteScore: number; compositionScore: number } | undefined;
    if (genome && conv.imageFeature) {
      const palette = (conv.imageFeature.colors || []).slice(0, 5).map((c: any) => c.hex);
      styleMatch = styleMatchScore(palette, conv.imageFeature.compositionType, genome);
    }

    // 组 vision messages
    const visionMessages: VisionMessage[] = [
      { role: 'system', content: buildSystemPrompt(conv.platform, !!genome) },
    ];

    // 历史轮 (text-only forwarding)
    for (const h of conv.history) {
      visionMessages.push({ role: h.role, content: h.content });
    }

    // 当前轮: 图 + 文字
    visionMessages.push({
      role: 'user',
      content: [
        imageContent(conv.imageDataUrl, 'auto'),
        textContent(`${userMessage}${styleMatch ? `\n\n[系统提示] 用户的风格基因匹配度: ${styleMatch.score}% (色板 ${styleMatch.paletteScore}% + 构图 ${styleMatch.compositionScore}%)。如果匹配度低，可在建议里指出具体偏差点。` : ''}`),
      ],
    });

    const r = await generateVision({
      messages: visionMessages,
      temperature: 0.4,
      maxTokens: 1500,
      responseFormat: 'json',
    });

    if (!r.ok) {
      return NextResponse.json({
        ok: false,
        conversationId: conv.id,
        visionAvailable: r.visionAvailable,
        error: r.error,
        styleMatch,
        durationMs: Date.now() - t0,
      });
    }

    // 解析 JSON
    let parsed: any;
    try {
      parsed = JSON.parse(r.content);
    } catch {
      // 尝试提取 JSON 段
      const m = r.content.match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch { /* */ }
      }
    }
    if (!parsed) {
      return NextResponse.json({
        ok: false,
        conversationId: conv.id,
        visionAvailable: true,
        error: 'LLM 返回非合法 JSON',
        rawContent: r.content?.slice(0, 500),
        styleMatch,
      });
    }

    const comments: Comment[] = Array.isArray(parsed.comments)
      ? parsed.comments
          .filter((c: any) =>
            c &&
            typeof c.x === 'number' &&
            typeof c.y === 'number' &&
            typeof c.w === 'number' &&
            typeof c.h === 'number')
          .map((c: any, i: number) => ({
            x: Math.max(0, Math.min(1, c.x)),
            y: Math.max(0, Math.min(1, c.y)),
            w: Math.max(0, Math.min(1, c.w)),
            h: Math.max(0, Math.min(1, c.h)),
            severity: ['high', 'medium', 'low'].includes(c.severity) ? c.severity : 'medium',
            label: String(c.label || '').slice(0, 30),
            message: String(c.message || '').slice(0, 200),
            index: i + 1,
          }))
          .slice(0, 5)
      : [];

    // 画 overlay
    let overlayDataUrl: string | undefined;
    if (comments.length > 0 && conv.imageOriginalDataUrl) {
      try {
        overlayDataUrl = await drawOverlay(conv.imageOriginalDataUrl, comments);
      } catch (e) {
        console.warn('[critic/overlay]', (e as Error).message);
      }
    }

    // 更新 conversation
    conv.history.push({ role: 'user', content: userMessage });
    conv.history.push({
      role: 'assistant',
      content: r.content,
      comments,
    });

    await saveConv(conv);

    // 写 AIOutput 历史
    try {
      await prisma.aIOutput.create({
        data: {
          type: 'critic',
          input: JSON.stringify({ conversationId: conv.id, turn: conv.turn, userMessage, platform: conv.platform }),
          output: JSON.stringify({ score: parsed.score, comments, suggestion: parsed.suggestion }),
          model: r.model || 'vision-llm',
        },
      });
    } catch (e) {
      console.warn('[critic/persist]', (e as Error).message);
    }

    return NextResponse.json({
      ok: true,
      conversationId: conv.id,
      turn: conv.turn,
      reply: {
        score: typeof parsed.score === 'number' ? Math.max(0, Math.min(100, parsed.score)) : 50,
        comments,
        suggestion: String(parsed.suggestion || '').slice(0, 1000),
      },
      overlayDataUrl,
      styleMatch,
      visionAvailable: true,
      model: r.model,
      durationMs: Date.now() - t0,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message || 'unknown', durationMs: Date.now() - t0 },
      { status: 500 },
    );
  }
}
