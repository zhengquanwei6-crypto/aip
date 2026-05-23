/**
 * /api/settings/test · 连通性测试
 *
 * v0.8 Batch 1（B1.5 / BUG-9）：
 *   - 旧逻辑：fetch ${baseUrl}/models，依赖端点存在
 *   - 新逻辑：先 fetch ${baseUrl}/models（5s 超时），ok 则解析；
 *            否则 fetch ${baseUrl}/（根），任意 HTTP 200/404 等都视为"baseUrl 可达但 /models 不一定存在"，
 *            给出更通用的提示。
 *   - 错误信息附加 baseUrl + model 摘要（BUG-7/9）
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateText } from '@/lib/ai/text';
import { getImageConfig } from '@/lib/ai/image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function summary(baseUrl?: string, model?: string): string {
  return ` [baseUrl=${baseUrl || '(空)'}, model=${model || '(空)'}]`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { target } = await req.json();

    if (target === 'llm') {
      const r = await generateText({
        messages: [
          { role: 'system', content: '你是连通性测试助手，只回答一个字：OK' },
          { role: 'user', content: '请回答：OK' },
        ],
        temperature: 0,
        maxTokens: 5,
      });
      if (!r.ok) {
        return NextResponse.json(
          { ok: false, error: (r.error || 'LLM 测试失败') + summary(undefined, r.model) },
          { status: 200 },
        );
      }
      return NextResponse.json({
        ok: true,
        message: `LLM 连接正常，模型：${r.model}，返回：${r.content.slice(0, 30)}`,
      });
    }

    if (target === 'image') {
      const cfg = await getImageConfig();
      if (!cfg.apiKey || !cfg.baseUrl) {
        return NextResponse.json(
          {
            ok: false,
            error: '图片 API 未配置 baseUrl 或 apiKey' + summary(cfg.baseUrl, cfg.model),
          },
          { status: 200 },
        );
      }
      const base = cfg.baseUrl!.replace(/\/$/, '');
      const headers = { Authorization: `Bearer ${cfg.apiKey}` };

      // ① 优先尝试 /models
      try {
        const res = await fetchWithTimeout(
          `${base}/models`,
          { method: 'GET', headers },
          5000,
        );
        if (res.ok) {
          let count: number | null = null;
          try {
            const j = await res.json();
            const data = (j && (j.data || j.models)) as unknown;
            if (Array.isArray(data)) count = data.length;
          } catch {
            /* 非 JSON 也算可达 */
          }
          return NextResponse.json({
            ok: true,
            message:
              `图片 API /models 端点可访问${count != null ? `，列出 ${count} 个模型` : ''}` +
              summary(cfg.baseUrl, cfg.model),
          });
        }
        // /models 非 2xx，落到根 ping
      } catch {
        // 超时 / 网络错误，落到根 ping
      }

      // ② Fallback：ping baseUrl 根
      try {
        const res = await fetchWithTimeout(
          `${base}/`,
          { method: 'GET', headers },
          5000,
        );
        // 任何返回（哪怕 404 / 401 with body）都视为"可达但 /models 不存在"
        return NextResponse.json({
          ok: true,
          message:
            `baseUrl 可达（HTTP ${res.status}），但 /models 端点不可用。` +
            `若 adapter 已能正常出图即可忽略此提示。` +
            summary(cfg.baseUrl, cfg.model),
        });
      } catch (e) {
        return NextResponse.json({
          ok: false,
          error:
            `请求失败：${(e as Error).message}` +
            summary(cfg.baseUrl, cfg.model),
        });
      }
    }

    return NextResponse.json(
      { ok: false, error: '未知的 target' },
      { status: 400 },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
