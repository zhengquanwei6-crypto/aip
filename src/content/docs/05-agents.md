# Agents 子系统使用

工作台一共 8 个 agent，用 slug 区分。每个 agent 有自己的 systemPrompt + 入口路由。这一篇讲哪个 agent 在哪、做什么、怎么调。

> 数据源：`GET /api/agents/list` → 8 个 slug · `findAgent(slug)` 在 `src/lib/agents/registry.ts`。

## 8 个 agent 名册

| slug                | 角色                                  | 入口（页面）                               |
|---------------------|---------------------------------------|--------------------------------------------|
| `api-doctor`        | 帮诊断中转站 / API 错误               | 抽屉式 chat（`/settings` 内的"诊断"按钮）  |
| `prompt-coach`      | 改进当前 prompt（vs 默认 diff 视图里） | `/presets?tab=content` 编辑器              |
| `copy-writer`       | 写小红书 / 闲鱼正文                    | `/content` 单页 + publish-director step1   |
| `price-quoter`      | 报价话术 + 推荐套餐                    | `/clients?tab=pricing` 顶部"AI 报价"        |
| `day-coach`         | 给今天任务排序 + 时间建议              | `/today` sticky"AI 优先级"卡（暗色）        |
| `client-coach`      | 客户跟进话术                            | `/clients/[id]` 抽屉                       |
| `photo-director`    | 把"封面图"拆成 7 维 prompt（v0.9 b2 系列模式）| publish-director step2 自动                |
| `publish-director`  | **全流程发布**：文案 + 图 + 反写 task   | `/today` 任务卡 🎯 + `/m/today` + `/content` sticky |

## publish-director 入口（最重要）

v0.9 b1 上线、b2 加图片选项、b3 接 task 反写、v0.11 B5 主按钮整合。三个入口：

### 1. `/today` 任务卡

B5 起 `/today` 任务卡操作整合为：

```
[ 🎯 全流程发布 ]   [ 更多 ▾ ]   [ 状态 ▾ ]
```

主按钮直接打开 `<PublishDirectorDrawer>` 抽屉，绑当前 task。下拉菜单里的"生成文案 / 生成图片"是分步入口（不走 publish-director，调单独的 generate-content / generate-image 路由）。

### 2. `/content` sticky 区

`/content` 页底部有一个 sticky 按钮"全流程发布"。这条不绑 task，发布后 Post 落 AIOutput 但 `taskId: null`。**适合脱离任务上下文写完文案后想顺便出图的场景**。

### 3. `/m/today` 任务卡

移动端任务卡的同名按钮。抽屉用 `pb-[env(safe-area-inset-bottom)]`（B2）保证 iPhone 全面屏底部不被遮。**抽屉内的图片选项折叠组只显前 3 项**（n / sameStyle / asSeries），其余在桌面端改。

## 抽屉里的图片选项（关键 11 字段）

```
imageOptions {
  autoImage:       true            // 跳过 step3 出图，只跑 step1+2
  stylePresetId:   'preset-minimal-001'
  styleKeywords:   ['minimal']     // 额外加的，会和 preset 合并
  negativePrompt:  ''
  primaryColor:    '#0F172A'
  accentColor:     '#F59E0B'
  textLanguage:    'zh'            // 'zh' | 'en'
  n:               3                // 1..8
  sameStyle:       true
  asSeries:        false           // sameStyle 和 asSeries 互斥（系列模式自动同风格）
}
```

合并逻辑（在 `route.ts` step2 之前）：
1. 取 ImagePreset 里的字段
2. 用户传的 imageOptions 字段如果非空，**覆盖** preset 同名字段
3. styleKeywords 是 union（preset + user 去重合并）

> **建议**：第一次跑全留默认。如果效果不行，先调 `primaryColor / accentColor`（最直观），再调 `styleKeywords`（影响整体），最后才动 `negativePrompt`（容易把好东西也排除掉）。

## 一套图模式（asSeries）

`asSeries: true, n: 3` 的组合：

```
step1 → titles: ['案例1标题', '案例2标题', '案例3标题']
step2 → seriesPrompts: [
          { scene: '俯视', promptEn: 'top-down view of ...' },
          { scene: '平视', promptEn: 'front view of ...' },
          { scene: '45度', promptEn: '45-degree angle of ...' },
        ]
step3 → imageUrls: ['https://...', 'https://...', 'https://...']
```

如果 step2 的 seriesPrompts 失败（LLM 输出不合格），后端自动 fallback 到普通同风格 + n 张，记一行 `imageFallbackNote: 'series mode fell back to sameStyle (LLM output not parseable)'`。

## 写回机制（v0.9 b3）

请求带 `taskId: 'cmpij5...'`，成功后：

| 表          | 写入字段                                  |
|-------------|-------------------------------------------|
| `Post`      | `taskId` ← 入参                           |
| `Product`   | `taskId` ← 入参（如果是闲鱼平台）         |
| `Asset`     | `prompt + url` 入库（新建一条）           |
| `Task`      | `status='generated' / title / body / coverText / imageUrl` 反写 |
| `AIOutput`  | type='publish_director' 一条总记录        |

响应里：
- `taskUpdated: true / false` — task 写入是否成功
- `taskUpdateError: null / '...'` — task 写失败原因
- `assets: [...]` — 数组形式（n=1 时也是 [single]）
- `asset: legacy` — = assets[0]（向后兼容）

## 其他 agent 的快用法

### api-doctor

`/settings` 里某条 key 测试连通性失败时，弹出"诊断"按钮 → 打开 api-doctor 抽屉。把错误信息粘进去，agent 会:
- 判断是 401 / 429 / 5xx
- 检查 baseUrl 拼写
- 给中转站具体的 fix 建议（"检查 .../v1 末尾是否多了 /"）

### prompt-coach

`/presets?tab=content` 编辑某条 prompt 时，可以调 prompt-coach 让它"改进这个 prompt"。改前后对比走 vs 默认 diff（v0.9.2 b1 上线）。

### day-coach

`/today` 顶部如果显示"AI 优先级建议"（暗色 sticky 卡），就是 day-coach 调用 `/api/agents/day-coach/chat` 的结果。它读今天 schedule.tasks，按 publishTime / category 给排序建议。

## 调单个 agent 的 raw 接口

`POST /api/agents/<slug>/chat`，body：

```json
{
  "messages": [
    { "role": "user", "content": "我有 5 个客户都问 logo 价格，怎么报？" }
  ]
}
```

响应：

```json
{
  "ok": true,
  "model": "deepseek-v4-pro",
  "reply": "...",
  "usage": { "promptTokens": 234, "completionTokens": 198 }
}
```

不带 prompt:agent:<slug>:system 会用 `agents/registry.ts` 里硬编码的 systemPrompt（v0.9.2 b2 完成后才把它搬到 Setting 表）。
