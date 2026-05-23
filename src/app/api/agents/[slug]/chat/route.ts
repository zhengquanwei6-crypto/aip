/**
 * /api/agents/[slug]/chat — 统一 agent 聊天端点
 *
 * - 校验 slug 是否注册
 * - 按 slug 选择对应的 contextLoader 拼入 system
 * - 调当前 LLM 配置（DO router 默认）
 */

import { NextRequest, NextResponse } from 'next/server';
import { findAgent } from '@/lib/agent-types';
import { generateText, type ChatMessage } from '@/lib/ai/text';
import {
  loadAdaptersSummary,
  loadSettingsSummary,
  loadRecentFailures,
  loadImageContext,
  loadCopyContext,
  loadPricingContext,
  loadTodayContext,
  loadClientContext,
} from '@/lib/agents/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface IncomingMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function buildContext(slug: string, opts: Record<string, unknown>): Promise<string> {
  switch (slug) {
    case 'api-doctor': {
      const [a, s, f] = await Promise.all([
        loadAdaptersSummary(),
        loadSettingsSummary(),
        loadRecentFailures(5),
      ]);
      return [a, s, f].join('\n\n');
    }
    case 'prompt-coach':
      return loadImageContext();
    case 'copy-writer':
      return loadCopyContext();
    case 'price-quoter':
      return loadPricingContext();
    case 'day-coach':
      return loadTodayContext();
    case 'client-coach':
      return loadClientContext(String(opts.clientId ?? ''));
    default:
      return '';
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  try {
    const agent = findAgent(params.slug);
    if (!agent) {
      return NextResponse.json(
        { ok: false, error: `unknown agent: ${params.slug}` },
        { status: 404 },
      );
    }

    const body = await req.json();
    const messages: IncomingMessage[] = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      return NextResponse.json({ ok: false, error: 'messages 不能为空' }, { status: 400 });
    }
    const opts = (body.context && typeof body.context === 'object') ? body.context as Record<string, unknown> : {};

    const contextBlock = await buildContext(agent.slug, opts);

    const llmMessages: ChatMessage[] = [
      {
        role: 'system',
        content:
          agent.systemPrompt +
          (contextBlock
            ? '\n\n以下是平台当前状态快照（用于辅助回答；下方 API key 已脱敏，不要泄露）：\n\n' + contextBlock
            : ''),
      },
      ...messages.map((m) => ({ role: m.role, content: String(m.content || '') })),
    ];

    const r = await generateText({
      messages: llmMessages,
      temperature: 0.5,
      maxTokens: 1500,
      responseFormat: 'text',
    });

    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: r.error || 'LLM 调用失败', model: r.model },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      content: r.content,
      model: r.model,
      agent: { slug: agent.slug, name: agent.name, icon: agent.icon },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message || 'unknown error' },
      { status: 500 },
    );
  }
}
