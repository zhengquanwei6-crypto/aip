# 快速开始

5 分钟从零跑通：设置一组 LLM key → 建第一个任务 → 让 publish-director 出第一篇带封面图的内容。
本手册全程不需要离开浏览器、不写代码、不动 prisma。

> 本文匹配的版本：`/api/health` 应返回 `version: "v0.11"`。打开 [http://159.65.137.157/api/health](http://159.65.137.157/api/health) 任何时候都可以确认。

## 前置：你应该已经有的东西

- 一个能用的中转站 LLM key（写文案用，例：`https://inference.do-ai.run/v1` + `deepseek-v4-pro`）
- 一个能用的中转站图片 key（出图用，例：`https://4router.net/v1` + `gpt-image-2`）
- 浏览器能直接打开 `http://159.65.137.157/dashboard`（v0.11 起 NAV 14 项的桌面工作台）

如果两个 key 还没有，先去中转站买；价格在合理区间，不需要本机部署模型。

## 第 1 步 · 把 key 喂进去（90 秒）

**入口**：左侧 NAV → `设置`（最下面那项，齿轮图标）。

进 `/settings` 之后，最顶上的卡片叫 **🔑 API Keys 池 · v0.11 B1**，分成两组：

```
LLM 文案 keys
[+ 新增 LLM key]                      ← 第一次进来这里是空的

IMAGE 出图 keys
[+ 新增 IMAGE key]                    ← 同上
```

点 `[+ 新增 LLM key]`，右侧抽屉里填 4 个字段：

| 字段     | 例                                  |
|----------|-------------------------------------|
| label    | DeepSeek 主用                       |
| baseUrl  | `https://inference.do-ai.run/v1`    |
| apiKey   | sk-（你买回来的明文）               |
| model    | `deepseek-v4-pro`                   |

priority 留 0、active 勾选，备注随便写一句"主用、限速 60 RPM"之类的，提交。同样流程把 IMAGE key 加上（model 写 `gpt-image-2`、baseUrl 写中转站给你的图片域名）。

> 想多备一条 key 自动切换？直接再点一次 `[+ 新增 LLM key]`，把 priority 写成 1。失败 3 次后系统会把主用的 active 切到 false，下一次请求自动用 priority=1 那条。**这是 v0.11 唯一的 schema 改动**（新增 ApiKey 表）。

## 第 2 步 · 验证池是活的（30 秒）

不离开 /settings 这一页，找到刚加的 LLM key 那行，点 `测试`。后台会跑一次 `GET <baseUrl>/models`（**0 token 消耗**），结果回写到 `consecutiveErrors / totalRequests`。

更稳的验证：打开新标签页粘 `http://159.65.137.157/api/health`，找这一段：

```json
{
  "version": "v0.11",
  "apiKeyPool": {
    "llm":   { "total": 1, "active": 1, "lastError": null },
    "image": { "total": 1, "active": 1, "lastError": null }
  }
}
```

`active: 1` 才算活的。`lastError` 不是 null 时直接到 `/settings` 看那条 key 是不是 baseUrl/apiKey 抄错。

## 第 3 步 · 第一个任务（60 秒）

NAV → `今日任务`（CheckSquare 图标），进 `/today`。右上角 `+ 新建任务` 打开抽屉：

- **平台**：小红书 / 闲鱼，二选一
- **类型**：案例型 / 避坑型 / 报价型 / 流程型 / 商品型 / 包月型 / 复盘型
- **品类**：Logo、VI 品牌、电商主图、详情页 ⋯（来自 `lib/constants.ts CATEGORIES`）
- **目标人群**：电商卖家 / 餐饮门店 / 创业者 ⋯（这条决定 prompt 里的 `{{audience}}` 占位符）
- **标题草稿**：随便写一句，例 "餐饮门店换菜单设计案例"
- **发布时间**：14:30 之类，用作日历分组

提交后任务卡出现在 `/today` 列表，状态徽章 `pending`（灰色）。

## 第 4 步 · 第一次出图 + 出文案（120 秒）

任务卡的右下角 v0.11 B5 起整合成 **🎯 全流程发布 + 更多 ▾**：

```
[ 🎯 全流程发布 ]   [ 更多 ▾ ]   [ 状态: pending ▾ ]
                       └ 编辑任务详情 → /calendar/{dow}/task/{id}
                       └ 生成文案
                       └ 生成图片
                       ─────
                       └ 标记为已发布
```

**第一次推荐直接走 `🎯 全流程发布`**，这条是 `/api/agents/publish-director/build`（v0.9 b1 上线、b2 加图片选项、b3 接 task 反写）。打开抽屉后会看到三段：

1. **风格模板** — 选一个 `图片预设`（默认 6 个：极简、电商高质感、复古、明亮、深色、品牌色）。预设 JSON 里的 styleKeywords / negativePrompt / primaryColor 会进 prompt
2. **图片选项** — 折叠组里有 `n`（生成几张）、`sameStyle`（同风格）、`asSeries`（系列模式）、`textLanguage`（en/zh）等，所有字段都从 `agent-types.ts` 来
3. **构造 prompt → 生成** — 点开始，左侧 step1 是文案、step2 是 stylePrompt、step3 是图片网格。失败的张会标红、可单张「重生」

> v0.9.2 b1 起所有 prompt 都从 Setting 表 `prompt:*` 行读，没有自定义时落 `DEFAULT_PROMPTS`。第一次跑就是默认模板，效果稳。要调整 prompt 去 `/presets?tab=content`（B5 起 /prompts 自动 307 到这里）。

## 第 5 步 · 数据回填（自动）

build 接口返回 `taskUpdated: true` + `task.status = 'generated'`，回到 `/today` 看任务卡的徽章已变 `已生成`（蓝色），右上角缩略图也出来了。点 `状态 ▾` 改成 `已发布`、再隔几天再改 `已复盘`，整条任务就跑完了。

## 然后呢？

| 想做这件事        | 去这里                                  |
|-------------------|-----------------------------------------|
| 看历史所有 AI 输出| `/workspace`（B5 把 /history /assets 合并） |
| 编辑 prompt 模板  | `/presets?tab=content`                  |
| 自定义 agent 风格 | `/presets?tab=agent`（v0.11 B15.5；详见 [`/docs/05` §自定义 prompt 模板](/docs/05-agents)） |
| 加更多 LLM key    | `/settings` 顶部 API Keys 池            |
| 单图重新生成      | `/workspace?tab=assets` 找到这张图      |
| 算一单价格        | `/tools?tab=calc`                       |
| 看周报            | `/tools` 默认 tab                       |
| 开发布日历         | `/calendar`                             |

> 想自定义 agent 风格？看 [`/docs/05` §自定义 prompt 模板](/docs/05-agents)，从 [/presets?tab=agent](/presets?tab=agent) 给 8 个内置 agent 各写一条 systemPrompt 覆盖（不动源码、随时回退）。

底部右下角的 `?` 图标永远跳回 `/docs/01-quick-start`，迷路了直接回这里。
