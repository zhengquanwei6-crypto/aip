/**
 * 客户端错误收集端点
 *
 * 接受任何 client component / showcase error.tsx 上报的运行时错误。
 * 只打日志到 stdout（docker logs 能直接 grep），不写库不消耗 token。
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const safe = {
      page: String(body?.page ?? "?").slice(0, 100),
      message: String(body?.message ?? "?").slice(0, 600),
      stack: String(body?.stack ?? "").slice(0, 2000),
      digest: String(body?.digest ?? "").slice(0, 80),
      ua: String(body?.ua ?? "").slice(0, 200),
      url: String(body?.url ?? "").slice(0, 300),
    };
    // 一行一条，方便 grep
    // eslint-disable-next-line no-console
    console.error("[client-error]", JSON.stringify(safe));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
