/**
 * v0.18-AUTH · POST /api/auth/register
 *
 * body: { username, password }
 * 创建一个普通账户（role=user），成功后直接登录（写会话 cookie）。
 *
 * 注意单租户语义：注册账户能登录、能看 workspace，但所有业务数据仍归属
 * 管理员 admin（共享同一份 SQLite 数据）。注册只是多一个登录入口，不另开
 * 数据隔离。
 *
 * 用户名唯一；admin 保留不可注册。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  hashPassword,
  isValidUsername,
  isValidPassword,
} from "@/lib/auth/core";
import { setSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESERVED = new Set(["admin", "root", "administrator", "system"]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const username = String(body?.username ?? "").trim();
    const password = String(body?.password ?? "");

    if (!isValidUsername(username)) {
      return NextResponse.json(
        { ok: false, error: "用户名需 3-32 位，仅限字母 / 数字 / 下划线 / 连字符" },
        { status: 400 },
      );
    }
    if (RESERVED.has(username.toLowerCase())) {
      return NextResponse.json(
        { ok: false, error: "该用户名已被保留，请换一个" },
        { status: 400 },
      );
    }
    if (!isValidPassword(password)) {
      return NextResponse.json(
        { ok: false, error: "密码至少 6 位" },
        { status: 400 },
      );
    }

    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) {
      return NextResponse.json(
        { ok: false, error: "该用户名已存在" },
        { status: 409 },
      );
    }

    const passHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { username, passHash, role: "user", active: true },
    });

    await setSessionCookie({
      uid: user.id,
      username: user.username,
      role: "user",
    });

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
