/**
 * v0.11 B8 · /api/playground/agent/chat
 *
 * 即时调用 8 个内置 agent。等价于 /api/agents/[slug]/chat 的对话能力，
 * 但 AIOutput.type='playground:agent'（区别于 AgentDrawer 写的 type='agent'，避免污染原 drawer 历史）。
 *
 * 与 /api/agents/[slug]/chat 的区别：
 *   - body 提供 message 字段（单 user 输入），自动拼成 [{role:'user',content:message}]
 *     也接受 messages: ChatTurn[] 形式（更灵活，给客户端持有多轮上下文）
 *   - slug 通过 body.slug 传，不是 path param（playground 三 tab 共享同一 endpoint）
 *
 * 不复用 /api/agents/[slug]/chat 路由（避免 internal fetch 跨进程开销 + 行内 forward 给上层暴露错误更直接）。
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { findAgent } from '@/lib/agent-types';
import { generateText, type ChatMessage } from '@/lib/ai/text';
import { searchHistory } from '@/lib/vector';
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

interface IncomingTurn {
  role?: 'user' | 'assistant';
  content?: string;
}

interface PlaygroundAgentRequest {
  slug?: string;
  /** 单轮：直接给 user 消息字符串 */
  message?: string;
  /** 多轮：完整 messages 数组（user/assistant 交替） */
  messages?: IncomingTurn[];
  /** context loader 的额外参数（如 client-coach 的 clientId） */
  context?: Record<string, unknown>;
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

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    let body: PlaygroundAgentRequest = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
    if (!slug) {
      return NextResponse.json({ ok: false, error: 'slug 必填' }, { status: 400 });
    }

    const agent = findAgent(slug);
    if (!agent) {
      return NextResponse.json(
        { ok: false, error: `未知 agent slug: ${slug}` },
        { status: 404 },
      );
    }

    // 构造 user/assistant 序列
    let turns: IncomingTurn[] = [];
    if (Array.isArray(body.messages) && body.messages.length > 0) {
      turns = body.messages.filter(
        (t) => t && typeof t.content === 'string' && t.content.trim().length > 0,
      );
    } else if (typeof body.message === 'string' && body.message.trim()) {
      turns = [{ role: 'user', content: String(body.message).trim() }];
    }
    if (turns.length === 0 || !turns.some((t) => t.role === 'user' && (t.content ?? '').trim().length > 0)) {
      return NextResponse.json(
        { ok: false, error: 'message 不能为空（messages 数组也可以，但必须至少一条 role=user 的消息）' },
        { status: 400 },
      );
    }

    const opts =
      body.context && typeof body.context === 'object' ? (body.context as Record<string, unknown>) : {};
    const contextBlock = await buildContext(agent.slug, opts);

    // v0.15-d RAG: 用 turns 最后 user 消息做召回
    let ragRecalled: any[] = [];
    let ragQuery = '';
    try {
      if ((body as any).useRAG !== false) {
        const lastUser = [...turns].reverse().find((t) => t.role === 'user');
        ragQuery = (lastUser?.content || '').slice(0, 200);
        if (ragQuery) {
          const hits = await searchHistory(ragQuery, { topK: 5 });
          ragRecalled = hits.filter((h: any) => h.score >= 0.65).slice(0, 3);
        }
      }
    } catch (e) {
      console.warn('[v015-d rag/playground-agent]', (e as Error).message);
    }
    const ragBlock = ragRecalled.length > 0
      ? '\n\n以下是与用户问题相关的历史输出（参考但不照抄）：\n' +
        ragRecalled.map((h: any, i: number) => `[${i + 1}] ${String(h.text || '').slice(0, 220)}`).join('\n')
      : '';

        const llmMessages: ChatMessage[] = [
      {
        role: 'system',
        content:
          agent.systemPrompt +
          (contextBlock
            ? '\n\n以下是平台当前状态快照（用于辅助回答；下方 API key 已脱敏，不要泄露）：\n\n' + contextBlock
            : '') + ragBlock,
      },
      ...turns.map<ChatMessage>((t) => ({
        role: t.role === 'assistant' ? 'assistant' : 'user',
        content: String(t.content ?? ''),
      })),
    ];

    const r = await generateText({
      messages: llmMessages,
      temperature: 0.5,
      maxTokens: 1500,
      responseFormat: 'text',
    });

    const latencyMs = Date.now() - t0;

    if (!r.ok) {
      try {
        await prisma.aIOutput.create({
          data: {
            type: 'playground:agent',
            input: JSON.stringify({
              via: 'playground',
              slug: agent.slug,
              messageCount: turns.length,
              firstUser: turns.find((t) => t.role === 'user')?.content?.slice(0, 200) ?? '',
            }),
            output: JSON.stringify({ error: r.error ?? 'LLM 调用失败' }),
            model: r.model ?? 'unknown',
          },
        });
      } catch {
        /* ignore */
      }
      return NextResponse.json(
        { ok: false, error: r.error || 'LLM 调用失败', model: r.model, slug: agent.slug },
        { status: 500 },
      );
    }

    try {
      await prisma.aIOutput.create({
        data: {
          type: 'playground:agent',
          input: JSON.stringify({
            via: 'playground',
            slug: agent.slug,
            messageCount: turns.length,
            firstUser: turns.find((t) => t.role === 'user')?.content?.slice(0, 200) ?? '',
          }),
          output: JSON.stringify({ content: r.content.slice(0, 4000), latencyMs }),
          model: r.model ?? 'unknown',
        },
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      ok: true,
      content: r.content,
      output: r.content, // 别名：与 /llm/chat 对齐
      model: r.model,
      latencyMs,
      agent: { slug: agent.slug, name: agent.name, icon: agent.icon },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message || 'unknown error' },
      { status: 500 },
    );
  }
}
