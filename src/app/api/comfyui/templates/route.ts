/**
 * v0.17-C2 · GET /api/comfyui/templates
 *
 * 返回 4 个内置 workflow 模板的 metadata（slug / label / vars schema），
 * 不返回 workflow JSON 本身（保护服务端实现细节）。给 UI 渲染表单用。
 */
import { NextResponse } from "next/server";
import { TEMPLATE_LIST } from "@/lib/adapters/comfyui/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    templates: TEMPLATE_LIST.map((t) => ({
      slug: t.slug,
      label: t.label,
      category: t.category,
      description: t.description,
      expectedSec: t.expectedSec,
      vars: t.vars,
    })),
  });
}
