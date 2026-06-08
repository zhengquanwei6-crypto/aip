/**
 * v0.17-C1 · POST /api/comfyui/upload
 *
 * 浏览器上传一张图（i2i / inpaint / canny / facedetailer 用） → 服务端
 * 转给 ComfyUI 的 /upload/image。
 *
 * 接受 multipart/form-data，字段 image (File)。返回 ComfyUI 给的相对文件名。
 */
import { NextRequest, NextResponse } from "next/server";
import { uploadImage } from "@/lib/adapters/comfyui/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const f = form.get("image");
    if (!(f instanceof File)) {
      return NextResponse.json({ ok: false, error: "image file required" }, { status: 400 });
    }
    if (f.size > 30 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "图片不能超过 30 MB" }, { status: 400 });
    }
    const buffer = Buffer.from(await f.arrayBuffer());
    const r = await uploadImage(buffer, f.name || `upload-${Date.now()}.png`, {
      overwrite: false,
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 200 },
    );
  }
}
