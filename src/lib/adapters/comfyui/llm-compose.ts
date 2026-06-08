/**
 * v0.17-C6 · LLM 节点拼装（"AI 生成工作流"第二阶段）
 *
 * 给 LLM **真实的 ComfyUI 节点目录** + 用户中文需求 → LLM 直接生成完整
 * workflow JSON。本地校验失败把错误回扔给 LLM 自纠（最多 3 轮）。
 *
 * 设计思路：
 *   1. 不把 2183 个节点全塞进 prompt（会爆 token）。改用 **节点白名单 +
 *      安装清单** —— 只暴露本机实际装了的关键节点（loaders / samplers /
 *      conditioning / controlnet / impactpack 入口）。同时附上当前可用
 *      的模型 / lora / controlnet / vae 文件名清单。
 *   2. LLM 输出 workflow JSON。我们做三种校验：
 *      - 结构合法（每个节点是 { class_type, inputs }）
 *      - class_type 在 object_info 里存在
 *      - 引用的 model / lora / vae 文件名在 enum 里
 *      - 节点之间的 [from_id, output_idx] 连接 from_id 都在 workflow 里
 *   3. 任一校验失败 → 把具体错误 + 提示 + 上一轮 workflow 回扔给 LLM，
 *      最多自纠 3 轮，仍失败就上抛。
 *
 * 这部分耗 token 比 LLM 模板填空多 5 倍，但能产出模板没覆盖的复杂工作流。
 * 当前阶段 /ai-tools/comfy 默认走 C3 模板填空；用户在 UI 选 "AI 生成完整
 * 工作流" 高级模式才走 C6。
 */
import "server-only";

import { generateText, extractJSON, type ChatMessage } from "@/lib/ai/text";

import { getObjectInfo, type ObjectInfoNode, type WorkflowJson } from "./client";

/** 给 LLM 暴露的节点白名单 — 这些是构建 90% 工作流真正需要的关键节点。 */
const EXPOSED_CLASS_TYPES = [
  // loaders
  "CheckpointLoaderSimple",
  "UNETLoader",
  "VAELoader",
  "CLIPLoader",
  "DualCLIPLoader",
  "LoraLoader",
  "ControlNetLoader",
  "IPAdapterModelLoader",
  "UpscaleModelLoader",
  "LoadImage",
  // conditioning
  "CLIPTextEncode",
  "FluxGuidance",
  "ControlNetApply",
  "ControlNetApplyAdvanced",
  "IPAdapterApply",
  // sampling
  "KSampler",
  "KSamplerAdvanced",
  "SamplerCustom",
  // latent
  "EmptyLatentImage",
  "EmptySD3LatentImage",
  "VAEEncode",
  "VAEDecode",
  // image
  "ImageScale",
  "ImageScaleBy",
  "ImageUpscaleWithModel",
  "PreviewImage",
  "SaveImage",
  // impact pack
  "FaceDetailer",
  "DetailerForEach",
  "UltralyticsDetectorProvider",
  "SAMLoader",
] as const;

export interface ComposeRequest {
  /** 用户中文需求 */
  userIntent: string;
  /** 可选：参考英文 prompt（来自 prompt-gen） */
  promptEn?: string;
  /** 可选：已上传到 ComfyUI 的输入图 */
  inputImageName?: string;
  /** 最大自纠轮次（默认 3） */
  maxIterations?: number;
}

export interface ComposeResult {
  ok: boolean;
  workflow?: WorkflowJson;
  /** LLM 写的中文一段说明（"这个 workflow 干什么 / 各节点用途"） */
  explanation?: string;
  /** 自纠次数（0 = 第一次就过；3 = 用满还失败） */
  iterations: number;
  /** 校验过程的所有 error 历史（debug 用） */
  errorHistory: string[];
  error?: string;
  rawLlm?: string;
  model?: string;
}

/**
 * 把节点 schema 精简成 LLM 可读的 markdown。每个节点只列 required 输入字段
 * 类型和必填项，不展开全部 enum（enum 单独在"安装清单"里给）。
 */
async function buildNodeCatalog(): Promise<{
  catalog: string;
  installedFiles: string;
}> {
  const objectInfo = await getObjectInfo();

  const catalogLines: string[] = ["# 可用节点（class_type 必须从此清单选）", ""];
  for (const ct of EXPOSED_CLASS_TYPES) {
    const meta = objectInfo[ct];
    if (!meta) {
      catalogLines.push(`- ${ct}: ⚠ 本机未装`);
      continue;
    }
    const required = Object.keys(meta.inputs.required);
    catalogLines.push(`- **${ct}** (${meta.category})`);
    catalogLines.push(`  required: ${required.join(", ") || "(none)"}`);
  }

  // 装了的关键文件
  const installedLines: string[] = ["# 当前装了的模型 / Lora / VAE / ControlNet（必须用这些字面值）", ""];
  const fileFields: Array<{ ct: string; field: string; label: string }> = [
    { ct: "CheckpointLoaderSimple", field: "ckpt_name", label: "checkpoints" },
    { ct: "UNETLoader", field: "unet_name", label: "unets / flux / z-image" },
    { ct: "VAELoader", field: "vae_name", label: "vaes" },
    { ct: "CLIPLoader", field: "clip_name", label: "clip 单" },
    { ct: "DualCLIPLoader", field: "clip_name1", label: "dual clip 列表" },
    { ct: "LoraLoader", field: "lora_name", label: "loras" },
    { ct: "ControlNetLoader", field: "control_net_name", label: "controlnets" },
    { ct: "IPAdapterModelLoader", field: "ipadapter_file", label: "ipadapters" },
  ];
  for (const f of fileFields) {
    const meta = objectInfo[f.ct];
    const inp = meta?.inputs.required[f.field] as unknown[] | undefined;
    if (!inp || !Array.isArray(inp[0])) continue;
    const list = inp[0] as string[];
    installedLines.push(`- **${f.label}** (字段 ${f.ct}.${f.field}):`);
    for (const item of list) installedLines.push(`  · ${item}`);
  }
  // KSampler enum
  const ksampler = objectInfo["KSampler"];
  if (ksampler) {
    const samplers = (ksampler.inputs.required.sampler_name as unknown[])?.[0];
    const schedulers = (ksampler.inputs.required.scheduler as unknown[])?.[0];
    if (Array.isArray(samplers)) {
      installedLines.push(`- **sampler_name** (KSampler): ${(samplers as string[]).join(" / ")}`);
    }
    if (Array.isArray(schedulers)) {
      installedLines.push(`- **scheduler** (KSampler): ${(schedulers as string[]).join(" / ")}`);
    }
  }

  return {
    catalog: catalogLines.join("\n"),
    installedFiles: installedLines.join("\n"),
  };
}

const SYSTEM_HEADER = `你是 ComfyUI 工作流生成专家。任务：根据用户中文需求 + 参考资料，输出一个完整、合法、能跑的 ComfyUI workflow JSON。

【workflow JSON 格式】
- 顶层是一个对象，键是节点 ID（数字字符串，如 "1" / "2"），值是节点定义
- 节点定义：{ "class_type": string, "inputs": object }
- inputs 里的连接用 [from_node_id, output_index] 数组：例 "model": ["1", 0] 表示从节点 1 的第 0 个输出连过来
- inputs 里的字面量直接是 string / number / boolean

【硬规则】
1. class_type 必须从下面"可用节点"清单选；写不在清单里的会校验失败。
2. 引用 model / lora / vae / controlnet 必须用"装了的模型清单"里的字面文件名；写不存在的文件会校验失败。
3. workflow 必须包含一个 SaveImage 节点（终止节点）。
4. 所有 [from_id, output_idx] 引用的 from_id 必须存在于本 workflow 里。

【输出格式】（不要 markdown 包裹，不要解释，只输出 JSON）：
{
  "explanation": "中文 2-4 句话说明这个 workflow 做什么、关键节点为什么这么连",
  "workflow": {
    "1": { "class_type": "...", "inputs": { ... } },
    "2": { "class_type": "...", "inputs": { ... } },
    ...
    "N": { "class_type": "SaveImage", "inputs": { "images": ["M", 0], "filename_prefix": "guodong-custom" } }
  }
}`;

/**
 * 校验 LLM 输出的 workflow。返回错误列表（空 = 通过）。
 */
function validateWorkflow(
  workflow: unknown,
  objectInfo: Record<string, ObjectInfoNode>,
): string[] {
  const errors: string[] = [];
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
    errors.push("workflow 不是对象");
    return errors;
  }
  const wf = workflow as Record<string, unknown>;
  const nodeIds = Object.keys(wf);
  if (nodeIds.length === 0) {
    errors.push("workflow 没有任何节点");
    return errors;
  }

  let hasSaveImage = false;
  const enumCache = new Map<string, Set<string>>();

  for (const id of nodeIds) {
    const node = wf[id];
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      errors.push(`节点 "${id}" 不是对象`);
      continue;
    }
    const n = node as { class_type?: unknown; inputs?: unknown };
    if (typeof n.class_type !== "string") {
      errors.push(`节点 "${id}" 缺 class_type`);
      continue;
    }
    if (!objectInfo[n.class_type]) {
      errors.push(`节点 "${id}" class_type "${n.class_type}" 不在节点清单里`);
      continue;
    }
    if (n.class_type === "SaveImage") hasSaveImage = true;
    if (!n.inputs || typeof n.inputs !== "object" || Array.isArray(n.inputs)) {
      errors.push(`节点 "${id}" 缺 inputs 或 inputs 不是对象`);
      continue;
    }

    const meta = objectInfo[n.class_type];
    const inputs = n.inputs as Record<string, unknown>;

    // 检查 required 字段都填了
    for (const reqKey of Object.keys(meta.inputs.required)) {
      if (!(reqKey in inputs)) {
        errors.push(`节点 "${id}" (${n.class_type}) 缺 required 输入: ${reqKey}`);
      }
    }

    // 检查节点引用 + enum 字面值
    for (const [k, v] of Object.entries(inputs)) {
      if (Array.isArray(v) && v.length === 2 && typeof v[0] === "string") {
        const fromId = v[0];
        if (!(fromId in wf)) {
          errors.push(`节点 "${id}".${k} 引用了不存在的节点 "${fromId}"`);
        }
      } else if (typeof v === "string") {
        // enum 校验：从 schema 拿可选值
        const schemaSpec =
          meta.inputs.required[k] ?? meta.inputs.optional[k];
        if (Array.isArray(schemaSpec) && Array.isArray(schemaSpec[0])) {
          const enumKey = `${n.class_type}.${k}`;
          let allowed = enumCache.get(enumKey);
          if (!allowed) {
            allowed = new Set(schemaSpec[0] as string[]);
            enumCache.set(enumKey, allowed);
          }
          if (allowed.size > 0 && !allowed.has(v)) {
            errors.push(
              `节点 "${id}".${k}="${v}" 不在 enum 清单里。可选值前几项: ${Array.from(allowed).slice(0, 3).join(", ")}...`,
            );
          }
        }
      }
    }
  }

  if (!hasSaveImage) {
    errors.push("workflow 必须包含至少一个 SaveImage 节点");
  }

  return errors;
}

export async function composeWorkflow(req: ComposeRequest): Promise<ComposeResult> {
  const maxIter = req.maxIterations ?? 3;
  const errorHistory: string[] = [];
  const objectInfo = await getObjectInfo();
  const { catalog, installedFiles } = await buildNodeCatalog();

  const baseSystem = `${SYSTEM_HEADER}\n\n${catalog}\n\n${installedFiles}`;

  const userMsg = composeUserMessage(req);

  let lastWorkflow: unknown = null;
  let lastExplanation = "";
  let lastModel = "";
  let lastRaw = "";

  for (let iter = 0; iter < maxIter; iter++) {
    const messages: ChatMessage[] = [
      { role: "system", content: baseSystem },
      { role: "user", content: userMsg },
    ];

    if (iter > 0 && lastWorkflow && errorHistory.length > 0) {
      messages.push({
        role: "assistant",
        content: JSON.stringify({
          explanation: lastExplanation,
          workflow: lastWorkflow,
        }),
      });
      messages.push({
        role: "user",
        content: `上一轮 workflow 校验失败：

${errorHistory[errorHistory.length - 1]}

请修复这些问题，重新输出完整 workflow JSON（不是 diff）。`,
      });
    }

    const r = await generateText({
      messages,
      temperature: 0.4,
      maxTokens: 4000,
    });

    if (!r.ok) {
      return {
        ok: false,
        iterations: iter,
        errorHistory,
        error: r.error || "LLM 调用失败",
        model: r.model,
      };
    }
    lastModel = r.model ?? "";
    lastRaw = r.content;

    const parsed = extractJSON<{
      explanation?: string;
      workflow?: unknown;
    }>(r.content);

    if (!parsed?.workflow) {
      errorHistory.push("LLM 输出无法解析为 JSON 或缺 workflow 字段");
      lastWorkflow = null;
      continue;
    }
    lastExplanation = parsed.explanation ?? "";
    lastWorkflow = parsed.workflow;

    const errs = validateWorkflow(parsed.workflow, objectInfo);
    if (errs.length === 0) {
      return {
        ok: true,
        workflow: parsed.workflow as WorkflowJson,
        explanation: lastExplanation,
        iterations: iter + 1,
        errorHistory,
        model: lastModel,
      };
    }
    errorHistory.push(errs.map((e) => `- ${e}`).join("\n"));
  }

  return {
    ok: false,
    iterations: maxIter,
    errorHistory,
    error: `LLM 自纠 ${maxIter} 轮仍校验失败`,
    rawLlm: lastRaw.slice(0, 1500),
    model: lastModel,
  };
}

function composeUserMessage(req: ComposeRequest): string {
  const lines = [`需求：${req.userIntent}`];
  if (req.promptEn) {
    lines.push(`参考英文 prompt：${req.promptEn}`);
  }
  if (req.inputImageName) {
    lines.push(`已上传输入图，文件名 = "${req.inputImageName}"。如果需要 LoadImage 节点，image 字段填这个名字。`);
  }
  lines.push("\n请直接输出 JSON。");
  return lines.join("\n");
}
