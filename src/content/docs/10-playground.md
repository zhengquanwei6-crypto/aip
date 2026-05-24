# AI 对话 / Playground

v0.11 B8 上线的"即时调用"工作台，把三件事合到一个 URL：直接和 LLM 聊（不写文案模板）、直接出图（不建任务）、直接调任意一个 Agent（不开抽屉）。

适合场景：
- 调试 prompt：刚想到一个问法，想试试效果，不想跑全套 publish-director
- 试用一条新加的 LLM key：去 /settings 加完，进 /playground 选这条 key 单独问几句确认能用
- 比较两个 model：同一个 prompt，临时改 model 字段（不写池），看哪个回答更合适
- 比较两个 IMAGE adapter：在 ImageTab 切 adapter，看 4router 与 KIE 的同 prompt 出图差别
- Agent 一次性问答：不绑客户、不绑任务，纯问 client-coach 怎么回某句话

> 数据源：`src/app/(admin)/playground/page.tsx` server 一次拉 LLM/IMAGE keys 池 + 6 adapter sizes/qualities + 8 agents · 三 tab 切换 0 网络

## 三 tab 总览

```
┌─────────────────────────────────────────────────────────┐
│  [LLM 对话]   [图片生成]   [Agent 对话]                  │
├─────────────────────────────────────────────────────────┤
│  左：参数面板（key / 选项）            右：对话区 / 出图区  │
└─────────────────────────────────────────────────────────┘
```

URL 持久化：`/playground?tab=llm|image|agent`，刷新保留 tab。三个面板 hidden/show 切换，每个面板自己持有对话历史 + 选择 state，**切 tab 不丢消息**。

## 1. LLM 对话 tab

### 左侧参数

| 字段          | 行为                                                  |
|---------------|------------------------------------------------------|
| LLM Key       | 选池里某条（默认 active 第一）；切 key 立即生效      |
| 临时 model    | 留空 = 用 key 里默认；填了 = 本次请求覆盖（不写池）  |
| System Prompt | 全局指令，每次对话都拼到最前                          |
| temperature   | 0..1 滑块，默认 0.7                                   |
| max_tokens    | 默认 4096，上限 32000（实际由模型决定）              |

### 右侧对话

输入消息按 `Cmd/Ctrl+Enter` 直接发送。每次发送会把**全部历史消息**都带给后端（多轮支持），所以 system prompt 只算一次。

每条 assistant 气泡底部显示：
- model（实际下发的 model 名）
- latency（生成耗时秒）
- tokens（如果上游返回了 usage）
- 「复制」按钮 — 复制内容到剪贴板
- 「重发」按钮（仅最后一条）— 截掉这条 assistant，把对应的 user 消息再发一次

清空历史按钮在左侧底部。

### 后端

`POST /api/playground/llm/chat`，body：

```json
{
  "keyId": "cmpij5...",
  "model": "deepseek-v4-pro",
  "system": "你是…",
  "user": "...",
  "messages": [{"role":"user","content":"…"},{"role":"assistant","content":"…"}],
  "temperature": 0.7,
  "max_tokens": 4096
}
```

`messages` 优先级高于 `user`/`system`（多轮场景）。响应：

```json
{
  "ok": true,
  "output": "完整回复",
  "model": "deepseek-v4-pro",
  "latencyMs": 1234,
  "tokens": { "prompt": 12, "completion": 234, "total": 246 },
  "keySource": "pool",
  "keyLabel": "DeepSeek 主用"
}
```

写库：`AIOutput.type='playground:llm'`。

## 2. 图片生成 tab

### 左侧参数

| 字段        | 行为                                                |
|-------------|-----------------------------------------------------|
| IMAGE Key   | 选池里某条 image key                                 |
| Adapter     | 多 adapter 时显示；切换会写 `IMAGE_DEFAULT_ADAPTER`（与 /image / publish-director 共用） |
| 尺寸预设    | 按 adapter.sizes 池下拉（B7：1k/2k/4k 或 方图/竖图） |
| 质量预设    | 按 adapter.qualities 池下拉（可能为空）              |
| n           | 1..4                                                 |

切 adapter 时 size/quality 自动 reset 到新 adapter 的 sizes[0]/qualities[0]，不会卡在旧值（B7 行为延伸）。

### 右侧出图

prompt textarea + 生成按钮。每次生成出 n 张图，缩略图按时间倒序栅格排列。点开 ImageLightbox 全屏 + 下载。

### 后端

`POST /api/playground/image/generate`：

```json
{
  "keyId": "cmpij5...",
  "adapterSlug": "4router-gpt-image-2",
  "prompt": "...",
  "size": "2048x2048",
  "quality": "high",
  "n": 1
}
```

prompt 必填。响应同 `/api/image/generate`：

```json
{
  "ok": true,
  "asset": { "id": "...", "url": "/uploads/..." },
  "assets": [...],
  "via": "adapter",
  "adapterSlug": "4router-gpt-image-2",
  "durationMs": 8123,
  "trace": { /* RunTrace */ }
}
```

写库：每张图一条 `Asset`（type='封面图'）+ 单条 `AIOutput.type='playground:image'`。

## 3. Agent 对话 tab

### 左侧 agent 选择

```
[🩺 API 助手   api-doctor]    [✨ 提示词优化  prompt-coach]
[📝 文案写作   copy-writer]   [💵 价格报价    price-quoter]
[☀️ 今日合规   day-coach]     [💬 客户沟通    client-coach]
[🎬 拍摄总监   photo-director][🎯 发布导演    publish-director]
```

每个 agent 有独立对话历史（slug 切换时 historyMap 各保留），相当于同时打开 8 个 chat。

下方折叠组「System Prompt（只读）」展示当前 agent 的 systemPrompt 全文，用作"为什么 agent 这样回答"的依据，但不能改（要改去 `/presets?tab=agent`，v0.9.2 b2 落地）。

### 后端

`POST /api/playground/agent/chat`：

```json
{
  "slug": "client-coach",
  "message": "客户压价 30%，怎么回？",
  "messages": [{"role":"user","content":"…"}],
  "context": { "clientId": "cmp123..." }
}
```

slug 必填（缺了返回 400 「slug 必填」）。`message` 单轮，`messages` 多轮（优先级高）。`context` 透传给 contextLoader（如 client-coach 需要 clientId 拉客户档案）。

写库：`AIOutput.type='playground:agent'`，与 AgentDrawer 写的 type='text'/'agent' 不同前缀，**不污染原 drawer 历史**。

## 与其他工作台的区别

| 场景                   | 用 Playground             | 用其他                                         |
|------------------------|---------------------------|------------------------------------------------|
| 调试 prompt 想法       | LLM 对话 tab              | /content 太厚（要选平台/类型/品类）            |
| 试新加的 LLM key       | LLM 对话 tab + 选 keyId   | /settings 测试连通性只发一次（GET /models）    |
| 单图试拍               | 图片生成 tab              | /image 也行，但 Playground 0 modal 更轻        |
| 临时问 day-coach       | Agent 对话 tab            | /today 顶部 sticky 卡只展示 agent 的输出       |
| 比较两个 model A/B     | LLM 对话 tab + 临时 model | 没别的入口可以临时换 model 不写池              |
| 切 adapter 比较出图    | 图片生成 tab              | /adapters 干跑 trace 复杂；publish-director 太重|

## 与 /content / /image / /today drawer 的边界

```
/content   → 任务式文案（带平台/类型/品类/受众强约束 + diff）
/image     → 任务式图片（带 ImagePreset + n 张 + 失败重试 + 队列）
/today     → 任务卡 🎯 全流程发布（publish-director 三步抽屉）
─────────────────────────────────────────────
/playground (B8 NEW)
   ↑ 即时调用：不绑任务、不走模板、临时换 key/model，任何调用都在这里。
```

**心法**：
- 要给客户产出 → 走 /today 任务卡 → publish-director 完整三步
- 想试一个想法 → 走 /playground，3 秒上手

## /api/health 字段

B8 起 `playgroundEnabled: true` 标记上线：

```json
{
  "ok": true,
  "version": "v0.11",
  "playgroundEnabled": true,
  "apiKeyPool": { ... },
  "imageSizesPerAdapter": { ... }
}
```

如果你看到 `playgroundEnabled` 为 `undefined`，说明部署没上 B8。重跑 push.sh。

## 移动端

**当前 B8 不做移动端整合**：移动版 NAV 只有 5 个 Tab（首页/任务/文案/图片/我的），加 /m/playground 会挤掉常用入口。

移动端用户访问 `/playground` 时由 middleware 重定向到 `/m`，要用 Playground 必须切桌面版（`/m/me` → 切换到桌面版按钮 → 写 cookie `view_mode=desktop`）。

## 安全 / 配额

- 0 LLM/IMAGE 消耗的安全机制：所有 push.sh / walk 验证全部 GET-only · POST 空 body 触发 400 校验
- 每次调用都写 `AIOutput`（含 input + output 摘要），便于 `/workspace?tab=history` 复盘
- 失败也写一条 AIOutput（output 含 error）
- 不展示 sk-... 明文（baseUrl 可显示，apiKey 永远不出现在响应里）

## 记录的 AIOutput type

| type                | 何时写入                            |
|---------------------|------------------------------------|
| `playground:llm`    | LLM 对话 tab 调用一次               |
| `playground:image`  | 图片生成 tab 调用一次（成功 + 失败）|
| `playground:agent`  | Agent 对话 tab 调用一次             |

`/workspace?tab=history` 默认列出全部 type，按 type 字段筛选可单独看 playground 的调用历史。

## followup

- v0.12 计划支持 SSE 流式（当前 fetch 一次性返回，长回复要等完）
- v0.12 加 `/playground` 移动版（/m/playground）
- 临时 model 字段当前不写池；v0.12 可加「保存到池」按钮
- 当前 ImageTab 切 adapter 会写 IMAGE_DEFAULT_ADAPTER 全局；v0.12 加 runImageGenerate 接受 opts.adapterSlug 参数实现"仅本次"
