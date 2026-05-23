/**
 * v0.11 B1 · /api/settings/keys/[id]/test
 *
 * 0 generation token consumed：仅做连通性测试
 *   - LLM key  → GET ${baseUrl}/models（5s 超时），ok 视为可达
 *               若 /models 不存在则 fallback ping baseUrl 根（任意 HTTP 状态都视为可达）
 *   - IMAGE key → 同 LLM 策略（中转站通常也支持 /models 列表）
 *
 * 不调用 chat/completions 或 images/generations，避免消耗 token / image quota。
 *
 * 行为：
 *   - 200 + ok:true 表示可达
 *   - 200 + ok:false 表示明确失败（带 error 信息）
 *   - 测试结果会写入对应 ApiKey row（成功 reset 错误，失败 ++consecutive）
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { markKeySuccess, markKeyError } from '@/lib/ai/keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = params.id;
  if (!id) return NextResponse.json({ ok: false, error: 'id 缺失' }, { status: 400 });

  const row = await prisma.apiKey.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ ok: false, error: 'key 不存在' }, { status: 404 });

  const baseUrl = (row.baseUrl ?? '').replace(/\/$/, '');
  const apiKey = row.apiKey ?? '';
  if (!baseUrl || !apiKey) {
    const err = '该 key 缺少 baseUrl 或 apiKey';
    await markKeyError(id, err);
    return NextResponse.json({ ok: false, error: err });
  }
  const headers = { Authorization: `Bearer ${apiKey}` };

  // ① 优先尝试 /models
  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/models`,
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
      await markKeySuccess(id);
      return NextResponse.json({
        ok: true,
        message: `连通性 OK · /models 可达${count != null ? `，共 ${count} 个模型` : ''}`,
        endpoint: `${baseUrl}/models`,
        status: res.status,
      });
    }
    // /models 非 2xx 但能拿到 status → 落到根 ping 兜底
  } catch {
    // 超时 / 网络错误，落到根 ping
  }

  // ② Fallback：ping baseUrl 根
  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/`,
      { method: 'GET', headers },
      5000,
    );
    // 任何返回（哪怕 404 / 401 with body）都视为"baseUrl 可达"
    await markKeySuccess(id);
    return NextResponse.json({
      ok: true,
      message: `baseUrl 可达（HTTP ${res.status}），/models 端点不可用但通常不影响生成`,
      endpoint: `${baseUrl}/`,
      status: res.status,
    });
  } catch (e) {
    const errMsg = `请求失败：${(e as Error).message}`;
    await markKeyError(id, errMsg);
    return NextResponse.json({ ok: false, error: errMsg });
  }
}
