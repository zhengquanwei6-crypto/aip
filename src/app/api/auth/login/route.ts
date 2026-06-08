/**
 * v0.18-AUTH · POST /api/auth/login
 *
 * body: { username, password }
 * 成功：写 httpOnly 会话 cookie，返回 { ok, user }。
 * 失败：401 + { ok:false, error }。
 *
 * 兼容历史：如果 User 表里还没有 admin（老库刚加表 + 启动 seed 还没跑），
 * 这里会按 ensureAdminSeed() 兜底创建 admin/672229。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, isValidUsername } from "@/lib/auth/core";
import { setSessionCookie } from "@/lib/auth/session";
import { ensureAdminSeed } from "@/lib/auth/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await ensureAdminSeed();

    const body = await req.json().catch(() => ({}));
    const username = String(body?.username ?? "").trim();
    const password = String(body?.password ?? "");

    if (!username || !password) {
      return NextResponse.json(
        { ok: false, error: "请输入用户名和密码" },
        { status: 400 },
      );
    }
    if (!isValidUsername(username)) {
      return NextResponse.json(
        { ok: false, error: "用户名或密码错误" },
        { status: 401 },
      );
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !user.active) {
      // 故意用同样的话术，避免暴露用户名是否存在
      return NextResponse.json(
        { ok: false, error: "用户名或密码错误" },
        { status: 401 },
      );
    }

    const ok = await verifyPassword(password, user.passHash);
    if (!ok) {
      return NextResponse.json(
        { ok: false, error: "用户名或密码错误" },
        { status: 401 },
      );
    }

    await setSessionCookie({
      uid: user.id,
      username: user.username,
      role: user.role === "admin" ? "admin" : "user",
    });

    await prisma.user
      .update({ where: { id: user.id }, data: { lastLogin: new Date() } })
      .catch(() => {});

    return NextResponse.json({
      ok: true,
      user: { username: user.username, role: user.role },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
