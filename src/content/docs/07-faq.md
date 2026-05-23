# 常见问题 FAQ

按问题出现频率排。每条问题配一个最少步骤的解决方案。如果都试了还不行，看 [故障排查与日志](/docs/09-troubleshooting) 拿原始日志。

## Q1：图片质量很差 / 模糊 / 文字乱码

**先确认是哪种"差"**：

| 现象            | 可能原因                                        | 解决                                              |
|-----------------|-------------------------------------------------|---------------------------------------------------|
| 整张糊         | 模型本身能力（gpt-image-2 在某些类目就糊）       | 换 adapter（参 [图片生成最佳实践](/docs/04-image-best-practices)），试 kie-flux-kontext-pro |
| 文字乱码        | gpt-image-2 类模型对中文字渲染弱                | 切 kie-flux-kontext-pro adapter；textLanguage 改 en |
| 风格不统一      | preset 没选，或 styleKeywords 太宽               | `/presets?tab=image` 选一个具体的，imageOptions.sameStyle=true |
| 颜色花          | primaryColor / accentColor 没填                 | 抽屉里图片选项填具体 hex                           |
| 主体不对        | prompt 7 维 subject 写得太抽象                   | 在 imageOptions.styleKeywords 加 1-2 个名词约束     |

**如果连续 3 次都差**：去 `/api/health`，看 `recentFailures.image` 不是 null 时显示 lastError，可能是模型代理本身在抖。

## Q2：生成请求返回 401 / "未授权"

API key 错或者过期。3 步定位：

```
1. 打开 /api/health → apiKeyPool.llm.lastError 是不是 401 / unauthorized
2. 打开 /settings → API Keys 池里那条 key 的 consecutiveErrors 是不是 ≥ 3
3. 那条 key 是不是被自动 active=false 了（红色徽章 disabled）
```

修复：

- 去中转站后台看 key 还在不在 / 余额够不够
- 在 /settings 编辑那条 key（apiKey 字段提交新值就覆盖；空字段保留原值，B1 约定）
- 测试连通性按钮（GET /models，0 token），通过后 active 自动恢复

如果你有备用 key，进 /settings 把备用那条 priority 设小一点（例 -1），主用 fail 时立即接管。

## Q3：中转站换了 / 想换一家试试

**纯换 key + baseUrl**：

```
/settings → API Keys 池
  方案 A：编辑当前那条 → 改 baseUrl + apiKey
  方案 B：保留当前那条 active=false，新增一条 priority=-1
```

**如果还要换 model**：同步改 `model` 字段（例 `gpt-image-2` → `dall-e-3`）。

**如果新中转站 API 接口形状不同**（少见，大部分中转站都兼容 OpenAI 协议）：

```
/adapters → 复制 generic-openai-compatible 改 requestBuilder + responseParser
然后 /settings → IMAGE_DEFAULT_ADAPTER 切到新 slug
```

## Q4：怎么用多 API key、自动切换

参 [快速开始](/docs/01-quick-start) 第 1 步末尾。简言之：

```
/settings → API Keys 池
[+ 新增 LLM key]  ×N，priority 0 / 1 / 2…
```

行为：
- 主请求时按 `priority asc` 取第一条 active
- 失败时 consecutiveErrors++
- ≥ 3 次失败自动 active=false → 下次自然切下一条
- 测试连通性会 reset consecutiveErrors（成功时）

## Q5：容器重启了 / 上次的数据还在吗

**会在**。SQLite 数据库走 docker volume `app_data`（挂载点 `/data/dev.db`）。容器删了卷不删，数据还在；卷也删了，要靠备份恢复（参 [数据备份指南](/docs/08-backup)）。

每次容器启动会自动跑：

```
[entrypoint] prisma db push (sync schema)
[entrypoint] starting Next.js
```

如果 schema 有改动会自动 push 到 SQLite，不破坏数据（nullable-safe）。

> v0.11 B1 起加了 ApiKey 表，启动时自动从 Setting 表 LLM_API_KEY / IMAGE_API_KEY seed 一条主用 ApiKey（label="LLM 主用（v0.11 自动迁移）" priority=0）。已经有数据的不会重新 seed。

## Q6：dashboard 看不到数据 / 都是 0

`/api/dashboard/summary` 失败时 dashboard 会渲染默认 0。看：

```
1. /api/health → ok=true / db=ok 必须都对
2. /api/dashboard/summary → 直接 fetch 看 JSON
3. 如果 status=500，看 docker logs（参 故障排查 篇）
```

DB 里如果根本没数据（新装的容器），dashboard 6 个 KPI 全是 0 是正常的。建第一个 task 后就有数。

## Q7：sidebar 跟着主区域滚（v0.11 之前的老问题）

v0.11 B2 已修。如果还看到这问题：

```
1. 强制刷新 Cmd+Shift+R 清浏览器缓存
2. 检查 /api/health.version 是不是 "v0.11"（不是说明部署没上）
3. 如果版本对但还跟动 → 跑 ssh 上 docker logs design-ai-ops --tail 50 看有没有 hydration error
```

修复路径：`AdminShell.tsx` aside 加了 `lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto` + 父容器 `lg:items-start`（详见 b2 报告）。

## Q8：404 看到 Next.js 默认页（不是 brand 页）

v0.11 B4 已修。如果看到默认页，说明部署没上 B4：

```
1. /api/health.version 是不是 "v0.11"
2. /xxx-not-exist 应返回 brand 页含"找不到这个页面"+"回首页"
   (root not-found.tsx + (admin)/not-found.tsx + m/not-found.tsx 三段都有)
```

## Q9：移动端底部按钮被 home indicator 盖

v0.11 B2 已修，移动 nav 加 `pb-[env(safe-area-inset-bottom)]`。如果还盖：

- 检查浏览器是不是没读 viewport meta（Safari 旧版本会忽略 env() — 当前 mainline 都支持）
- 强刷新缓存

## Q10：prompts 模板改了不生效

v0.9.2 b1 起所有生成路由都 await async builder。如果不生效：

```
1. 看 /api/health.customPromptCount 是不是 ≥ 1（你确实有自定义 prompt）
2. 看 /presets?tab=content 那条 prompt 的 key 是不是匹配（xiaohongshu:case 写错成 xiaohongshu_case 不会被读）
3. 用 vs 默认 diff 看你改的内容确实存进去了
```

key 命名清单（DEFAULT_PROMPTS 内置 6 条）：

```
xiaohongshu:case
xiaohongshu:tutorial
xianyu:product
image:suggest
title:refine
suggestion:weekly
```

## Q11：publish-director 跑一半失败 / 抽屉关掉了

任务状态会停在 `pending`（因为没走到 task.status 反写）。重新点 🎯 全流程发布会**重头跑**（再过一次 LLM step1，**消耗 token**）。

如果只想重生 step3 的图：直接去 `/workspace?tab=assets` 找之前 step2 的 stylePrompt（落在 AIOutput），手动调 `/api/image/generate` — 但当前没有 UI，是 v0.9.2 b4 失败重放功能要做的事。

## Q12：怎么备份 / 恢复

参 [数据备份指南](/docs/08-backup)。一键备份命令：

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p /root/dao-backup/$TS-manual
cp /data/dev.db /root/dao-backup/$TS-manual/dev.db
tar czf /root/dao-backup/$TS-manual/src.tgz /opt/design-ai-ops/src /opt/design-ai-ops/prisma
```

## Q13：哪里看版本号

`/api/health` JSON 顶层 `version` 字段。当前应是 `"v0.11"`。/dashboard 系统健康卡也显示这个。
