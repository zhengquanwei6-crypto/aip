/**
 * v0.17-C1 · GET /api/comfyui/view?filename=...&subfolder=...&type=output
 *
 * 代理 ComfyUI 的 /view，把图片字节流回浏览器。这条路的好处：
 *   - 浏览器不直接接触 ComfyUI 域（避免暴露 cloudstudio URL）
 *   - 鉴权 / 日志 / 缓存都可以在这一层统一加
 */
import { NextRequest, NextResponse } from "next/server";
import { viewImage } from "@/lib/adapters/comfyui/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const filename = sp.get("filename");
  const subfolder = sp.get("subfolder") ?? "";
  const type = (sp.get("type") ?? "output") as "output" | "input" | "temp";
  if (!filename) {
    return NextResponse.json({ error: "filename required" }, { status: 400 });
  }
  try {
    const { buffer, contentType } = await viewImage(filename, subfolder, type);
    // Wrap node Buffer into a fresh Uint8Array view so Response accepts it
    // under Next.js / Edge's stricter BodyInit types (Buffer<ArrayBufferLike>
    // does not satisfy the union without an explicit cast).
    const body = new Uint8Array(buffer);
    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 502 },
    );
  }
}
