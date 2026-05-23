# 图片生成最佳实践

publish-director 的 step2 之所以稳，是因为 photo-director 已经把 prompt 拆成 7 个维度去强约束。这一篇讲怎么用对这 7 维 + 风格预设 + Adapter 切换。

> 数据源：`src/lib/agent-types.ts` v0.9 b2 扩展 schema + `prisma.imagePreset` 6 行内置 + `lib/ai/prompts.ts DEFAULT_PROMPTS['image:suggest']`。

## 一张图为什么会"难看"

90% 的烂图来自 prompt 写得太宽。"画一张 logo 设计案例的封面图" 是绝望的 prompt：模型不知道你要扁平还是写实、字体多大、放哪、什么颜色调、用什么样机。

photo-director 帮你把 prompt 变成 7 段：

| 维度          | 控这个东西                              | 字段名（agent-types.ts）         |
|---------------|----------------------------------------|----------------------------------|
| subject       | 画的是什么（主体）                      | `subject`                         |
| composition   | 画面构图（左右 / 居中 / 留白比例）       | `composition`                    |
| palette       | 配色系（主色 + 辅助色）                 | `primaryColor` + `accentColor`    |
| lighting      | 光线（自然光 / 工作室 / 霓虹）            | `lighting`                        |
| style         | 风格关键词（极简 / 高质感 / 复古）       | `styleKeywords[]`                 |
| camera        | 视角（俯视 / 平视 / 45 度）              | `cameraAngle`                     |
| mood          | 情绪基调（专业 / 温馨 / 干练）           | `mood`                            |

每一项都不强求填齐，但越多模型越听话。publish-director 抽屉的"图片选项"折叠组里能改前 4 项，剩下 3 项从 ImagePreset 读默认值。

## 用风格预设（推荐）

`/presets?tab=image`（B5 路径）有 6 个 ImagePreset。打开看 JSON：

```json
{
  "id": "preset-minimal-001",
  "name": "极简白底高质感",
  "imageType": "封面图",
  "styleKeywords": ["minimal", "clean layout", "white background", "premium feel"],
  "negativePrompt": "blurry, low quality, watermark, jpeg artifact, oversaturated",
  "primaryColor": "#0F172A",
  "accentColor": "#F59E0B",
  "textLanguage": "zh",
  "isDefault": false
}
```

publish-director 抽屉里"风格模板"下拉选这条，photo-director 在 step2 里会把 styleKeywords 拼进 prompt，把 negativePrompt 单独发到 image-runner（4router-gpt-image-2 adapter 会拼到请求 body 的 `negative_prompt` 字段）。

> primaryColor 不会硬限模型一定用这个色，但会写进 prompt 里 `with primary color #0F172A as the dominant tone`，命中率约 80%。要硬限 100%，得改 image-runner 里的色板叠加 — 那是 v0.12+ 的事。

## 一套图模式（v0.9 b2）

`asSeries: true` + `n: 3` 的组合是"系列模式"。后端会做这事：

1. step1 文案返回 `titles[0..2]` 三个标题（如果只有 1 个标题，自动复用）
2. step2 photo-director 生成 `seriesPrompts: [{ scene, promptEn }]` 三组场景化 prompt（场景如：俯视 / 平视 / 45 度三视角）
3. step3 串行调 image-runner 三次，每次用 seriesPrompts[i].promptEn

如果某一张失败，记到 `imageErrors: [{idx, scene, error}]`，`imageFallbackNote` 字段提示降级。**整个 batch 不阻塞**：第 1 张失败仍会继续生成第 2/3 张。

## Adapter 切换

`/adapters` 列出 5 个内置：

| slug                       | 适用                                |
|----------------------------|-------------------------------------|
| `kie-gpt-image-2`          | KIE 中转站的 gpt-image-2，支持 negative_prompt |
| `kie-flux-kontext-pro`     | KIE 的 flux-kontext-pro，主攻文字图  |
| `4router-gpt-image-2`      | 4router.net 的 gpt-image-2（默认）   |
| `openai-dalle-3`           | OpenAI 直连 DALL·E 3                 |
| `openai-gpt-img-2`         | OpenAI 直连 gpt-image-2              |
| `generic-openai-compatible`| 任何 OpenAI 兼容协议（自定义 baseUrl）|

`Setting.IMAGE_DEFAULT_ADAPTER` 决定当前用哪条。改这个值之后**立即生效**（v0.9 b3 审计：所有 51 个 route.ts 全 `force-dynamic`，0 缓存）。

切 adapter 后第一次 publish-director 跑可能会慢 1-2 秒（image-runner 第一次连新 baseUrl 没复用 keep-alive），之后稳定。

## 图片质量四层切入（v0.9.2 b4 路线图，部分 v0.11 已具备）

| 层级         | 当前状态                                              |
|--------------|-------------------------------------------------------|
| ① prompt 7 维 | ✅ photo-director 已落地（v0.9 b2）                   |
| ② negativePrompt 隔离 | ✅ ImagePreset.negativePrompt 进 image-runner     |
| ③ qualityScore 反馈 | ⏳ v0.9.2 b4 才做（用户 ⭐ 评分回写 Asset.qualityScore） |
| ④ 模型 A/B 试验台 | ⏳ v0.9.2 b4 同上                                  |

## 实操：怎么调出"高质感主图"

```
content type:  商品型
category:      电商主图
audience:      电商卖家
preset:        极简白底高质感
图片选项:
  n: 3
  sameStyle: true
  asSeries: false
  primaryColor: #0F172A
  accentColor: #F59E0B
  textLanguage: zh
  negativePrompt: (留空，preset 已有)
```

跑 `🎯 全流程发布`。3 张图会以同风格输出，但每张主体角度略不同（photo-director 自动拼角度差异）。挑一张满意的「采用」，其余两张「重生」。

## 实操：怎么调"流程图"

流程图基本是文字主导，gpt-image-2 类模型对文字幻觉率高。建议切 `kie-flux-kontext-pro` adapter（专攻文字图）+ ImagePreset 选"流程图清晰"那条，textLanguage 强写 `zh`。

## 失败重试

- **单张失败**：抽屉里图片网格右下角"重生" → 不过 LLM，只过 image-runner
- **整 batch 失败**：抽屉关掉重开 → 从 step1 重跑（会再过一次 LLM，**消耗一次 token**）
- **持续失败**：去 `/api/health` 看 `recentFailures.image`，如果是 401 → key 错（去 /settings 改）；如果是 429 → 中转站限流（等几秒重试或加备用 IMAGE key 设 priority=1，参见 [快速开始](/docs/01-quick-start)）
