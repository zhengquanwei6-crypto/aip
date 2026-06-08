/**
 * v0.17-C3 · LLM 模板填空（"AI 生成工作流"第一阶段）
 *
 * 接到用户中文需求 → LLM 选 1 个模板 + 填 vars。我们不让 LLM 改 workflow
 * 结构，只让它选 + 填，错误面收到最小。
 *
 * 流程：
 *   1. 把 4 个模板的 slug / label / description / vars 摘要塞进 system
 *      prompt（每个模板大概 200 字，4 个 800 字，加 plumbing 总共 1.5k 字）
 *   2. user prompt 是用户的需求 + 可选的 promptEn (来自 prompt-gen 工具)
 *   3. LLM 严格输出 JSON `{ templateSlug, vars, reason }`
 *   4. extractJSON + 校验 templateSlug 存在 + vars 用 normalizeVars 收紧
 *   5. 返回 { ok, template, vars, reason } 给 caller 跑 ComfyUI
 *
 * 失败回路：
 *   - JSON 解析失败 → 直接报错，UI 显示"AI 没听懂，手动选模板"
 *   - templateSlug 不在册 → fallback 到 z-image-turbo（速度优先）
 */
import "server-only";

import { generateText, extractJSON, type ChatMessage } from "@/lib/ai/text";

import {
  TEMPLATE_LIST,
  TEMPLATES,
  normalizeVars,
  type WorkflowTemplate,
} from "./templates";

export interface FillRequest {
  /** 用户原始需求（中文）。 */
  userIntent: string;
  /** 可选：来自 prompt-gen 工具的英文 prompt。 */
  promptEn?: string;
  /** 可选：用户已经选了具体模板（这种情况 LLM 只填 vars）。 */
  forceTemplateSlug?: string;
  /** 可选：用户输入图（i2i / inpaint / canny 用），LLM 知道有图就不会犯傻 */
  hasInputImage?: boolean;
  /** 可选：input_image 文件名（已 uploadImage()）。 */
  inputImageName?: string;
}

export interface FillResult {
  ok: boolean;
  template?: WorkflowTemplate;
  vars?: Record<string, string | number>;
  /** LLM 的中文一句话解释（"为什么选这个模板"）。 */
  reason?: string;
  error?: string;
  rawLlm?: string;
  model?: string;
}

/** 把模板浓缩成 LLM 可读的简介（不含 workflow JSON 本身，只有元数据）。 */
function templatesAsBrief(): string {
  return TEMPLATE_LIST.map((t) => {
    const varsList = t.vars
      .map((v) => {
        const range =
          v.type === "int" || v.type === "float"
            ? ` [${v.min ?? "-"}-${v.max ?? "-"}, default ${v.default ?? "-"}]`
            : v.type === "enum"
            ? ` [enum: ${v.options?.join(" / ")}]`
            : "";
        return `  · ${v.key} (${v.type})${range} — ${v.hint}`;
      })
      .join("\n");
    return `[${t.slug}] ${t.label} · ${t.category} · ~${t.expectedSec}s
  ${t.description}
${varsList}`;
  }).join("\n\n");
}

const SYSTEM_PROMPT_BASE = `你是一个 ComfyUI 工作流选择器 + 参数填空器。

任务：根据用户的中文需求，从下方 4 个模板里选 1 个最合适的，然后给出该模板需要的所有变量值。

可选模板：

${templatesAsBrief()}

【选择规则】
- 用户要"快"、"快速预览"、"探索"、"提案" → z-image-turbo-1step
- 用户要"高质量"、"成片"、"交付"、"细节" → flux-majic-t2i
- 用户上传了线稿 / 草图 / 已有构图，想换风格 → flux-controlnet-canny
- 用户已经有图，只想修脸 → face-detailer-fix

【填空规则】
- prompt: 把用户的中文意图翻译成英文 image prompt（自然语言句式，不堆砌关键词）。如果用户附了 promptEn 字段，就用那个。
- width/height: 看用户描述的画幅。3:4 → 832x1216（Flux）/ 768x1024（Z-Image）。1:1 → 1024x1024。16:9 → 1344x768。
- steps: 用各模板默认值即可（Z-Image 1 / Flux 20）。
- guidance: Flux 默认 3.5，要更贴合 prompt 调到 4-5。
- seed: 0（自动随机）。
- input_image / control_strength: 只有 controlnet / facedetailer 才需要。

【严格输出 JSON】（不要 markdown 包裹，不要任何其它文本）：
{
  "templateSlug": "z-image-turbo-1step",
  "vars": { "prompt": "...", "width": 832, "height": 1216, "seed": 0 },
  "reason": "中文一句话说明为什么选这个 + 关键参数选择依据"
}`;

export async function fillWorkflowWithLLM(req: FillRequest): Promise<FillResult> {
  // 如果用户强制了 slug，跳过模板选择，只填 vars
  if (req.forceTemplateSlug) {
    const t = TEMPLATES[req.forceTemplateSlug];
    if (!t) {
      return {
        ok: false,
        error: `模板不存在: ${req.forceTemplateSlug}`,
      };
    }
    return await fillVarsOnly(t, req);
  }

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT_BASE },
    {
      role: "user",
      content: composeUserMessage(req),
    },
  ];

  const r = await generateText({
    messages,
    temperature: 0.4,
    maxTokens: 1200,
  });

  if (!r.ok) {
    return {
      ok: false,
      error: r.error || "LLM 调用失败",
      model: r.model,
    };
  }

  const parsed = extractJSON<{
    templateSlug?: string;
    vars?: Record<string, unknown>;
    reason?: string;
  }>(r.content);

  if (!parsed?.templateSlug || !parsed.vars) {
    return {
      ok: false,
      error: "LLM 输出不是合法 JSON 或缺 templateSlug / vars",
      rawLlm: r.content?.slice(0, 800),
      model: r.model,
    };
  }

  const template = TEMPLATES[parsed.templateSlug];
  if (!template) {
    return {
      ok: false,
      error: `LLM 选了不存在的模板: ${parsed.templateSlug}`,
      rawLlm: r.content?.slice(0, 400),
      model: r.model,
    };
  }

  // 用户上传了图但 LLM 没填 input_image → 自动补
  const filledVars = { ...parsed.vars };
  if (req.inputImageName && template.vars.some((v) => v.key === "input_image")) {
    if (!filledVars.input_image) filledVars.input_image = req.inputImageName;
  }
  // 用户已给了 promptEn 而 LLM 自创了 prompt → 优先用用户的
  if (req.promptEn && filledVars.prompt && template.vars.some((v) => v.key === "prompt")) {
    // 如果 LLM 的 prompt 看起来比 promptEn 短不少，认为它没采纳，就替换
    const llmPrompt = String(filledVars.prompt);
    if (llmPrompt.length < req.promptEn.length * 0.5) {
      filledVars.prompt = req.promptEn;
    }
  }

  const vars = normalizeVars(template, filledVars);

  return {
    ok: true,
    template,
    vars,
    reason: parsed.reason ?? "(LLM 未给出选择理由)",
    model: r.model,
  };
}

/** 用户已经选了模板，只让 LLM 填 vars。System prompt 缩到只有那个模板。 */
async function fillVarsOnly(
  template: WorkflowTemplate,
  req: FillRequest,
): Promise<FillResult> {
  const varsList = template.vars
    .map((v) => {
      const range =
        v.type === "int" || v.type === "float"
          ? ` [${v.min ?? "-"}-${v.max ?? "-"}, default ${v.default ?? "-"}]`
          : v.type === "enum"
          ? ` [enum: ${v.options?.join(" / ")}]`
          : "";
      return `  · ${v.key} (${v.type})${range} — ${v.hint}`;
    })
    .join("\n");

  const sys = `你是 ComfyUI 工作流参数填空器。模板已固定为 [${template.slug}] ${template.label}。

需要填的变量：
${varsList}

根据用户中文需求填出所有变量。严格输出 JSON：

{
  "vars": { "key": value, ... },
  "reason": "中文一句话解释关键参数选择"
}`;

  const messages: ChatMessage[] = [
    { role: "system", content: sys },
    { role: "user", content: composeUserMessage(req) },
  ];
  const r = await generateText({ messages, temperature: 0.3, maxTokens: 800 });

  if (!r.ok) {
    return { ok: false, error: r.error || "LLM 调用失败", model: r.model };
  }

  const parsed = extractJSON<{ vars?: Record<string, unknown>; reason?: string }>(
    r.content,
  );
  if (!parsed?.vars) {
    return {
      ok: false,
      error: "LLM 输出不是合法 JSON",
      rawLlm: r.content?.slice(0, 400),
      model: r.model,
    };
  }

  const filledVars = { ...parsed.vars };
  if (req.inputImageName && !filledVars.input_image) {
    filledVars.input_image = req.inputImageName;
  }
  if (req.promptEn && filledVars.prompt) {
    const llmPrompt = String(filledVars.prompt);
    if (llmPrompt.length < req.promptEn.length * 0.5) {
      filledVars.prompt = req.promptEn;
    }
  }

  const vars = normalizeVars(template, filledVars);

  return {
    ok: true,
    template,
    vars,
    reason: parsed.reason ?? "(LLM 未给出选择理由)",
    model: r.model,
  };
}

function composeUserMessage(req: FillRequest): string {
  const lines: string[] = [`需求：${req.userIntent}`];
  if (req.promptEn) {
    lines.push(`参考英文 prompt（来自 prompt-gen 工具，强烈建议作为 vars.prompt 直接使用）：${req.promptEn}`);
  }
  if (req.hasInputImage) {
    lines.push(`已上传输入图，文件名 = "${req.inputImageName ?? "(待提供)"}"。`);
  }
  return lines.join("\n");
}
