/**
 * v0.14-z63 · POST /api/vector/embed-test
 * 用 settings 配置的 EMBEDDING_BASE_URL + EMBEDDING_API_KEY 测试一次 embedding 调用。
 * 不写库不索引，仅返回向量长度 + 模型 + 端点 + 错误。
 */
import { NextResponse } from "next/server";
import { embedOne } from "@/lib/vector/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const v = await embedOne("hello world");
    return NextResponse.json({
      ok: true,
      dimension: v.length,
      sampleHead: v.slice(0, 3),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message || "unknown" },
      { status: 500 },
    );
  }
}
