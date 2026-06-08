/**
 * v0.17-C1+C2 · POST /api/comfyui/run
 *
 * 提交 workflow 跑一次。两种 input 形态：
 *   A) 模板 + vars  →  服务端 fill placeholders 后提交
 *      { templateSlug: "z-image-turbo-1step", vars: {...} }
 *   B) 直接给 workflow JSON（C6 LLM 生成 / 用户手撕）
 *      { workflow: { "1": {class_type:"...", inputs:{}}, ... } }
 *
 * 返回 { ok, promptId }，不等出图 — 前端用 SSE 订阅 /api/comfyui/progress/{id}。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  submitWorkflow,
  getObjectInfo,
  type WorkflowJson,
} from "@/lib/adapters/comfyui/client";
import {
  getTemplate,
  applyPlaceholders,
  normalizeVars,
} from "@/lib/adapters/comfyui/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));

    let workflow: WorkflowJson;
    let templateSlug = "(custom)";

    if (body?.templateSlug) {
      const t = getTemplate(String(body.templateSlug));
      if (!t) {
        return NextResponse.json(
          { ok: false, error: `模板不存在: ${body.templateSlug}` },
          { status: 400 },
        );
      }
      const vars = normalizeVars(t, body?.vars ?? {});
      workflow = applyPlaceholders(t, vars);
      templateSlug = t.slug;
    } else if (body?.workflow && typeof body.workflow === "object") {
      workflow = body.workflow as WorkflowJson;
    } else {
      return NextResponse.json(
        { ok: false, error: "需要 templateSlug+vars 或 workflow 之一" },
        { status: 400 },
      );
    }

    // 预检：扫一遍 workflow 里所有 *_name 字段，跟 ComfyUI 实际安装的
    // 模型列表（通过 /object_info 拿到的 enum）做匹配。缺哪个一次性报
    // 出来，比让 ComfyUI 跑到一半 KSampler 撞 shape mismatch 友好得多。
    try {
      const missing = await checkModelDependencies(workflow);
      if (missing.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "ComfyUI 缺少必需模型",
            missingModels: missing,
            hint:
              "请在 ComfyUI 上下载这些模型到对应目录后重试。" +
              "Z-Image-Turbo 的模型见 https://huggingface.co/Comfy-Org/z_image_turbo",
            timing: { totalMs: Date.now() - t0 },
          },
          { status: 200 },
        );
      }
    } catch {
      /* 预检失败（如 object_info 拉不到）不阻塞，按原路径继续 — 让 ComfyUI 自己报错。 */
    }

    const sub = await submitWorkflow(workflow);

    // 写一行 AIOutput type='comfyui-submit'，记录哪个 prompt_id 来自哪个模板。
    // 出图后 history fetch 会另写一行 type='comfyui-result'。
    try {
      await prisma.aIOutput.create({
        data: {
          type: "comfyui-submit",
          input: JSON.stringify({
            templateSlug,
            vars: body?.vars,
            workflow,
          }).slice(0, 60_000),
          output: JSON.stringify({ promptId: sub.promptId, number: sub.number }),
          model: `comfyui:${templateSlug}`,
        },
      });
    } catch {
      /* persistence failure is non-fatal */
    }

    return NextResponse.json({
      ok: true,
      promptId: sub.promptId,
      number: sub.number,
      templateSlug,
      timing: { totalMs: Date.now() - t0 },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message, timing: { totalMs: Date.now() - t0 } },
      { status: 200 },
    );
  }
}

/**
 * 把一个 workflow 里出现的"模型文件名"字段（unet_name / clip_name /
 * clip_name1 / clip_name2 / vae_name / ckpt_name / control_net_name /
 * lora_name / upscale_model_name 等）和 ComfyUI 实际装的列表对比，返
 * 回缺失项。
 *
 * 实际安装列表来自 /object_info 中各 Loader 节点 required.<field>[0]
 * 的 enum，5 分钟缓存。
 */
async function checkModelDependencies(
  workflow: WorkflowJson,
): Promise<Array<{ node: string; classType: string; field: string; required: string; pool: string[] }>> {
  const objInfo = await getObjectInfo();
  const missing: Array<{
    node: string;
    classType: string;
    field: string;
    required: string;
    pool: string[];
  }> = [];

  // 各类 Loader 节点对应的"模型文件名"字段。新出现的 Loader 自动跟着
  // object_info 走（required 字段如果是 enum 会被检测到）。
  const MODEL_FILE_FIELDS = new Set([
    "ckpt_name",
    "unet_name",
    "clip_name",
    "clip_name1",
    "clip_name2",
    "clip_name3",
    "vae_name",
    "control_net_name",
    "lora_name",
    "upscale_model_name",
    "ipadapter_file",
    "style_model_name",
    "model_name",
  ]);

  for (const [nodeId, node] of Object.entries(workflow)) {
    const meta = objInfo[node.class_type];
    if (!meta) continue;
    const required = meta.inputs.required;
    for (const [field, raw] of Object.entries(node.inputs ?? {})) {
      if (!MODEL_FILE_FIELDS.has(field)) continue;
      // node 输入是 array → 表示连线，跳过
      if (Array.isArray(raw)) continue;
      const value = String(raw);
      // 该字段在 object_info 中的 enum
      const schema = required[field];
      if (!Array.isArray(schema)) continue;
      const enumList = schema[0];
      if (!Array.isArray(enumList)) continue;
      if (!enumList.includes(value)) {
        missing.push({
          node: nodeId,
          classType: node.class_type,
          field,
          required: value,
          pool: enumList.slice(0, 30) as string[],
        });
      }
    }
  }

  return missing;
}
