import { NextRequest, NextResponse } from 'next/server';
import { generateText } from '@/lib/ai/text';
import { getImageConfig } from '@/lib/ai/image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
        return NextResponse.json({ ok: false, error: r.error }, { status: 200 });
      }
      return NextResponse.json({
        ok: true,
        message: `LLM 连接正常，模型：${r.model}，返回：${r.content.slice(0, 30)}`,
      });
    }
    if (target === 'image') {
      // 不真正消耗额度生成图片，只校验配置完整性 + 简单 ping endpoint
      const cfg = await getImageConfig();
      if (!cfg.apiKey || !cfg.baseUrl) {
        return NextResponse.json(
          { ok: false, error: '图片 API 未配置 baseUrl 或 apiKey' },
          { status: 200 },
        );
      }
      // 尝试请求 /models 列表（多数 OpenAI 兼容服务都有）
      try {
        const url = `${cfg.baseUrl!.replace(/\/$/, '')}/models`;
        const res = await fetch(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${cfg.apiKey}` },
        });
        if (!res.ok) {
          return NextResponse.json({
            ok: false,
            error: `连接失败 (${res.status})。请确认 baseUrl 和 apiKey。`,
          });
        }
        return NextResponse.json({
          ok: true,
          message: `图片 API 端点可访问，配置模型：${cfg.model}`,
        });
      } catch (e) {
        return NextResponse.json({
          ok: false,
          error: `请求失败：${(e as Error).message}`,
        });
      }
    }
    return NextResponse.json({ ok: false, error: '未知的 target' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
