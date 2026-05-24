# 市场趋势数据

> v0.11 B10 上线 · 当前阶段是 UI 框架 + 手填 + 内置说明，未来 v0.10 Chrome 扩展会自动喂数据。

## 三平台是什么、为什么我们关注它们

设计接单工作台关注的平台不是「我们在哪儿」，而是「单子从哪儿来 / 钱从哪儿来 / 趋势从哪儿来」。当前固定关注三平台：小红书 · 闲鱼 · 千牛（淘宝 / 天猫）。理由：

- **小红书**：种草社区，决定「品类视觉趋势」（什么风格、什么色系、什么字体在火）
- **闲鱼**：标品 + 服务双跑道，决定「散单成交价格」+「模板素材市场」
- **千牛（淘宝/天猫）**：电商大盘，决定「店铺设计需求量」+「行业关键词热度」

三个平台的趋势各看一次，工作台才不会闭门造车。每天看 5 分钟，就能让任务卡封面字 / 主图风格踩在大盘上。

## 趋势数据从哪儿来

当前 v0.11 B10 阶段：

1. **内置说明**：三平台的定位 / 用户画像 / 适合品类 / 推荐工作流，固定写在代码里（`src/lib/market/seed.ts`），随版本更新一次。
2. **手填**：dashboard 第 5 区每个平台有「编辑数据」按钮，弹小 modal 让你直接填 KPI 数值（例：今日热门关键词数 = 38、近 7 天 GMV = 12000、平均客单价 = 168）。
   - 落到 `Setting` 表 key `market:snapshot:<platform>:<YYYY-MM-DD>`
   - 一天一行，再次填会覆盖（不重复入库）
   - 0 LLM/IMAGE 消耗
3. **未来 v0.10 Chrome 扩展**：
   - 你装好 design-ai-ops-sync 扩展后，正常浏览三平台后台，扩展 hook response → POST 到 `/api/market/trends/sync`
   - 服务端按平台自动分流到 `Setting` 表
   - 前端无需任何改动，徽章自动从「📝 示例」变「🟢 扩展」

> 为什么不直接服务端爬？路线图 §九 + 用户原话已锁：**不写签名逆向 / 设备指纹伪造 / 验证码识别 / 模拟登录**。VPS 容器没装 Playwright/headless 浏览器，主动爬虫不现实。所以选 Chrome 扩展（A 方案）+ 手填兜底。

## 适用工作流

最经典的一条线：

```
早上 9:30 看一次 dashboard 第 5 区
   ▼
小红书 Tab → 看「热门关键词数」+「爆款平均点赞」
   ▼
脑里抓一个今天该跟的趋势词（例：「极简日杂」）
   ▼
进 /today → 新建任务 → category=封面图，标题草稿带这个趋势词
   ▼
🎯 全流程发布
   ▼
publish-director 三步 → 拿到带「极简日杂」字的封面候选
   ▼
浏览器手动发布到小红书
   ▼
晚上 22:00 回 dashboard 看新增「编辑数据」记一下今日真实数据
```

闲鱼路径类似，看「在售商品数 + 近 7 天浏览量 + 询单转化率」三个 KPI，决定要不要给浏览高询单低的商品换标题或封面。

千牛路径偏长尾：周一上午看一次行业热词 + 同行新主图 → 给月度包养客户出本周建议。

## 字段含义

每个平台有 6 个推荐 KPI（顺序与 dashboard 渲染一致）。

### 小红书

| KPI key | 中文 | 单位 | 含义 |
|---|---|---|---|
| `hotKeywords` | 热门关键词数 | 个 | 今日笔记 TOP100 中出现 ≥3 次的关键词数 |
| `avgLikes` | 爆款平均点赞 | — | 近 7 天点赞 >1000 的笔记平均值 |
| `avgCollects` | 爆款平均收藏 | — | 近 7 天收藏 >500 的笔记平均值 |
| `orderQuoteAvg` | 平均询单报价 | 元 | 私信里客户报的预算平均值（手动维护） |
| `activeAccounts` | 活跃账号数 | 个 | 近 7 天发过 ≥1 篇笔记的账号 |
| `newFans7d` | 近 7 天新增粉丝 | 人 | 账号粉丝净增（创作中心 → 数据 → 粉丝） |

### 闲鱼

| KPI key | 中文 | 单位 | 含义 |
|---|---|---|---|
| `liveProducts` | 在售商品数 | 个 | 当前 status=on_sale 的商品总数 |
| `views7d` | 近 7 天浏览量 | — | 所有商品的 views 总和 |
| `wants7d` | 近 7 天「想要」数 | — | 所有商品的 wants 总和 |
| `consultRate` | 询单转化率 | % | 私信会话数 / 浏览量 × 100 |
| `avgPrice` | 平均成交价 | 元 | 近 30 天订单的均价 |
| `topCategory` | 最热类目占比 | % | TOP1 类目浏览量占总浏览量的比例 |

### 千牛（淘宝/天猫）

| KPI key | 中文 | 单位 | 含义 |
|---|---|---|---|
| `storeUv7d` | 近 7 天店铺 UV | — | 生意参谋 → 流量 → 访客数 |
| `storePv7d` | 近 7 天店铺 PV | — | 生意参谋 → 流量 → 浏览量 |
| `storeTransactions7d` | 近 7 天成交笔数 | 笔 | 生意参谋 → 交易 → 支付订单 |
| `avgGmv` | 平均客单价 | 元 | 支付金额 / 支付订单数 |
| `topKeywords` | 行业热词数 | 个 | 生意参谋 → 市场 → 热搜词 TOP100 |
| `designPipeline` | 在做设计单数 | 单 | 当前 status=进行中 的店铺设计单数（手动维护） |

## API 速查

不打开 dashboard 也可以从 HTTP 接口直接读：

| 路径 | 方法 | 用途 |
|---|---|---|
| `/api/market/platforms` | GET | 三平台 PlatformInfo（介绍 + 推荐 KPI） |
| `/api/market/trends?platform=xiaohongshu` | GET | 平台最近 N 条 snapshot |
| `/api/market/trends?platform=xiaohongshu&limit=30` | GET | 平台最近 30 条 |
| `/api/market/trends` | POST | 写入新 snapshot（body: `{platform, date?, dataPoints, source?, placeholder?, note?}`） |
| `/api/dashboard/summary` | GET | 返回的 `marketTrends` 字段一并带过来 |
| `/api/health` | GET | `marketTrendsModule.enabled` + `snapshotCount` |

POST 校验：
- `platform` 必填，仅接受 `xiaohongshu / xianyu / qianniu`
- `dataPoints` 必填，至少 1 条
- 单条 `value` 必须是有限数（`Number.isFinite(value) === true`）
- 写入时间 `capturedAt` 由服务端补，客户端给了也会被覆盖

## 注意事项

- 「编辑数据」一天写一次（按 `YYYY-MM-DD` 覆盖），同一天多次保存会覆盖；想保留历史就手动改前一天的 date 后再保存
- placeholder=true 的 snapshot 卡片会打「📝 示例」徽章，避免误以为是真数据
- 当前数据**不**入 prisma 表，只在 `Setting` 表里活动；`Setting` 表是 SQLite，自动跟着 `dev.db` 备份
- 未来要扩展品类（例加视频号 / 抖音）时，改三处：`PLATFORM_SLUGS` 加 slug + `seed.ts` 加 PlatformInfo + 推 push.sh seed 一次

## 不会做的

- 主动爬虫（用户原话锁死）
- 服务端 headless 浏览器（VPS 资源不够 + 不在路线范围）
- 设备指纹伪造 / 验证码识别 / 模拟登录
- 多账号 cookie 池

如果将来确实需要 hook 平台 API，路径只有一条：v0.10 b1 上线 SyncToken 后，让 Chrome 扩展 POST 数据进 `/api/market/trends/sync`（v0.10 b1 路线图）。本批先打好基础设施。
