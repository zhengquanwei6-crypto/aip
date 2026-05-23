# 推荐工作流

接到一单到本周复盘，工作台里走一遍的标准路径。这个流程不是"必须"，但它把 14 项 NAV 用一条线串起来，新人按这个顺序练习一遍后大部分功能都摸过。

## 一图概览

```
[1] 接单                  /clients?tab=list
       │  新建 Client + ClientNote 一条
       ▼
[2] 报价                  /clients?tab=pricing  或  /tools?tab=calc
       │
       ▼
[3] 建任务                /today  → + 新建任务
       │  Task.status=pending
       ▼
[4] 全流程发布            /today 任务卡 🎯 全流程发布
       │  publish-director step1+2+3
       │  Task.status=generated  +  Asset 入库  +  Post/Product 写 taskId
       ▼
[5] 真实发布到平台        浏览器手动发，回来改 status
       │  /today 状态 ▾ → 已发布
       ▼
[6] 数据回填              /analytics  上传 CSV  或  /m/today 改 metrics
       │
       ▼
[7] 周报                  /tools 默认 tab（含 suggestion:weekly 模板生成的运营建议）
```

## 第 1 步：客户档案

进 `/clients?tab=list`，右上角 `+ 新建客户`：填名字 / 平台 / 来源 / 标签。复杂客户加一条 ClientNote（点客户行进 `/clients/[id]`）。

> 不必要为每单建客户。Client 表 7 行，主要是常合作的几家。一次性单子直接跳到第 3 步建 Task 即可，平台 + 类型 + 标题足够定位。

## 第 2 步：报价

两条路：

- **临时算一单**：`/tools?tab=calc`，输入面积 / 件数 / 包月否 → 套用 PricePackage 公式给报价
- **长期方案**：`/clients?tab=pricing`，把客户绑定到某档 PricePackage（引流款 / 标准款 / 利润款），后续相关任务自动按这档算

接下来用 `/scripts` 私信话术里的"急单报价"或"包月转化"模板回客户。

## 第 3 步：建任务

进 `/today`，`+ 新建任务` 抽屉。**关键字段**：

| 字段          | 决定的下游行为                                  |
|---------------|-------------------------------------------------|
| platform      | prompt 里的 `{{platform}}` + 模型路由（小红书走 xhs:case/tutorial 模板，闲鱼走 xianyu:product） |
| contentType   | 触发的 prompt key（案例型 → xiaohongshu:case）    |
| category      | 图片预设里 styleKeywords 的硬约束               |
| audience      | prompt 里的 `{{audience}}`                       |
| title 草稿    | 第一版生成完会被 `title:refine` agent 替换       |
| publishTime   | 决定 `/calendar/<dow>` 排期分组                  |

> 一次最多建 5 条任务，避免 batch 过长 publish-director 串行慢。schema 暂未支持批量发布（v0.9.2 b3 计划）。

## 第 4 步：全流程发布（核心）

任务卡的 `🎯 全流程发布` 按钮（B5 整合后的主操作）进入 publish-director 抽屉，680px 宽，三步：

### Step 1 · 文案

后端调 `/api/agents/publish-director/build` 内部第一段，`buildContentMessagesAsync` 读 prompt:xiaohongshu:case / xianyu:product 等模板（v0.9.2 b1 起 await async），生成 titles / body / coverText。失败会把 stylePromptErr 写到 step2 状态展示，**不**是红色错误条（B4 已统一改 toast.error）。

### Step 2 · stylePrompt

photo-director 风格（v0.9 b2 系列模式 + 颜色/语言/风格预设约束）。可以折叠"图片选项"组改：

- `n` = 1 单张 / `n` ≥ 2 多张
- `sameStyle: true` 同风格、`asSeries: true` 系列模式（生成 N 张主题相关的图）
- `textLanguage: en|zh` 控制图上文字语种
- `primaryColor / accentColor` 强约束
- `stylePresetId` 选 ImagePreset 进来
- `negativePrompt` 反向提示

### Step 3 · 图片网格

Step1+2 结束后开始 N 张并发出图（实际是串行 + 单张失败不阻塞）。每张图右下角有"重生"按钮，调用 `seriesPrompts[idx]` 单点重跑（**不再过 LLM 阶段**，只过 image-runner，B5 followup 已记）。

### 写回

接口返回时如果 `taskId` 有值（默认填）：
- `Post / Product` 写 `taskId`
- `Task.status = 'generated'`
- `Task.title / body / coverText / imageUrl` 反写
- `taskUpdated: true` 字段返回

抽屉关闭后 `/today` 任务卡自动 refresh，徽章变蓝（已生成）。

## 第 5 步：真发布

工作台**不直接**发到小红书/闲鱼（v0.10 路线图的 Chrome 扩展才管这事）。当前流程：在 `/contents` 找到刚生成的 Post，复制文案 + 下载图片 → 浏览器登录 xhs/闲鱼手动发。

发完回 `/today`，把状态 ▾ 切到 `已发布`。如果发的时候改了文案，在 `/calendar/<dow>/task/<id>` 里同步改一下，不然 metrics 对不上。

## 第 6 步：数据回填

发布后第 1/3/7/14 天回填浏览数据：

- 桌面端：`/analytics/import` 上传 CSV
- 移动端：`/m/today` 任务卡上单条快速填

数据进 Metric 表，dashboard 4 区右下"系统健康"会反映。

## 第 7 步：周报

每周日去 `/tools` 默认 tab。这页用 `suggestion:weekly` prompt（v0.9.2 b1 内置 DEFAULT_PROMPTS 第 6 条）生成本周建议：

- 哪个类型表现最好
- 哪个时段发的帖子互动高
- 下周建议主推什么品类

这条数据走 `/api/agents/copy-writer/chat` 而不是 publish-director（轻量、无图）。生成结果落 AIOutput.type='suggestion'，dashboard 也能看到。

## 一些反模式

- ❌ 一次建 20 条 task 然后逐条点"全流程发布" — 串行 publish-director 一条 30-90 秒，20 条 = 30 分钟。等 v0.9.2 b3 上批量发布功能再说
- ❌ 在 `/content` 写文案不建 task — 这条 AIOutput 不会落到任何 task，回填数据时找不到上下文
- ❌ 关闭浏览器后跑 publish-director — 当前路由是 sync 的（`force-dynamic`），关掉抽屉等于中断；要等到 next 出 streaming
- ❌ 在 prod 改 prompt 不先去 `/presets?tab=content` 看 vs 默认 diff — diff 是双栏对比工具，避免改完发现还不如默认（v0.9.2 b1 上线）
