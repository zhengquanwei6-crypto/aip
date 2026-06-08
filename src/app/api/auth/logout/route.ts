/**
 * v0.18-AUTH · POST /api/auth/logout
 * 清除会话 cookie。
 */
import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  clearSessionCookie();
  return NextResponse.json({ ok: true });
}
