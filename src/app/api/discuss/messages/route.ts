/**
 * v0.18-DISCUSS · 平台原生讨论工具 · 消息 API
 *
 *   GET  /api/discuss/messages?afterId=N&limit=M
 *        - 不带 afterId：返回最近 limit 条（默认 80，升序）
 *        - 带 afterId：返回 id > afterId 的新消息（增量轮询用）
 *   POST /api/discuss/messages   body: { content }
 *        - 发送者 = 当前登录用户名（来自会话，不接受客户端伪造）
 *
 * 单一公共频道，团队内部讨论用量足够；前端走短轮询（2s）实时刷新。
 * 全部走平台登录鉴权：未登录直接 401。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LEN = 2000;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
  }

  const afterIdRaw = req.nextUrl.searchParams.get("afterId");
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(200, Math.max(1, Number.parseInt(limitRaw || "80", 10) || 80));

  try {
    if (afterIdRaw) {
      const afterId = Number.parseInt(afterIdRaw, 10) || 0;
      const rows = await prisma.discussMessage.findMany({
        where: { id: { gt: afterId } },
        orderBy: { id: "asc" },
        take: limit,
      });
      return NextResponse.json({ ok: true, messages: rows });
    }
    // 初次加载：取最近 limit 条（desc 取后反转成升序）
    const recent = await prisma.discussMessage.findMany({
      orderBy: { id: "desc" },
      take: limit,
    });
    return NextResponse.json({ ok: true, messages: recent.reverse() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const content = String(body?.content ?? "").trim();
  if (!content) {
    return NextResponse.json({ ok: false, error: "内容不能为空" }, { status: 400 });
  }
  if (content.length > MAX_LEN) {
    return NextResponse.json({ ok: false, error: `内容过长（最多 ${MAX_LEN} 字）` }, { status: 400 });
  }

  try {
    const msg = await prisma.discussMessage.create({
      data: {
        username: user.username,
        role: user.role === "admin" ? "admin" : "user",
        content,
      },
    });
    return NextResponse.json({ ok: true, message: msg });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
