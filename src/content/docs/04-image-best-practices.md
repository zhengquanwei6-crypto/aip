# 图片生成最佳实践

publish-director 的 step2 之所以稳，是因为 photo-director 已经把 prompt 拆成 7 个维度去强约束。这一篇讲怎么用对这 7 维 + 风格预设 + Adapter 切换 + 比例预设 + 图生图。

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

publish-director 抽屉里"风格模板"下拉选这条，photo-director 在 step2 里会把 styleKeywords 拼进 prompt，把 negativePrompt 单独发到 image-runner。

## 一套图模式（v0.9 b2）

`asSeries: true` + `n: 3` 的组合是"系列模式"。后端会做这事：

1. step1 文案返回 `titles[0..2]` 三个标题
2. step2 photo-director 生成 `seriesPrompts: [{ scene, promptEn }]` 三组场景化 prompt
3. step3 串行调 image-runner 三次

如果某一张失败，记到 `imageErrors`，整个 batch 不阻塞。

## Adapter 切换

`/adapters` 列出 5 个内置：

| slug                       | 适用                                |
|----------------------------|-------------------------------------|
| `kie-gpt-image-2`          | KIE 中转站的 gpt-image-2，t2i + i2i |
| `kie-flux-kontext-pro`     | KIE 的 flux-kontext-pro，专攻 i2i  |
| `4router-gpt-image-2`      | 4router.net 的 gpt-image-2（默认）   |
| `openai-dalle-3`           | OpenAI 直连 DALL·E 3（仅 t2i）       |
| `openai-gpt-img-2`         | OpenAI 直连 gpt-image-2（t2i + i2i） |
| `generic-openai-compatible`| 任何 OpenAI 兼容协议（自定义）       |

`Setting.IMAGE_DEFAULT_ADAPTER` 决定当前用哪条。改这个值之后**立即生效**。

## 📐 尺寸与质量预设（v0.11 B7）

每个 adapter 自带一组尺寸 / 质量预设池。三处图片 UI 抽屉打开时会读 `/api/health.imageDefaultAdapter` → `/api/adapters/<slug>` 拿到 `sizes` / `qualities` 数组，渲染成两个 select。

### 池配置（src/lib/adapter-seed.ts）

| Adapter | sizes | qualities |
|---|---|---|
| `kie-gpt-image-2` / `4router-gpt-image-2` / `openai-gpt-img-2` | 1K(1024) / 2K(2048) / 4K(3840×2160) | 低 / 中 / 高 |
| `kie-flux-kontext-pro` | 方图1024 / 竖图3:4(768x1024) / 竖图9:16(720x1280) | 标准 / 高清 |
| `openai-dalle-3` | 方图1024 / 竖图1024x1792 / 横图1792x1024 | 标准 / 高清 |
| `generic-openai-compatible` | 1024 | （无） |

## 📐 图生图 + 比例预设（B9）

v0.11 B9 把图片生成扩展到两个新能力：**图生图（image-to-image）** + **图片比例预设（aspectRatios）**。

### 比例预设（aspectRatios）

每个 adapter 自带一组比例预设。三处图片 UI（**ImageStudio**、**publish-director Drawer**、**photo-director Drawer**、**/playground ImageTab**）抽屉打开时读 `/api/adapters/<slug>` 的 `aspectRatios` 数组，渲染成「比例预设」select。

#### 池配置

| Adapter | aspectRatios |
|---|---|
| `kie-gpt-image-2` / `4router-gpt-image-2` / `openai-gpt-img-2` | 1:1 / 16:9 / 9:16 / 4:3 / 3:4 |
| `kie-flux-kontext-pro` | 1:1 / 16:9 / 9:16 / 4:3 / 3:4 / 21:9 |
| `openai-dalle-3` | 1:1(1024x1024) / 16:9(1792x1024) / 9:16(1024x1792) |
| `generic-openai-compatible` | 1:1(1024x1024) |

#### 行为约定

每个 `AspectRatioPreset` 三个字段：

```ts
{
  label: "横屏 16:9",
  ratio: "16:9",
  sizeRule: "1792x1024"  // 可选；选了这条比例时强制用这个 size
}
```

- **比例 → size**：用户选 `16:9` 且 `sizeRule="1792x1024"` → size 自动切到 `1792x1024`（DALL-E 3 必须）
- **比例 → bodyTemplate**：image-runner 会把 `ratio` 注入 `extra.aspectRatio` → kie-* 系 bodyTemplate 用 `{extra.aspectRatio}` 占位
- **sizeRule 为空**：比例仅作 hint，不影响 size（kie-gpt-image-2 等用 aspect_ratio + resolution 协商）
- **fallback**：用户传非池内 ratio → resolveAspectRatio 自动用 `aspectRatios[0]`，trace 注 `aspectRatioFallback: true`

### 图生图（image-to-image）

#### 哪些 adapter 支持

| Adapter | supportsImg2Img | i2i flow |
|---|---|---|
| `kie-gpt-image-2` | ✅ | `/jobs/createTask` model=`gpt-image-2-image-to-image`，`input.image_urls=[源图URL]` |
| `kie-flux-kontext-pro` | ✅ | 同 t2i endpoint，`body.inputImage=源图URL/dataUri`（主打 i2i） |
| `openai-gpt-img-2` | ✅ | `/v1/images/edits` multipart：`image` (file part) + `prompt` + `size` + `quality` |
| `4router-gpt-image-2` | ✅ | 同 OpenAI `/v1/images/edits`（OpenAI 兼容协议） |
| `openai-dalle-3` | ❌ | DALL-E 3 在 OpenAI API 层不支持 i2i |
| `generic-openai-compatible` | ❌ | 占位 adapter，需用户自行编辑 |

#### UI 接入

四处图片 UI（ImageStudio / publish-director Drawer / photo-director Drawer / /playground ImageTab）当 adapter `supportsImg2Img=true` 时显示「图生图模式」开关：

```
☐ 图生图模式（image-to-image）
   勾选后展示：
     源图 URL: [______________________]
     — 或 —
     [上传源图（≤ 5MB）]   [清除]
     [预览缩略图]
```

正向 prompt 描述"基于源图改..."的指令（例如 "make the cat in the source image wear sunglasses, keep the rest unchanged"）。

#### 源图传输

- **外链 URL**：`sourceImageUrl` 字段直接传给 KIE Flux 的 `inputImage` / KIE GPT-2 i2i 的 `image_urls[0]`
- **base64 上传**：浏览器 `FileReader` 转 base64 → 走 `sourceImageBase64` 字段；OpenAI multipart 路径解码后塞 file part
- **5MB 限制**：超过的拒绝（POC 不落盘）

#### API 契约

`POST /api/image/generate` body 加：
```json
{
  "prompt": "...",
  "mode": "i2i",
  "sourceImageUrl": "/uploads/abc.png",   // 或外链
  "sourceImageBase64": "...",              // 二选一（URL 优先）
  "aspectRatio": "16:9",
  "size": "1792x1024",
  "quality": "high"
}
```

`/api/playground/image/generate` / `/api/tasks/[id]/generate-image` / `/api/agents/publish-director/build` 同样加。

#### 错误处理

- 选了不支持 i2i 的 adapter → image-runner 直接返回 400，不偷偷降级 t2i
- 缺源图 → 400 "i2i 模式需提供 sourceImageUrl 或 sourceImageBase64"
- 源图过大（>5MB）→ 413
- 上游 KIE/OpenAI 失败 → trace 含 `mode: 'i2i'` + `i2iSource: 'url'/'base64'` + `i2iFlow: 'i2i-dedicated'/'t2i'`

### /api/health 字段（v0.11 B9）

新增 `imageCapabilitiesPerAdapter` 替代 B7 的 `imageSizesPerAdapter`（**两者并存，向后兼容**）：

```jsonc
{
  "imageCapabilitiesPerAdapter": {
    "kie-gpt-image-2":           { "sizes": 3, "qualities": 3, "aspectRatios": 5, "supportsImg2Img": true },
    "kie-flux-kontext-pro":      { "sizes": 3, "qualities": 2, "aspectRatios": 6, "supportsImg2Img": true },
    "openai-dalle-3":            { "sizes": 3, "qualities": 2, "aspectRatios": 3, "supportsImg2Img": false },
    "openai-gpt-img-2":          { "sizes": 3, "qualities": 3, "aspectRatios": 5, "supportsImg2Img": true },
    "4router-gpt-image-2":       { "sizes": 3, "qualities": 3, "aspectRatios": 5, "supportsImg2Img": true },
    "generic-openai-compatible": { "sizes": 1, "qualities": 0, "aspectRatios": 1, "supportsImg2Img": false }
  },
  "imageSizesPerAdapter": { /* B7 兼容字段，仅 sizes/qualities */ }
}
```

### 一次性迁移

push.sh 部署完会调一次 `POST /api/adapters/migrate-presets`，把 `aspectRatios` + `supportsImg2Img` + `img2imgFlow` 字段 merge 进现有 adapter Setting 行。**幂等**——重复调用不会破坏现有 baseUrl/auth/flow 等用户定制。

## 实操：怎么调出"基于参考图改风格"

```
adapter:       kie-flux-kontext-pro（i2i 主力）
比例预设:       16:9
尺寸预设:       竖图9:16  ← 与比例不一致时比例的 sizeRule 优先
质量预设:       高清
图生图:         ☑ 勾选
源图:          上传一张参考图（小红书爆款图）
prompt:        Apply the same minimalist white-background editorial layout to my product:
              a brushed-gold table lamp, premium feel, soft shadow, no text
```

跑出来的图会保留参考图的"极简白底排版+柔光"美学，但主体换成你的产品。这是 i2i 的杀手级用法。

## 实操：怎么调"流程图"

流程图基本是文字主导，gpt-image-2 类模型对文字幻觉率高。建议切 `kie-flux-kontext-pro` adapter（专攻文字图）+ ImagePreset 选"流程图清晰"那条 + 比例选 9:16，textLanguage 强写 `zh`。

## 失败重试

- **单张失败**：抽屉里图片网格右下角"重生"
- **整 batch 失败**：抽屉关掉重开
- **持续失败**：去 `/api/health` 看 `recentFailures.image`
- **size 兜底**：如果 trace 里看到 `sizeFallback: true` 或 `aspectRatioFallback: true`，说明你传的值不在当前 adapter 的池里
- **i2i 兜底失败**：`adapter "openai-dalle-3" 不支持图生图` → 切 adapter 或关闭 i2i 开关
