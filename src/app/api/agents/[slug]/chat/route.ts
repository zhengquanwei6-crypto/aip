/**
 * /api/agents/[slug]/chat — 统一 agent 聊天端点
 *
 * - 校验 slug 是否注册
 * - 按 slug 选择对应的 contextLoader 拼入 system
 * - 调当前 LLM 配置（DO router 默认）
 *
 * v0.12 B2：systemPrompt 通过 getEffectiveAgentSystemPrompt 解析：
 *   先查 Setting `prompt:agent:<slug>:system` → 存在用覆盖 → 否则 fallback agent.systemPrompt
 *   B15.5 docs 公共契约
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
import { getEffectiveAgentSystemPrompt } from '@/lib/agents/system-prompt';
import { searchHistory } from '@/lib/vector';

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

    // v0.12 B2：解析 effective systemPrompt（Setting 覆盖优先）
    const [systemPrompt, contextBlock] = await Promise.all([
      getEffectiveAgentSystemPrompt(agent.slug, agent.systemPrompt),
      buildContext(agent.slug, opts),
    ]);

    // v0.15-d RAG: 拉最后一条 user 消息做 dao_history 召回
    let ragRecalled: any[] = [];
    let ragQuery = '';
    try {
      if ((body as any).useRAG !== false) {
        const lastUser = [...messages].reverse().find((m) => m.role === 'user');
        ragQuery = (lastUser?.content || '').slice(0, 200);
        if (ragQuery) {
          const hits = await searchHistory(ragQuery, { topK: 5 });
          ragRecalled = hits.filter((h: any) => h.score >= 0.65).slice(0, 3);
        }
      }
    } catch (e) {
      console.warn('[v015-d rag/agent-drawer]', (e as Error).message);
    }
    const ragBlock = ragRecalled.length > 0
      ? '\n\n以下是与用户问题相关的历史输出（参考但不照抄）：\n' +
        ragRecalled.map((h: any, i: number) => `[${i + 1}] ${String(h.text || '').slice(0, 220)}`).join('\n')
      : '';

        const llmMessages: ChatMessage[] = [
      {
        role: 'system',
        content:
          systemPrompt +
          (contextBlock
            ? '\n\n以下是平台当前状态快照（用于辅助回答；下方 API key 已脱敏，不要泄露）：\n\n' + contextBlock
            : '') + ragBlock,
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
