/**
 * v0.11 B8 · /api/playground/llm/chat
 *
 * 即时调用 LLM 对话端点。复用 generateText（B1 池路径），但允许用户：
 *   - 显式指定 keyId（覆盖默认 active 池条目，专门给某条 key 做 A/B 试用）
 *   - 临时覆盖 model（同 keyId 但跑不同 model 的便利路径）
 *   - 自定义 system / user / temperature / max_tokens
 *   - 多轮对话：传整段 messages 数组（client 端持有，每次 send 把数组传后端）
 *
 * 写库：AIOutput.type='playground:llm'，input 含 messages 摘要 + 配置，output 含 content + tokens
 *
 * 0 schema 改 · 0 缓存（force-dynamic）· keyId 失效时静默 fallback active 池
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { searchHistory } from '@/lib/vector';
import {
  getLLMConfigWithSource,
  recordLLMResult,
  type ChatMessage,
} from '@/lib/ai/text';
import {
  markKeySuccess,
  markKeyError,
  type ActiveKey,
} from '@/lib/ai/keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface IncomingTurn {
  role?: 'user' | 'assistant' | 'system';
  content?: string;
}

interface PlaygroundLlmRequest {
  /** 优先使用此 keyId 对应的 ApiKey 行；找不到 / inactive 时回退默认池 */
  keyId?: string;
  /** 临时覆盖 model（不落 ApiKey 行；只在本次请求生效） */
  model?: string;
  /** system prompt（可空） */
  system?: string;
  /** 单轮：user 字符串 */
  user?: string;
  /** 多轮：messages 数组（优先级高于 user/system；client 端持有上下文） */
  messages?: IncomingTurn[];
  /** 温度 0..2，默认 0.7 */
  temperature?: number;
  /** 最大 token，默认 4096 */
  max_tokens?: number;
  /** v0.14-z86: 是否启用 RAG 语义召回（从 dao_history 拉相关历史输出） */
  useRAG?: boolean;
  /** v0.14-z86: RAG 召回 topK，默认 3 */
  ragTopK?: number;
}

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/** 当用户传 keyId 时，从 ApiKey 表读出来覆盖默认池 */
async function pickKeyById(keyId: string): Promise<ActiveKey | null> {
  try {
    const row = await prisma.apiKey.findUnique({ where: { id: keyId } });
    if (!row || row.provider !== 'llm' || !row.apiKey || !row.baseUrl) return null;
    return {
      id: row.id,
      provider: 'llm',
      label: row.label,
      baseUrl: row.baseUrl,
      apiKey: row.apiKey,
      model: row.model,
      priority: row.priority,
      consecutiveErrors: row.consecutiveErrors,
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    let body: PlaygroundLlmRequest = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    // 1) 构造 messages 数组
    let chat: ChatMessage[] = [];
    if (Array.isArray(body.messages) && body.messages.length > 0) {
      // 多轮：直接用 client 端的对话历史
      chat = body.messages
        .filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0)
        .map<ChatMessage>((m) => ({
          role: m.role === 'system' || m.role === 'assistant' ? m.role : 'user',
          content: String(m.content ?? ''),
        }));
      if (typeof body.system === 'string' && body.system.trim()) {
        // 单独的 system prompt 总是放在最前
        const sys = String(body.system).trim();
        if (chat.length === 0 || chat[0]?.role !== 'system') {
          chat.unshift({ role: 'system', content: sys });
        }
      }
    } else if (typeof body.user === 'string' && body.user.trim()) {
      // 单轮：拼 system + user
      if (typeof body.system === 'string' && body.system.trim()) {
        chat.push({ role: 'system', content: String(body.system).trim() });
      }
      chat.push({ role: 'user', content: String(body.user).trim() });
    }

    if (chat.length === 0 || !chat.some((m) => m.role === 'user')) {
      return NextResponse.json(
        { ok: false, error: 'user 不能为空（messages 数组也可以，但必须至少含一条 role=user 的消息）' },
        { status: 400 },
      );
    }

    // v0.14-z86: RAG 召回 - 从 dao_history 拉相关历史输出当作 system 上下文
    let ragRecalled = 0;
    let ragQueryUsed = '';
    if (body.useRAG === true) {
      try {
        // 用最后一条 user 消息作为查询
        const lastUser = [...chat].reverse().find((m) => m.role === 'user');
        if (lastUser?.content) {
          ragQueryUsed = lastUser.content.slice(0, 500);
          const topK = clampNumber(body.ragTopK, 1, 10, 3);
          const hits = await searchHistory(ragQueryUsed, { topK });
          if (hits.length > 0) {
            // 拉 prisma 完整数据
            const ids = hits.map((h) => h.id);
            const rows = await prisma.aIOutput.findMany({ where: { id: { in: ids } } });
            const byId = new Map(rows.map((r) => [r.id, r]));
            // 组装 RAG context
            const blocks: string[] = [];
            for (const h of hits) {
              const r = byId.get(h.id);
              if (!r) continue;
              const inputPreview = (r.input || '').slice(0, 200).replace(/\s+/g, ' ');
              const outputPreview = (r.output || '').slice(0, 400).replace(/\s+/g, ' ');
              blocks.push(
                `[相似度${(h.score * 100).toFixed(0)}% · ${r.type}] 输入: ${inputPreview} | 输出: ${outputPreview}`,
              );
              ragRecalled++;
            }
            if (blocks.length > 0) {
              const ragSystem: ChatMessage = {
                role: 'system',
                content:
                  '【RAG 历史召回 · 仅作上下文参考】\n以下是用户过往与 AI 的对话/生成历史中与本次问题最相关的几条记录。回答时可酌情参考但不要直接复述：\n\n' +
                  blocks.join('\n\n'),
              };
              // 插到 system 区（如果第 0 条已是 system 就追加，否则前置）
              if (chat[0]?.role === 'system') {
                chat[0] = { ...chat[0], content: chat[0].content + '\n\n' + ragSystem.content };
              } else {
                chat.unshift(ragSystem);
              }
            }
          }
        }
      } catch (e) {
        // RAG 失败不阻塞业务流
        // eslint-disable-next-line no-console
        console.warn('[playground/llm RAG]', (e as Error).message);
      }
    }

    // 2) 选 key（用户显式 keyId > 默认池 > Setting 回退）
    const userKeyId = typeof body.keyId === 'string' && body.keyId.trim() ? body.keyId.trim() : null;
    let cfg: {
      baseUrl?: string;
      apiKey?: string;
      model?: string;
      _activeKey?: ActiveKey;
      _source?: 'pool' | 'setting' | 'env' | 'none';
    };
    let keyOverride: ActiveKey | null = null;
    if (userKeyId) {
      keyOverride = await pickKeyById(userKeyId);
    }
    if (keyOverride) {
      cfg = {
        baseUrl: keyOverride.baseUrl,
        apiKey: keyOverride.apiKey,
        model: keyOverride.model,
        _activeKey: keyOverride,
        _source: 'pool',
      };
    } else {
      cfg = await getLLMConfigWithSource();
    }

    if (!cfg.apiKey || !cfg.baseUrl) {
      return NextResponse.json(
        {
          ok: false,
          error: '未配置 LLM API（池 + Setting 都为空）。请先去 /settings → API Keys 池 新增一条 provider=llm 的 key',
        },
        { status: 503 },
      );
    }

    // 3) 临时覆盖 model（不动 ApiKey 行）
    const effectiveModel =
      typeof body.model === 'string' && body.model.trim() ? body.model.trim() : cfg.model || 'gpt-4o-mini';

    const temperature = clampNumber(body.temperature, 0, 2, 0.7);
    const max_tokens = clampNumber(body.max_tokens, 1, 32000, 4096);

    // 4) 直接 fetch（不复用 generateText，因为我们要透传 model 覆盖）
    const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const reqBody: Record<string, unknown> = {
      model: effectiveModel,
      messages: chat,
      temperature,
      max_tokens,
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify(reqBody),
      });
    } catch (err) {
      const msg = `LLM 请求异常: ${(err as Error).message}`;
      await recordLLMResult(cfg._activeKey, false, msg);
      return NextResponse.json({ ok: false, error: msg, model: effectiveModel }, { status: 502 });
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const msg = `LLM API 调用失败 (${res.status}): ${errText.slice(0, 500)}`;
      await recordLLMResult(cfg._activeKey, false, msg);
      // 写一条失败 AIOutput 便于 /workspace?tab=history 排查
      try {
        await prisma.aIOutput.create({
          data: {
            type: 'playground:llm',
            input: JSON.stringify({
              via: 'playground',
              keyId: cfg._activeKey?.id ?? null,
              keyLabel: cfg._activeKey?.label ?? null,
              model: effectiveModel,
              temperature,
              max_tokens,
              messageCount: chat.length,
            }),
            output: JSON.stringify({ error: msg, status: res.status }),
            model: effectiveModel,
          },
        });
      } catch {
        /* ignore */
      }
      return NextResponse.json(
        { ok: false, error: msg, model: effectiveModel, status: res.status },
        { status: 500 },
      );
    }

    const data: any = await res.json().catch(() => ({}));
    const content: string =
      data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';
    const tokens = {
      prompt: Number(data?.usage?.prompt_tokens ?? 0) || undefined,
      completion: Number(data?.usage?.completion_tokens ?? 0) || undefined,
      total: Number(data?.usage?.total_tokens ?? 0) || undefined,
    };
    const latencyMs = Date.now() - t0;

    // 池成功回写
    if (cfg._activeKey) {
      await markKeySuccess(cfg._activeKey.id);
    }

    // 写 AIOutput
    try {
      await prisma.aIOutput.create({
        data: {
          type: 'playground:llm',
          input: JSON.stringify({
            via: 'playground',
            keyId: cfg._activeKey?.id ?? null,
            keyLabel: cfg._activeKey?.label ?? null,
            model: effectiveModel,
            temperature,
            max_tokens,
            messageCount: chat.length,
            firstUser: chat.find((m) => m.role === 'user')?.content?.slice(0, 200) ?? '',
          }),
          output: JSON.stringify({ content: content.slice(0, 4000), tokens, latencyMs }),
          model: effectiveModel,
        },
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      ok: true,
      output: content,
      model: effectiveModel,
      latencyMs,
      tokens,
      keySource: cfg._source ?? 'none',
      keyLabel: cfg._activeKey?.label ?? null,
    });
  } catch (err) {
    const e = err as Error;
    // 标记 key 失败由内部 catch 已处理；这里是兜底
    return NextResponse.json(
      { ok: false, error: e?.message || 'unknown error' },
      { status: 500 },
    );
  }
}

// 辅助：避免 keyError 出现 unused import 警告（B1 链路在失败分支已用到）
void markKeyError;
