import { NextRequest, NextResponse } from "next/server";
import { getShare, saveShare, deleteShare } from "@/lib/share/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: { shareId: string } }) {
  const body = await req.json().catch(() => ({}));
  const link = await getShare(ctx.params.shareId);
  if (!link) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  if (typeof body.revoked === "boolean") link.revoked = body.revoked;
  await saveShare(link);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: { shareId: string } }) {
  await deleteShare(ctx.params.shareId);
  return NextResponse.json({ ok: true });
}
