/**
 * v0.18-AUTH · GET /api/auth/me
 * 返回当前登录用户（未登录 returns { ok:true, user:null }）。
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({
    ok: true,
    user: user ? { username: user.username, role: user.role } : null,
  });
}
