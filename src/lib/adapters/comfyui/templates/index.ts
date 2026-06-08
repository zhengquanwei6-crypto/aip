/**
 * v0.17-C2 · ComfyUI 内置工作流模板
 *
 * 每个模板基于真实探测到的 ComfyUI 节点目录设计。模型名硬编码到这台机器
 * 实际装的清单（cloudstudio A10 v0.18.1）：
 *   - z_image_turbo_bf16.safetensors  · 1 步 turbo（Z-Image / Lumina2 架构）
 *   - majicflus_v134.safetensors      · Flux 主力 ckpt
 *   - flux_vae.safetensors / ae.safetensors · VAE
 *   - qwen_2.5_vl_7b_fp8_scaled.safetensors · Z-Image 的文本编码器
 *   - clip_l + t5xxl_fp8_e4m3fn         · Flux 的 dual CLIP
 *   - control-lora-canny-rank256.safetensors · ControlNet (LoRA 化)
 *
 * 模板里的 {{placeholder}} 用 `applyPlaceholders(template, vars)` 替换。
 * 占位符规则：纯 token，不能跨字段切割；类型由 schema 保证（数字 / 字符串）。
 *
 * 设计原则：
 *   - 每个模板拿到合法默认参数即可直接跑，不需 LLM 也能用
 *   - LLM 只填 `vars` 表，不动 workflow 结构
 *   - 模板尽可能自包含，少依赖 KJ/RES4LYF 高级节点（保持稳定）
 */

import type { WorkflowJson } from "../client";

export interface TemplateVar {
  key: string;
  label: string;
  /** 类型用来在 UI 里画对应控件，也用来在 LLM fill 时校验。 */
  type: "string" | "int" | "float" | "enum" | "longText";
  /** enum 时的可选值；string/int/float 时填默认值或 placeholder hint 即可。 */
  options?: readonly string[];
  default?: string | number;
  /** 简短中文说明，给 UI 当 tooltip / 给 LLM 当 system prompt 上下文。 */
  hint: string;
  min?: number;
  max?: number;
}

export interface WorkflowTemplate {
  slug: string;
  label: string;
  category: "fast" | "quality" | "controlnet" | "postprocess";
  description: string;
  /** 估计单次运行耗时（秒）。给 UI 显示「预计 8s」用。 */
  expectedSec: number;
  /** 用户可以填的变量。LLM 也只能填这些。 */
  vars: TemplateVar[];
  /**
   * Workflow JSON 模板。值里的 `{{key}}` 在运行时被 vars 对应值替换；
   * 不存在的 key 报错。
   */
  workflow: WorkflowJson;
  /** 哪个节点是最终输出节点（SaveImage），UI 拿它在 history 里挑出图。 */
  outputNodeId: string;
}

/** 实际可用的 sampler / scheduler 子集，供 enum 校验。 */
const SAMPLERS_RECOMMENDED = [
  "euler",
  "euler_ancestral",
  "euler_cfg_pp",
  "dpmpp_2m",
  "dpmpp_2m_sde",
  "dpmpp_3m_sde",
  "uni_pc",
  "ddim",
] as const;

const SCHEDULERS_RECOMMENDED = [
  "simple",
  "sgm_uniform",
  "karras",
  "exponential",
  "beta",
] as const;

/**
 * 1) z-image-turbo · 9 步 res_multistep 出图（官方推荐参数）
 *
 * 适合做缩略图 / 快速提案 / 探索构图。
 *
 * 重要：Z-Image-Turbo 官方工作流要求文本编码器为 `qwen_3_4b.safetensors`
 * （hidden=2560，配 type=lumina2）。这台机器目前装的是
 * `qwen_2.5_vl_7b_fp8_scaled`（hidden=3584）和 `t5xxl_fp8_e4m3fn`，**都和
 * Z-Image 不兼容**。要跑通需先下载：
 *
 *   curl -L https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/\
 *     split_files/text_encoders/qwen_3_4b.safetensors \
 *     -o ComfyUI/models/text_encoders/qwen_3_4b.safetensors
 *
 * 模板架构遵循官方 image_z_image_turbo.json：
 *   UNETLoader → ModelSamplingAuraFlow → KSampler
 *   CLIPLoader(qwen_3_4b, lumina2) → CLIPTextEncode → KSampler positive
 *   ConditioningZeroOut(positive) → KSampler negative
 *   EmptySD3LatentImage → KSampler latent
 *   KSampler → VAEDecode(ae.safetensors) → SaveImage
 */
const T_Z_IMAGE_TURBO: WorkflowTemplate = {
  slug: "z-image-turbo-1step",
  label: "Z-Image Turbo（9 步极速）",
  category: "fast",
  description: "9 步极速出图、3-5 秒。需先在 ComfyUI 装 qwen_3_4b.safetensors。",
  expectedSec: 5,
  outputNodeId: "9",
  vars: [
    {
      key: "prompt",
      label: "正向提示词（中英皆可）",
      type: "longText",
      hint: "描述你想要的画面：主体 + 风格 + 光照 + 构图",
      default:
        "a cozy winter breakfast table, morandi tones, ins style, soft natural light, 3:4",
    },
    {
      key: "width",
      label: "宽度",
      type: "int",
      default: 1024,
      min: 256,
      max: 2048,
      hint: "Z-Image 推荐 1024",
    },
    {
      key: "height",
      label: "高度",
      type: "int",
      default: 1024,
      min: 256,
      max: 2048,
      hint: "Z-Image 推荐 1024",
    },
    {
      key: "steps",
      label: "采样步数",
      type: "int",
      default: 9,
      min: 4,
      max: 20,
      hint: "官方默认 9 步",
    },
    {
      key: "seed",
      label: "随机种子",
      type: "int",
      default: 0,
      hint: "0 = 自动随机，相同种子复现同一张",
    },
  ],
  workflow: {
    "1": {
      class_type: "UNETLoader",
      inputs: {
        unet_name: "z_image_turbo_bf16.safetensors",
        weight_dtype: "default",
      },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: {
        // 必须装 qwen_3_4b.safetensors（hidden=2560）配 type=lumina2。
        // 详见模板文档块。
        clip_name: "qwen_3_4b.safetensors",
        type: "lumina2",
      },
    },
    "3": {
      class_type: "VAELoader",
      // Z-Image 用 ae.safetensors（和 Flux 同款 16 通道 AE）。
      inputs: { vae_name: "ae.safetensors" },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: "{{prompt}}", clip: ["2", 0] },
    },
    "5": {
      // 官方模板的 negative = ConditioningZeroOut(positive)，比空 prompt
      // 更稳（避免 KSampler 在 cfg=1 时 negative 没贡献但占位仍参与）。
      class_type: "ConditioningZeroOut",
      inputs: { conditioning: ["4", 0] },
    },
    "6": {
      class_type: "EmptySD3LatentImage",
      // Z-Image / Lumina 是 16 通道 latent，必须用 EmptySD3LatentImage 而
      // 非 EmptyLatentImage。
      inputs: { width: "{{width}}", height: "{{height}}", batch_size: 1 },
    },
    "10": {
      // 官方模板要求加 ModelSamplingAuraFlow（shift=3），让 z-image 的
      // sigma 调度对齐 AuraFlow 期望的曲线。少了它出图退化严重。
      class_type: "ModelSamplingAuraFlow",
      inputs: { model: ["1", 0], shift: 3 },
    },
    "7": {
      class_type: "KSampler",
      inputs: {
        seed: "{{seed}}",
        steps: "{{steps}}",
        cfg: 1.0,
        sampler_name: "res_multistep",
        scheduler: "simple",
        denoise: 1.0,
        model: ["10", 0],
        positive: ["4", 0],
        negative: ["5", 0],
        latent_image: ["6", 0],
      },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: { samples: ["7", 0], vae: ["3", 0] },
    },
    "9": {
      class_type: "SaveImage",
      inputs: { images: ["8", 0], filename_prefix: "guodong-zturbo" },
    },
  },
};

/**
 * 2) flux-majic-t2i · Flux 主力高质量出图
 *
 * 用 majicflus_v134 + flux_vae + dual CLIP（clip_l + t5xxl_fp8_e4m3fn）。
 * 20 步 + cfg 1.0（Flux 是 distillation 模型，cfg=1.0），sampler euler。
 */
const T_FLUX_T2I: WorkflowTemplate = {
  slug: "flux-majic-t2i",
  label: "Flux 高质量出图（majic）",
  category: "quality",
  description: "高质量 Flux 通用出图。8-15 秒，适合最终交付。",
  expectedSec: 12,
  outputNodeId: "9",
  vars: [
    {
      key: "prompt",
      label: "正向提示词",
      type: "longText",
      hint: "Flux 喜欢长描述、自然语言句式，避免堆砌关键词",
      default:
        "a cozy winter breakfast table, hand-thrown ceramic mug with steaming oat latte, linen napkin, walnut texture, morandi tones, soft window light, 3:4 magazine composition, masterpiece, intricate details",
    },
    {
      key: "width",
      label: "宽度",
      type: "int",
      default: 832,
      min: 512,
      max: 1536,
      hint: "推荐 832 / 1024 / 1216 / 1344",
    },
    {
      key: "height",
      label: "高度",
      type: "int",
      default: 1216,
      min: 512,
      max: 1536,
      hint: "推荐 1216 (3:4) / 1024 (1:1) / 832 (4:3 横)",
    },
    {
      key: "steps",
      label: "采样步数",
      type: "int",
      default: 20,
      min: 4,
      max: 50,
      hint: "Flux 推荐 20，再多边际收益小",
    },
    {
      key: "guidance",
      label: "Flux Guidance",
      type: "float",
      default: 3.5,
      min: 1.0,
      max: 10.0,
      hint: "Flux 专属 guidance（不是 cfg），3.5 是默认",
    },
    {
      key: "seed",
      label: "随机种子",
      type: "int",
      default: 0,
      hint: "0 = 自动随机",
    },
    {
      key: "sampler",
      label: "采样器",
      type: "enum",
      options: SAMPLERS_RECOMMENDED,
      default: "euler",
      hint: "Flux 默认 euler，要更稳可选 dpmpp_2m",
    },
    {
      key: "scheduler",
      label: "调度器",
      type: "enum",
      options: SCHEDULERS_RECOMMENDED,
      default: "simple",
      hint: "Flux 配 simple 最稳",
    },
  ],
  workflow: {
    "1": {
      class_type: "UNETLoader",
      inputs: {
        unet_name: "majicflus_v134.safetensors",
        weight_dtype: "fp8_e4m3fn",
      },
    },
    "2": {
      class_type: "DualCLIPLoader",
      inputs: {
        // 这台机器只装了 t5xxl_fp8_e4m3fn（不是 fp16）。
        clip_name1: "clip_l.safetensors",
        clip_name2: "t5xxl_fp8_e4m3fn.safetensors",
        type: "flux",
      },
    },
    "3": {
      class_type: "VAELoader",
      // majicflus 是 Flux 1 dev 微调，用 flux_vae（flux2-vae 是 Flux 2 专用）。
      inputs: { vae_name: "flux_vae.safetensors" },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: "{{prompt}}", clip: ["2", 0] },
    },
    "5": {
      class_type: "FluxGuidance",
      inputs: { conditioning: ["4", 0], guidance: "{{guidance}}" },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: "", clip: ["2", 0] },
    },
    "7": {
      class_type: "EmptyLatentImage",
      inputs: { width: "{{width}}", height: "{{height}}", batch_size: 1 },
    },
    "8": {
      class_type: "KSampler",
      inputs: {
        seed: "{{seed}}",
        steps: "{{steps}}",
        cfg: 1.0,
        sampler_name: "{{sampler}}",
        scheduler: "{{scheduler}}",
        denoise: 1.0,
        model: ["1", 0],
        positive: ["5", 0],
        negative: ["6", 0],
        latent_image: ["7", 0],
      },
    },
    "10": {
      class_type: "VAEDecode",
      inputs: { samples: ["8", 0], vae: ["3", 0] },
    },
    "9": {
      class_type: "SaveImage",
      inputs: { images: ["10", 0], filename_prefix: "guodong-flux" },
    },
  },
};

/**
 * 3) flux-controlnet-canny · 用线稿引导 Flux 出图
 *
 * 上传一张线稿 → control-lora-canny → Flux 渲染。适合有草图 / 参考线稿
 * 想换风格保留构图。
 */
const T_FLUX_CANNY: WorkflowTemplate = {
  slug: "flux-controlnet-canny",
  label: "Flux + Canny 线稿引导",
  category: "controlnet",
  description: "上传线稿，保留构图换风格。10-15 秒。",
  expectedSec: 14,
  outputNodeId: "12",
  vars: [
    {
      key: "input_image",
      label: "线稿（已上传到 ComfyUI input/）",
      type: "string",
      hint: "通过 uploadImage() 拿到 name 后填到这里",
      default: "example.png",
    },
    {
      key: "prompt",
      label: "正向提示词",
      type: "longText",
      hint: "描述你想让 AI 把这张线稿渲染成的样子",
      default: "watercolor painting on warm beige paper, morandi palette, soft natural light",
    },
    {
      key: "control_strength",
      label: "ControlNet 强度",
      type: "float",
      default: 0.7,
      min: 0.1,
      max: 1.5,
      hint: "0.7 通常足够；越大越贴近线稿",
    },
    {
      key: "steps",
      label: "采样步数",
      type: "int",
      default: 20,
      min: 4,
      max: 50,
      hint: "Flux 默认 20",
    },
    {
      key: "seed",
      label: "随机种子",
      type: "int",
      default: 0,
      hint: "0 = 自动",
    },
  ],
  workflow: {
    "1": {
      class_type: "UNETLoader",
      inputs: {
        unet_name: "majicflus_v134.safetensors",
        weight_dtype: "fp8_e4m3fn",
      },
    },
    "2": {
      class_type: "DualCLIPLoader",
      inputs: {
        clip_name1: "clip_l.safetensors",
        clip_name2: "t5xxl_fp8_e4m3fn.safetensors",
        type: "flux",
      },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: "flux_vae.safetensors" },
    },
    "4": {
      class_type: "LoadImage",
      inputs: { image: "{{input_image}}" },
    },
    "5": {
      class_type: "ControlNetLoader",
      inputs: { control_net_name: "control-lora-canny-rank256.safetensors" },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: "{{prompt}}", clip: ["2", 0] },
    },
    "7": {
      class_type: "FluxGuidance",
      inputs: { conditioning: ["6", 0], guidance: 3.5 },
    },
    "8": {
      class_type: "CLIPTextEncode",
      inputs: { text: "", clip: ["2", 0] },
    },
    "9": {
      class_type: "ControlNetApply",
      inputs: {
        conditioning: ["7", 0],
        control_net: ["5", 0],
        image: ["4", 0],
        strength: "{{control_strength}}",
      },
    },
    "10": {
      class_type: "EmptyLatentImage",
      inputs: { width: 1024, height: 1024, batch_size: 1 },
    },
    "11": {
      class_type: "KSampler",
      inputs: {
        seed: "{{seed}}",
        steps: "{{steps}}",
        cfg: 1.0,
        sampler_name: "euler",
        scheduler: "simple",
        denoise: 1.0,
        model: ["1", 0],
        positive: ["9", 0],
        negative: ["8", 0],
        latent_image: ["10", 0],
      },
    },
    "13": {
      class_type: "VAEDecode",
      inputs: { samples: ["11", 0], vae: ["3", 0] },
    },
    "12": {
      class_type: "SaveImage",
      inputs: { images: ["13", 0], filename_prefix: "guodong-flux-canny" },
    },
  },
};

/**
 * 4) face-detailer-fix · 修脸（ImpactPack FaceDetailer）
 *
 * 输入一张已生成的图 → FaceDetailer 自动检测人脸 → 局部 inpaint → 输出。
 * 不需要文本 prompt（用图自身的隐式 conditioning）。
 *
 * NOTE: ImpactPack 的具体节点 schema 在不同 commit 之间会变；这个模板
 * 保留了最常见的字段，跑不通时 LLM 可以根据 /object_info 自纠（C6 阶段）。
 */
const T_FACE_DETAILER: WorkflowTemplate = {
  slug: "face-detailer-fix",
  label: "FaceDetailer 修脸",
  category: "postprocess",
  description: "已生成的图自动修脸。5-10 秒，适合后处理。",
  expectedSec: 8,
  outputNodeId: "5",
  vars: [
    {
      key: "input_image",
      label: "原图（已上传到 ComfyUI input/）",
      type: "string",
      hint: "需要 uploadImage() 后拿 name",
      default: "example.png",
    },
    {
      key: "denoise",
      label: "重绘强度",
      type: "float",
      default: 0.4,
      min: 0.1,
      max: 1.0,
      hint: "0.4 适合微调，0.7+ 才会大改",
    },
    {
      key: "seed",
      label: "随机种子",
      type: "int",
      default: 0,
      hint: "0 = 自动",
    },
  ],
  workflow: {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "babesIllustriousBy_v55FP16.safetensors" },
    },
    "2": {
      class_type: "LoadImage",
      inputs: { image: "{{input_image}}" },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: "highly detailed face, sharp eyes, clear skin", clip: ["1", 1] },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: "blurry, distorted, watermark", clip: ["1", 1] },
    },
    "6": {
      class_type: "FaceDetailer",
      inputs: {
        image: ["2", 0],
        model: ["1", 0],
        clip: ["1", 1],
        vae: ["1", 2],
        positive: ["3", 0],
        negative: ["4", 0],
        guide_size: 384,
        guide_size_for: true,
        max_size: 1024,
        seed: "{{seed}}",
        steps: 20,
        cfg: 7.0,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: "{{denoise}}",
        feather: 5,
        noise_mask: true,
        force_inpaint: true,
        bbox_threshold: 0.5,
        bbox_dilation: 10,
        bbox_crop_factor: 3.0,
      },
    },
    "5": {
      class_type: "SaveImage",
      inputs: { images: ["6", 0], filename_prefix: "guodong-face-fix" },
    },
  },
};

/** 模板注册表。前端 / LLM / API 都从这里拿。 */
export const TEMPLATES: Record<string, WorkflowTemplate> = {
  [T_Z_IMAGE_TURBO.slug]: T_Z_IMAGE_TURBO,
  [T_FLUX_T2I.slug]: T_FLUX_T2I,
  [T_FLUX_CANNY.slug]: T_FLUX_CANNY,
  [T_FACE_DETAILER.slug]: T_FACE_DETAILER,
};

export const TEMPLATE_LIST: WorkflowTemplate[] = Object.values(TEMPLATES);

export function getTemplate(slug: string): WorkflowTemplate | null {
  return TEMPLATES[slug] ?? null;
}

/**
 * 把模板里的 `{{key}}` 占位符替换为 vars 里对应的值。
 *
 * - 字符串值直接替换
 * - 数字值的占位符如果是字符串字段（"{{seed}}"），会替换成数字（如果整字段
 *   只是占位符），否则按字符串拼接
 * - vars 缺 key 时报错（避免 silent default）
 * - seed=0 时自动用 Math.random() 给个新种子
 */
export function applyPlaceholders(
  template: WorkflowTemplate,
  vars: Record<string, string | number>,
): WorkflowJson {
  // 0 → random seed
  const filled: Record<string, string | number> = { ...vars };
  if ("seed" in filled) {
    const s = Number(filled.seed);
    if (!Number.isFinite(s) || s === 0) {
      filled.seed = Math.floor(Math.random() * 2 ** 31);
    }
  }

  const out: WorkflowJson = {};
  for (const [nodeId, node] of Object.entries(template.workflow)) {
    out[nodeId] = {
      class_type: node.class_type,
      inputs: substituteValues(node.inputs, filled),
      _meta: node._meta,
    };
  }
  return out;
}

function substituteValues(
  obj: Record<string, unknown>,
  vars: Record<string, string | number>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = substituteValue(v, vars);
  }
  return result;
}

function substituteValue(
  v: unknown,
  vars: Record<string, string | number>,
): unknown {
  if (typeof v === "string") {
    // 整字段是占位符 → 直接换成 raw 值（保持类型）
    const m = /^\{\{(\w+)\}\}$/.exec(v);
    if (m) {
      const key = m[1];
      if (!(key in vars)) {
        throw new Error(`workflow placeholder {{${key}}} has no provided value`);
      }
      return vars[key];
    }
    // 字符串里有占位符 → 字符串模板
    return v.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      if (!(key in vars)) {
        throw new Error(`workflow placeholder {{${key}}} has no provided value`);
      }
      return String(vars[key]);
    });
  }
  if (Array.isArray(v)) return v.map((x) => substituteValue(x, vars));
  return v;
}

/**
 * 用模板的 default 值补全 vars，让单条 vars 总是合法。
 * 校验类型 / 范围；越界值替换为 default。
 */
export function normalizeVars(
  template: WorkflowTemplate,
  vars: Record<string, unknown>,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const v of template.vars) {
    const raw = vars[v.key];
    if (v.type === "int") {
      let n = Number(raw);
      if (!Number.isFinite(n)) n = Number(v.default ?? 0);
      if (typeof v.min === "number" && n < v.min) n = v.min;
      if (typeof v.max === "number" && n > v.max) n = v.max;
      out[v.key] = Math.floor(n);
    } else if (v.type === "float") {
      let n = Number(raw);
      if (!Number.isFinite(n)) n = Number(v.default ?? 0);
      if (typeof v.min === "number" && n < v.min) n = v.min;
      if (typeof v.max === "number" && n > v.max) n = v.max;
      out[v.key] = n;
    } else if (v.type === "enum") {
      const s = String(raw ?? v.default ?? v.options?.[0] ?? "");
      out[v.key] = v.options?.includes(s) ? s : String(v.options?.[0] ?? s);
    } else {
      out[v.key] = String(raw ?? v.default ?? "");
    }
  }
  return out;
}
