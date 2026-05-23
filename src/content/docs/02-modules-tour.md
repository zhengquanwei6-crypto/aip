# 板块导览

工作台一共 14 项主导航 + 6 个保留 URL（B5 整合后从 NAV 移除但仍可访问）。每个板块只回答 4 个问题：用来干嘛、什么场景、从哪进、有没有快捷键。

> 数据源：`src/lib/constants.ts NAV_ITEMS`（B5 起 14 项）+ `src/components/AdminShell.tsx iconFor` switch。

## NAV 14 项

### 1. 首页看板 `/dashboard` · Home

* **用途**：每天打开第一眼。顶部欢迎条 + 6 个 KPI（待办 / 已生成 / 已发布 / AIOutput / 图片 / 客户）+ 4 个快速操作（新建任务 / 写文案 / 出图 / 全流程发布）+ 4 区双卡（今日待办 + 最近 AI 输出 + 系统健康 + 最近失败）
* **场景**：上班坐下，看今天有几条任务、池里 key 还活不活、24h 内有没有 LLM/IMAGE 失败
* **进入**：`/`、`/dashboard`、Cmd+K → "首页"
* **背后接口**：`GET /api/dashboard/summary`（B3 上线，单次返回 7 个字段聚合，dbSize 用 `node:fs.stat /data/dev.db` 读）

### 2. 今日任务 `/today` · CheckSquare

* **用途**：当前活跃任务列表 + 任务卡上的整合操作（B5 改：主按钮 🎯 全流程发布 + 更多 ▾）
* **场景**：接到一个新单 → 在这里建任务 → 全流程跑出第一版 → 改状态
* **进入**：NAV、Cmd+K → "今日任务"
* **快捷键**：建任务抽屉里 Esc 关闭、卡片操作 Tab 键可达

### 3. 发布日历 `/calendar` · Calendar

* **用途**：按周一到周日 7 列展示 schedule.tasks，深 click 进 `/calendar/3` (周三单日视图) 或 `/calendar/3/task/<id>` (任务详情)
* **场景**：周一规划一周内容时
* **进入**：NAV、`/today` 任务卡的「编辑任务详情」从 dropdown 跳过来

### 4. 文案生成 `/content` · PencilLine

* **用途**：脱离任务上下文的纯写文案。一个表单（平台 + 类型 + 标题 + 关键词），生成结果直接落 AIOutput 表。可"再生成一版" + 左右双栏 diff
* **场景**：写一条独立帖子（不一定接单）。单独玩玩 prompt 也用这里
* **背后接口**：`POST /api/content/generate`（v0.9.2 b1 改 await `buildContentMessagesAsync`）

### 5. 图片生成 `/image` · Image

* **用途**：脱离任务上下文的纯出图。多图 grid + 失败重试 + 本地队列（v0.8 B5）
* **场景**：手头要一张封面图但还没建任务
* **背后接口**：`POST /api/image/prompt`（提示词生成）→ `POST /api/image/generate`（出图）

### 6. 工作区 `/workspace` · Briefcase（**B5 NEW**）

* **用途**：B5 把 `/history`（AIOutput 历史）+ `/assets`（图片素材库）合到一处，两个 tab：
  * `?tab=history`：500 条 AIOutput，按 type / platform / source 过滤
  * `?tab=assets`：所有 Asset，含收藏（Setting 表 `asset:fav:*` key）/ 标签 / 关联 task / 多选下载 zip
* **场景**：找之前的图、找之前生成的文案、关联到当前任务
* **进入**：NAV → "工作区"。`/history` 和 `/assets` 旧 URL 仍 200（B5 仅从 NAV 移除）

### 7. 客户 `/clients` · Users

* **用途**：B5 整合 `/pricing` 进来，两个 tab：
  * `?tab=list`：客户档案 + ClientNote
  * `?tab=pricing`：报价方案 27 个 PricePackage（引流款 / 标准款 / 利润款）
* **场景**：接单前查客户历史；准备报价时调一档套餐
* **进入**：NAV、`/pricing` 自动 307 → `/clients?tab=pricing`（middleware + page.tsx 双兜底）

### 8. 关键词库 `/keywords` · Tags

* **用途**：65 行 Keyword + bulk 操作（POST /api/keywords/bulk）+ AI 扩词（POST /api/keywords/expand）
* **场景**：写文案前先 grep 关键词、定 SEO

### 9. 私信话术 `/scripts` · MessageCircle

* **用途**：11 条预设话术（小红书首轮 / 闲鱼咨询转拍 / 客户犹豫 / 客户压价 / 急单报价 / 包月转化 / 交付说明 ⋯，见 `constants.ts SCRIPT_TYPES`）
* **场景**：客户来信秒回、防止重复打字

### 10. 模板 `/presets` · SlidersHorizontal

* **用途**：B5 起 3 个 tab，把 v0.9.2 b1 上线的 prompt 模板编辑器吸入：
  * `?tab=image`（默认）：6 个 ImagePreset，每个含 styleKeywords / negativePrompt / primaryColor / accentColor 等
  * `?tab=content`：所有自定义 prompt 模板（vs 默认 diff 双栏 + 新增/编辑），覆盖 6 个 DEFAULT_PROMPTS（xiaohongshu:case / xiaohongshu:tutorial / xianyu:product / image:suggest / title:refine / suggestion:weekly）
  * `?tab=agent`：Agent System Prompt 编辑器占位（v0.9.2 b2 后落地）
* **进入**：NAV、`/prompts` 自动 307 → `/presets?tab=content`

### 11. API 适配器 `/adapters` · Plug

* **用途**：5 个内置 adapter（kie-gpt-image-2 / kie-flux-kontext-pro / openai-dalle-3 / openai-gpt-img-2 / 4router-gpt-image-2 / generic-openai-compatible），每个含 `requestBuilder / responseParser / pollHistory / curl-parser` 全套 trace
* **场景**：换中转站、新增模型供应商；adapter 干跑测试用 ProgressBar.determinate（不消耗实际 token，但会发一次连通请求）
* **背后**：Setting 表 `adapter:*` key（每条 600-1000 字节 JSON）+ `IMAGE_DEFAULT_ADAPTER` 选当前活跃

### 12. 数据复盘 `/analytics` · BarChart3

* **用途**：Metrics 表的导入 + 展示。可 `/analytics/import` 上传 CSV
* **场景**：周末做数据分析、看哪条帖子效果好

### 13. 综合工具 `/tools` · Wrench（**B5 NEW**）

* **用途**：B5 把 `/weekly-report` + `/calculator` 合到一处：
  * `?tab=weekly`（默认）：自动生成的本周报告
  * `?tab=calc`：报价计算器（基于 PricePackage）
* **场景**：周日复盘 / 接单时算一单
* **进入**：NAV、旧 `/weekly-report` `/calculator` URL 仍 200

### 14. 设置 `/settings` · Settings

* **用途**：API Keys 池（v0.11 B1 主功能）+ 旧 LLM/IMAGE Setting fallback + 系统状态
* **场景**：换 key、加备用 key、看 totalRequests / totalErrors 统计

## 6 个保留 URL（B5 从 NAV 移除但仍可达）

| URL              | 用途                                       | 现在在哪能找到入口                                |
|------------------|--------------------------------------------|---------------------------------------------------|
| `/history`       | AI 输出历史（旧主入口）                    | `/workspace?tab=history`                         |
| `/assets`        | 素材库（旧主入口）                          | `/workspace?tab=assets`                          |
| `/contents`      | 内容仓库（Post + Product 列表）             | 任务卡上的"已生成"链接、Cmd+K → "内容"            |
| `/suggestions`   | AI 运营建议列表                             | dashboard 4 区双卡之一会显示前 5 条（按需）       |
| `/weekly-report` | 周报告                                       | `/tools` 默认 tab                                  |
| `/calculator`    | 报价计算器                                  | `/tools?tab=calc`                                  |

> 之所以这 6 个 URL 保留可达：recon §三.E 显示这些路径在历史 deeplink 中出现 ≥ 16 次，强 redirect 风险高。`/pricing` 和 `/prompts` 是少数可以强 307 的（B5 验证过 finalUrl + HTML 体）。

## 移动端入口

`/m` 顶部右上角 `桌面版` 按钮把 `view_mode` cookie 写成 `desktop` 然后跳同名桌面路径。MobileShell 一共 5 个 Tab：`/m` `/m/today` `/m/content` `/m/image` `/m/me`。其余 18 个 m 子页（如 `/m/calendar/3`）走 router.back 返回。

## 看不到的小细节

- 顶部面包屑 `Breadcrumbs.tsx` 自动从 `pathname` 拆出层级（v0.8 B6 上线）
- sidebar 折叠状态记忆在 localStorage `sidebar:collapsed`（B6 起折叠时只显 16px lucide icon）
- B2 起 sidebar 自身 sticky + 独立滚动（修 22/22 drift），主内容包在 `max-w-[1400px] mx-auto`，4K 屏不拉超长行
- B4 起 (admin) 与 m 各有独立 `error.tsx` / `not-found.tsx` / `loading.tsx`，404 页含 brand 文案"找不到这个页面"
