/**
 * v0.16-K1 · POST /api/ai-tools/prompt-gen (优化版)
 *
 * 提示词生成器：把用户简单中文主题 → 平台调性 image prompt × N
 *
 * v0.15-k → v0.16-K1 升级点：
 *   1. **多语言输出**：language 字段 'en' | 'zh' | 'both' (默认 'en')
 *   2. **结构化 prompt**：每条 prompt 拆成 subject / style / lighting /
 *      composition / quality / negative / cameraAngle 字段，promptEn /
 *      promptZh 由 LLM 把字段拼接成最终可用字符串。
 *   3. **MJ 命令直出**：mjCommand = `prompt --ar X:Y --v 6`，复制即可用
 *   4. **多样化兜底**：N 条强制使用 N 个不同的 cameraAngle，避免雷同
 *   5. **加 negative prompt**：SD/Flux 用户必备
 *   6. **6 平台**：原 4 + 抖音 (9:16 dynamic) + 淘宝主图 (1:1 high contrast)
 *
 * 用户场景: 复制 prompt 到 Midjourney / Stable Diffusion / Flux / DALL-E
 *
 * 入参:
 *   {
 *     theme: string,                      // 主题（中文，≤200）
 *     platform: 'xiaohongshu'|'xianyu'|'qianniu'|'douyin'|'taobao'|'general',
 *     count?: 3 | 5 | 10,                 // 默认 5
 *     language?: 'en' | 'zh' | 'both',    // 默认 'en'，新功能
 *     stylePresetId?: string,
 *     useStyleGenome?: boolean,           // 默认 true (走 v0.16-H1 注入)
 *   }
 *
 * 出参:
 *   { ok: true, prompts: GeneratedPrompt[], language, platformLabel, ... }
 *   | { ok: false, error }
 *
 * 0 IMAGE 调用 (纯文本)，0 schema 改动；type 仍是 'prompt-gen'。
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateText, extractJSON, type ChatMessage } from '@/lib/ai/text';
import { injectGenomeIntoMessages } from '@/lib/style-genome/inject';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Platform =
  | 'xiaohongshu'
  | 'xianyu'
  | 'qianniu'
  | 'douyin'
  | 'taobao'
  | 'general';

type Language = 'en' | 'zh' | 'both';

interface PlatformProfile {
  visualKeywords: string;
  defaultAspectRatio: string;
  defaultSize: string;
  cnLabel: string;
  /** N 条之间强制 rotate 的镜头视角池 — 多样性保证。 */
  cameraAnglePool: readonly string[];
}

const PLATFORM_PROFILES: Record<Platform, PlatformProfile> = {
  xiaohongshu: {
    visualKeywords:
      'soft natural light, muted pastel palette (Morandi tones), lifestyle aesthetic, ins-style, minimalist composition, gentle bokeh, photogenic plating, paper texture overlay',
    defaultAspectRatio: '3:4',
    defaultSize: '1024x1536',
    cnLabel: '小红书（莫兰迪 / ins / 文艺）',
    cameraAnglePool: [
      'overhead flat-lay shot',
      'close-up macro detail',
      '3/4 hero angle',
      'side profile lifestyle shot',
      'over-the-shoulder candid',
      'eye-level full scene',
      'high-angle 45° tabletop',
      'bird-eye top-down',
      'window-light backlit shot',
      'low-angle minimal hero',
    ],
  },
  xianyu: {
    visualKeywords:
      'studio product shot, white seamless background, clean lighting, sharp focus, e-commerce style, neutral backdrop, flat shadow, centered composition, no clutter',
    defaultAspectRatio: '1:1',
    defaultSize: '1024x1024',
    cnLabel: '闲鱼（白底 / 商品 / 电商）',
    cameraAnglePool: [
      'front-on centered shot',
      '3/4 product angle',
      'overhead flat-lay',
      'close-up detail crop',
      'side profile silhouette',
      'low-angle hero shot',
      'rotated 30° dynamic angle',
      'top-down isometric layout',
      'macro texture detail',
      'eye-level neutral framing',
    ],
  },
  qianniu: {
    visualKeywords:
      'professional product scene, brand-aligned, high-end commercial photography, dramatic lighting, premium materials, depth of field, magazine-grade composition, atmospheric mood',
    defaultAspectRatio: '16:9',
    defaultSize: '1536x1024',
    cnLabel: '千牛（场景 / 品牌 / 高端）',
    cameraAnglePool: [
      'wide environmental shot',
      'cinematic 3/4 angle',
      'tight hero close-up',
      'low-angle dramatic shot',
      'dolly tracking-style frame',
      'symmetrical centered composition',
      'over-shoulder editorial',
      'macro material detail',
      'high-key minimal hero',
      'side-light atmospheric',
    ],
  },
  douyin: {
    visualKeywords:
      'high-energy vertical composition, vivid saturated colors, motion blur hint, dynamic angles, eye-catching focal point, bold contrast, modern editorial, social-media optimised, scroll-stopping visual',
    defaultAspectRatio: '9:16',
    defaultSize: '1024x1536',
    cnLabel: '抖音（竖屏 / 高饱和 / 动感）',
    cameraAnglePool: [
      'dynamic low-angle dutch tilt',
      'first-person POV close-up',
      'over-the-shoulder action shot',
      'high-contrast hero portrait',
      'wide vertical environmental',
      'extreme close-up macro',
      'side-tracking motion frame',
      'top-down dramatic crop',
      '3/4 dynamic action angle',
      'bird-eye vertical composition',
    ],
  },
  taobao: {
    visualKeywords:
      'high-saturation product hero, bold key-light, white-or-color backdrop, sharp e-commerce focus, clear value proposition, glossy finish, banner-ready composition, attention-grabbing',
    defaultAspectRatio: '1:1',
    defaultSize: '1024x1024',
    cnLabel: '淘宝主图（高饱和 / 商品 banner）',
    cameraAnglePool: [
      'centered hero shot with breathing room',
      'rotated 15° dynamic angle',
      'bottom-quarter product placement',
      '3/4 overhead with shadow',
      'close-up detail crop',
      'symmetrical front-on shot',
      'low-angle hero composition',
      'top-down product flat-lay',
      'side-light glossy finish',
      'split-frame contrast composition',
    ],
  },
  general: {
    visualKeywords:
      'high quality, detailed, well composed, balanced lighting, magazine-grade clarity',
    defaultAspectRatio: '16:9',
    defaultSize: '1536x1024',
    cnLabel: '通用（自由风格）',
    cameraAnglePool: [
      'wide establishing shot',
      'medium 3/4 angle',
      'close-up hero',
      'overhead flat-lay',
      'low-angle dramatic',
      'side profile composition',
      'eye-level natural',
      'top-down geometric',
      'dolly tracking-style frame',
      'macro detail crop',
    ],
  },
};

const LANGUAGE_LABELS: Record<Language, string> = {
  en: '仅英文（适合 MJ / SD / Flux 直接出图）',
  zh: '仅中文（适合本地 RAG / 中文图模 / 设计沟通）',
  both: '中英文双语（英文用于出图，中文用于人工核对）',
};

interface GeneratedPrompt {
  /** Final prompt strings — 按 language 决定哪个非空。 */
  promptEn: string;
  promptZh: string;
  /**
   * 各生图模型的可复制字符串。后端派生（无 LLM 调用），前端 chip
   * 切换决定哪个被复制。键名见 buildModelOutputs() 函数注释。
   */
  modelOutputs: Record<string, string>;
  /** Midjourney 完整命令字符串（兼容字段：保留供旧客户端读，也可丢弃）。 */
  mjCommand: string;
  /** 风格标签（中文，≤20 字），如"侧拍特写"。 */
  style: string;
  /** 镜头视角（英文，从 cameraAnglePool 取），UI 当 chip 展示。 */
  cameraAngle: string;
  /** SD / Flux 用的负向描述，仅英文。 */
  negativePrompt: string;
  /** 长宽比，跟着平台默认值。 */
  aspectRatio: string;
}

function buildSystemPrompt(
  platform: Platform,
  count: number,
  language: Language,
  rotatedAngles: readonly string[],
): string {
  const profile = PLATFORM_PROFILES[platform];

  const langDirective =
    language === 'en'
      ? '只输出英文 promptEn 字段；promptZh 留空字符串 ""。'
      : language === 'zh'
      ? '只输出中文 promptZh 字段；promptEn 留空字符串 ""。注意中文 prompt 要包含同样多的视觉细节（光照 / 构图 / 色彩 / 材质），不要简化。'
      : '同时输出英文 promptEn 与中文 promptZh，二者描述同一画面，不要中英文夹杂、不要互译失真。';

  const angleDirective = rotatedAngles
    .map((a, i) => `第 ${i + 1} 条必须使用：${a}`)
    .join('\n');

  return `你是一个专业的 AI 图像生成提示词工程师，专门为「${profile.cnLabel}」平台优化提示词。

平台调性关键词：${profile.visualKeywords}
默认画面比例：${profile.defaultAspectRatio}（${profile.defaultSize}）

任务：基于用户给出的主题，生成 ${count} 条**完全不同**的 image prompt。

【输出语言】
${langDirective}

【每条 prompt 内容】
- subject：主题核心元素（人 / 物 / 场景 / 关键道具）
- style：用 4–10 字中文风格标签（如"侧拍特写""俯拍平铺""全景氛围""低角度英雄镜头"）
- lighting：光照方案（自然光 / 影棚 / 顶光 / 侧逆光 / 戏剧光 等）
- composition：构图方式（居中 / 三分 / 引导线 / 留白 / 对称 等）
- quality：画质 / 材质 / 色彩描述
- cameraAngle：镜头视角（必须严格使用下方分配给该条的英文角度词）

【N 条之间的 cameraAngle 强制分配】
${angleDirective}

【negativePrompt 规则】
每条都给一段简短的负向 prompt（英文，≤30 token），描述要避免的视觉问题，比如：
"blurry, low contrast, oversaturated, cluttered background, watermark, distorted hands, extra limbs"
避免与 subject 直接冲突。

【关于英文 prompt 长度】
- promptEn：30–80 个英文 token，包含 subject + style + lighting + composition + quality + cameraAngle
- 适合 Midjourney v6 / Stable Diffusion XL / Flux / DALL·E 3 直接使用
- 不要包含 --ar / --v / --style 等参数（系统会自动追加）

【关于中文 prompt】
- 当 language='zh' 或 'both' 时，promptZh 必须信息量 == promptEn，不是简单翻译
- 写作风格用设计师沟通语气，不要营销腔

严格输出 JSON（不要任何其它文本，不要 markdown 包裹）：
{
  "prompts": [
    {
      "promptEn": "...",
      "promptZh": "...",
      "style": "...",
      "cameraAngle": "${rotatedAngles[0]}",
      "negativePrompt": "...",
      "aspectRatio": "${profile.defaultAspectRatio}"
    }
    // ${count} 条共 ${count} 个对象
  ]
}`;
}

/** 从池里挑 N 个不同的 cameraAngle；池不够时允许重复（极少见）。 */
function rotateAngles(
  pool: readonly string[],
  n: number,
  seedSeed: number,
): string[] {
  if (pool.length === 0) return Array.from({ length: n }, () => 'medium shot');
  // 简单确定性洗牌：用 (seedSeed + i) % len 当起点，避免连续同一池起点。
  const start = ((seedSeed | 0) + 7) % pool.length;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(pool[(start + i) % pool.length]);
  }
  return out;
}

/** 把 promptEn + aspectRatio 拼成 MJ v7 风格的完整命令。 */
function buildMjCommand(
  promptEn: string,
  aspectRatio: string,
  negativePrompt: string,
): string {
  if (!promptEn) return '';
  // MJ v7 是当前最新版（2025 起），用它替代之前的 v6。
  // --no 字段对每个负向元素只取关键词（去掉冗余形容词），避免 MJ 警告。
  const noFlag = negativePrompt
    ? ` --no ${negativePrompt
        .split(/[,，]/)
        .map((s) => s.trim().split(/\s+/).slice(0, 2).join(' '))
        .filter((s) => s.length > 0)
        .slice(0, 6)
        .join(', ')}`
    : '';
  return `${promptEn} --ar ${aspectRatio} --v 7 --style raw --s 250${noFlag}`;
}

/** 把 aspectRatio 转成 OpenAI gpt-image-1 / gpt-image-2 的 size 枚举字面值。
 *  这两条枚举完全相同（1024x1024 / 1024x1536 / 1536x1024 / auto），所以共用。 */
function aspectToGptImageSize(aspectRatio: string): string {
  switch (aspectRatio) {
    case '1:1':
      return '1024x1024';
    case '3:4':
    case '9:16':
    case '2:3':
      return '1024x1536';
    case '4:3':
    case '16:9':
    case '3:2':
      return '1536x1024';
    default:
      return '1024x1024';
  }
}

/** 把 aspectRatio 转成 DALL·E 3 的 size 枚举字面值（1024x1024 / 1024x1792 / 1792x1024）。 */
function aspectToDalle3Size(aspectRatio: string): string {
  switch (aspectRatio) {
    case '1:1':
      return '1024x1024';
    case '3:4':
    case '9:16':
    case '2:3':
      return '1024x1792';
    case '4:3':
    case '16:9':
    case '3:2':
      return '1792x1024';
    default:
      return '1024x1024';
  }
}

/**
 * 给 7 大主流生图模型派生可复制字符串。零 LLM 调用成本 — 纯字符串拼接。
 *
 * 键名约定（保持与前端 chip 选择一致）：
 *   - `midjourney`   · Midjourney v7（命令式 inline flag）
 *   - `flux`         · Flux 1.1 Pro / Flux 2 / Flux Dev（纯 prompt，BFL Playground / fal.ai）
 *   - `sd`           · Stable Diffusion 3.5 / SDXL（Prompt + Negative 两段）
 *   - `gpt-image-2`  · KIE GPT-Image-2（项目核心使用模型 · size 同 gpt-image-1）
 *   - `gpt-image-1`  · OpenAI GPT-Image-1（与 gpt-image-2 size 枚举相同）
 *   - `dalle-3`      · OpenAI DALL·E 3（size 枚举不同：1792x1024 / 1024x1792）
 *   - `imagen`       · Google Imagen 3（纯 prompt + aspectRatio 注释）
 *   - `qwen-image`   · 阿里 Qwen-Image（中文优先，降级英文）
 *
 * 设计原则：每条字符串复制后必须能直接喂给目标平台的 prompt 输入框 / API
 * `prompt` 字段，参数 / 长宽比通过注释或 inline flag 一并带上。
 */
function buildModelOutputs(args: {
  promptEn: string;
  promptZh: string;
  negativePrompt: string;
  aspectRatio: string;
}): Record<string, string> {
  const { promptEn, promptZh, negativePrompt, aspectRatio } = args;

  const out: Record<string, string> = {};

  // 1) Midjourney v7
  out.midjourney = buildMjCommand(promptEn, aspectRatio, negativePrompt);

  // 2) Flux — BFL playground / fal.ai 纯 prompt 输入框，aspect_ratio 单独 UI
  //    选。复制 prompt 时附一行 `# aspect_ratio: ...` 当注释，方便用户记。
  if (promptEn) {
    out.flux =
      `${promptEn}\n\n# aspect_ratio: ${aspectRatio} · prompt_strength: 0.85` +
      (negativePrompt ? `\n# (Flux 没有原生 negative；可在 fal.ai/ComfyUI 走 separate field：${negativePrompt})` : '');
  } else {
    out.flux = '';
  }

  // 3) Stable Diffusion 3.5 / SDXL — Prompt: + Negative: 两段最通用
  if (promptEn) {
    out.sd =
      `Prompt: ${promptEn}\n\nNegative: ${negativePrompt || '(empty)'}\n\n# aspect: ${aspectRatio} · steps: 28 · cfg: 5.0 · sampler: dpm++_2m_karras`;
  } else {
    out.sd = '';
  }

  // 4) KIE GPT-Image-2 — 项目核心模型。size 枚举同 gpt-image-1，4 选 1。
  //    访问入口走 KIE adapter；prompt 字段直接喂英文 prompt。
  if (promptEn) {
    out['gpt-image-2'] =
      `${promptEn}\n\n# size: ${aspectToGptImageSize(aspectRatio)} · quality: high · model: gpt-image-2 (KIE adapter)`;
  } else {
    out['gpt-image-2'] = '';
  }

  // 5) OpenAI GPT-Image-1 — 跟 gpt-image-2 size 枚举一致；模型名不同。
  if (promptEn) {
    out['gpt-image-1'] =
      `${promptEn}\n\n# size: ${aspectToGptImageSize(aspectRatio)} · quality: high · model: gpt-image-1 (OpenAI Images API)`;
  } else {
    out['gpt-image-1'] = '';
  }

  // 6) OpenAI DALL·E 3 — 不同 size 枚举（1792x1024 / 1024x1792）。
  if (promptEn) {
    out['dalle-3'] =
      `${promptEn}\n\n# size: ${aspectToDalle3Size(aspectRatio)} · quality: hd · style: vivid · model: dall-e-3`;
  } else {
    out['dalle-3'] = '';
  }

  // 7) Google Imagen 3 — 纯 prompt + aspectRatio enum 注释
  if (promptEn) {
    out.imagen = `${promptEn}\n\n# aspectRatio: ${aspectRatio} · personGeneration: allow_adult`;
  } else {
    out.imagen = '';
  }

  // 8) Qwen-Image — 中文友好；中文存在则用中文，否则降级英文
  out['qwen-image'] = promptZh || promptEn;

  return out;
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const theme = String(body?.theme || '').trim();
    const platform = String(body?.platform || 'general') as Platform;
    const requestedCount = Number(body?.count) || 5;
    const count = [3, 5, 10].includes(requestedCount) ? requestedCount : 5;
    const language = (
      ['en', 'zh', 'both'].includes(String(body?.language))
        ? String(body?.language)
        : 'en'
    ) as Language;

    if (!theme) {
      return NextResponse.json({ ok: false, error: '请输入主题' }, { status: 400 });
    }
    if (theme.length > 200) {
      return NextResponse.json(
        { ok: false, error: '主题不能超过 200 字' },
        { status: 400 },
      );
    }
    if (!PLATFORM_PROFILES[platform]) {
      return NextResponse.json(
        { ok: false, error: '平台参数不合法' },
        { status: 400 },
      );
    }

    const profile = PLATFORM_PROFILES[platform];

    // 用主题字符长度做种子，让相同主题落到相同的 angle rotation，便于复现。
    const angles = rotateAngles(
      profile.cameraAnglePool,
      count,
      theme.length,
    );

    const sysPrompt = buildSystemPrompt(platform, count, language, angles);

    const messages: ChatMessage[] = [
      { role: 'system', content: sysPrompt },
      {
        role: 'user',
        content: `主题：${theme}\n\n请输出 ${count} 条 prompt（语言模式：${language}）。`,
      },
    ];

    // v0.16-H1 genome injection (soft, fail-silent)
    const __sg = await injectGenomeIntoMessages(messages as any, {
      skip: (body as any)?.useStyleGenome === false,
    }).catch(() => ({ messages: messages as any[], applied: false }));

    const r = await generateText({
      messages: __sg.messages as any,
      temperature: 0.85,
      maxTokens: 2400,
      // 不强制 response_format JSON：池里 priority 最高的 qwen3.5-397b-a17b
      // 不可靠地支持 response_format=json_object，会回空 content。改用
      // prompt 显式 JSON 约束 + extractJSON() 多策略 parse 兜底。
      // 如果未来切到 gpt-4o / claude-3 等支持 json mode 的模型，可重新打开。
    });

    if (!r.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: r.error || 'LLM 调用失败',
          model: r.model,
          timing: { totalMs: Date.now() - t0 },
        },
        { status: 200 },
      );
    }

    const parsed = extractJSON<{ prompts: Partial<GeneratedPrompt>[] }>(r.content);
    if (!parsed || !Array.isArray(parsed.prompts) || parsed.prompts.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'LLM 输出不是合法 JSON 或 prompts 为空',
          // raw 截到 1500 字符，便于排查模型不听话时的真实输出
          raw: (r.content || '').slice(0, 1500) || '(LLM returned empty content)',
          model: r.model,
          timing: { totalMs: Date.now() - t0 },
        },
        { status: 200 },
      );
    }

    // 清洗 + 字段补全 + MJ 命令计算 + 6 模型 outputs 派生
    const prompts: GeneratedPrompt[] = parsed.prompts
      .slice(0, count)
      .map((raw, i) => {
        const promptEn = String(raw.promptEn || '').slice(0, 800);
        const promptZh = String(raw.promptZh || '').slice(0, 600);
        const aspectRatio = String(
          raw.aspectRatio || profile.defaultAspectRatio,
        ).slice(0, 16);
        const negativePrompt = String(raw.negativePrompt || '').slice(0, 400);
        const modelOutputs = buildModelOutputs({
          promptEn,
          promptZh,
          negativePrompt,
          aspectRatio,
        });
        return {
          promptEn,
          promptZh,
          style: String(raw.style || '').slice(0, 60),
          cameraAngle: String(
            raw.cameraAngle || angles[i] || 'medium shot',
          ).slice(0, 80),
          negativePrompt,
          aspectRatio,
          mjCommand: modelOutputs.midjourney,
          modelOutputs,
        };
      })
      .filter((p) => {
        if (language === 'en' || language === 'both') return p.promptEn.length > 0;
        if (language === 'zh') return p.promptZh.length > 0;
        return false;
      });

    if (prompts.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: '生成结果为空，请换个主题再试',
          timing: { totalMs: Date.now() - t0 },
        },
        { status: 200 },
      );
    }

    // 写 AIOutput 历史 (fire-and-forget; 失败不影响响应)
    try {
      await prisma.aIOutput.create({
        data: {
          type: 'prompt-gen',
          input: JSON.stringify({ theme, platform, count, language }),
          output: JSON.stringify({ prompts }),
          model: r.model || 'llm',
        },
      });
    } catch (e) {
      console.warn('[prompt-gen/persist]', (e as Error).message);
    }

    return NextResponse.json({
      ok: true,
      theme,
      platform,
      platformLabel: profile.cnLabel,
      language,
      languageLabel: LANGUAGE_LABELS[language],
      count: prompts.length,
      prompts,
      timing: { totalMs: Date.now() - t0 },
      model: r.model,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: `服务端异常：${(err as Error).message}`,
        timing: { totalMs: Date.now() - t0 },
      },
      { status: 500 },
    );
  }
}
