# 故障排查与日志

事情坏了的时候，按这一篇的顺序拿信息。先 `/api/health` → 再 `docker logs` → 再 Playwright 走查 → 最后失败重放。

## 一图：故障定位流

```
事情坏了
   │
   ▼
[1] GET /api/health         ← 第一手最快
   │  ok=true / db=ok ?      → 不对，看 §一
   │  apiKeyPool 状态 ?      → 不对，看 §二
   │  recentFailures ?       → 有值，看 §三
   ▼
[2] docker logs design-ai-ops --tail 200 --since 1h
   │                        → 看 §四
   ▼
[3] Playwright 走查（30 路径）
   │                        → 看 §五
   ▼
[4] 失败重放 /history       → 看 §六
```

## §一 `/api/health` 字段速查

```jsonc
{
  "ok": true,                                // 顶层 false → DB 连不上 / 容器异常
  "db": "ok",                                // db: 'ok' | 'error: ...'
  "version": "v0.11",                        // B1 起从 v0.9 升 v0.11
  "startedAt": "2026-05-24T12:30:00.000Z",   // 容器启动时间
  "uptimeMs": 11,                            // 当前 request 的处理耗时
  "serverUptimeMs": 3366059,                 // 容器跑了多久
  "agentRoutes": 8,                          // findAgent 注册总数（应永远 8）
  "imageDefaultAdapter": "4router-gpt-image-2", // 当前活跃 IMAGE adapter slug
  "customPromptCount": 0,                    // Setting 表 prompt:* 行数
  "publishDirectorStats": {                  // 24h 滚动
    "total": 10,
    "success": 10,
    "fail": 0
  },
  "recentFailures": {                        // 最近一次失败原因（≤120 字符，sk-*** 已脱敏）
    "llm": null,
    "image": null
  },
  "apiKeyPool": {                            // v0.11 B1 起
    "llm":   { "total": 1, "active": 1, "lastError": null },
    "image": { "total": 1, "active": 1, "lastError": null }
  }
}
```

**判定速查**：

| 字段                              | 期望              | 不对意味着                         |
|-----------------------------------|-------------------|------------------------------------|
| `ok`                              | true              | DB 连接挂 / Prisma 没初始化         |
| `db`                              | "ok"              | 同上                               |
| `version`                         | "v0.11"           | 部署没上 B1+                        |
| `agentRoutes`                     | 8                 | 路由注册有问题（registry.ts 改坏了）|
| `apiKeyPool.{llm,image}.active`   | ≥ 1               | 池里 key 全 disabled，需修         |
| `apiKeyPool.{llm,image}.lastError`| null              | 有值 → key 错 / 中转站挂           |
| `recentFailures.{llm,image}`      | null              | 有值 → 最近调用失败过              |
| `publishDirectorStats.fail`       | 0（理想）         | > 0 表示 24h 内 publish-director 失败次数 |

## §二 apiKeyPool 异常

`active: 0 / total: 1` 意思是：池里有 1 条 key，但被自动 disable 了。

**修复**：

```
1. /settings → API Keys 池
2. 找到 active=false 的那条（红色徽章 disabled）
3. 点编辑 → 检查 baseUrl / apiKey
4. 提交时勾"启用 + 重置错误计数"（PUT 时带 resetErrors:true）
5. 点测试连通性确认（GET /models, 0 token）
```

**或者直接换备用**：再加一条 priority=-1 的 key，主用即使没修也不影响业务。

## §三 recentFailures 解读

```json
"recentFailures": {
  "llm":   "POST /api/content/generate failed at 2026-05-24T...: 401 unauthorized",
  "image": null
}
```

| 错误码 / 关键字            | 含义                                | 解决                                              |
|----------------------------|-------------------------------------|---------------------------------------------------|
| `401 unauthorized`         | API key 错                          | 去 /settings 改 key                                |
| `429 too many requests`    | 中转站限流                          | 降低并发 / 加备用 key / 等几秒                     |
| `500 / 502 / 503 / 504`    | 中转站本身挂                        | 等中转站恢复 / 切 adapter                          |
| `timeout / aborted`        | 网络慢，或者 prompt 太长 model 算不完 | 缩短 prompt / 调中转站长连接                       |
| `JSON parse error`         | 模型输出不规范                      | 改 prompt 让它输出严格 JSON / 切 model              |
| `negative prompt rejected` | 模型不接受 negative_prompt 字段      | 切 adapter / 把 negativePrompt 留空                |

## §四 docker logs

ssh 上 VPS：

```bash
# 最近 200 行
docker logs design-ai-ops --tail 200

# 最近 1 小时
docker logs design-ai-ops --since 1h

# 最近 24 小时 + 找 error
docker logs design-ai-ops --since 24h 2>&1 | grep -iE 'error|fail|warn' | tail -50

# 服务端 throw 全栈
docker logs design-ai-ops --since 24h 2>&1 | grep -A 10 'Error:' | head -100
```

**正常运行时应看到**：

```
[entrypoint] prisma db push (sync schema)
Prisma schema loaded from prisma/schema.prisma
[entrypoint] starting Next.js
   ▲ Next.js 14.2.18
   - Local:   http://localhost:3000
   ✓ Ready in 1547ms
```

**0 error / 0 warn / 0 exception** 是正常基线（v0.9 b3 审计 + 后续每个 batch walk 都验证过）。出现 ⤵ 这些之一，需调查：

- `Failed to find Server Action` — 旧 v0.6 BUG-3，应该 0；如果再出现说明某个 client form action 没 await
- `PrismaClientKnownRequestError` — schema 不一致 / 数据冲突
- `next-auth ...` — 没装但被 import（不应该出现）
- `ECONNREFUSED` — 中转站不可达

## §五 Playwright 走查（深度故障扫）

每个 batch 的报告里都有一份 `walk-XX-out.txt`，30+ 路径全跑一遍。手动重跑：

```bash
ssh root@159.65.137.157
WORK=/tmp/walk-debug
mkdir -p $WORK
# 把对应 walk.mjs scp 上去（或复用 v011-b6-files/walk.mjs 模板）
docker run --rm --network host \
  -v "$WORK:/work" -w /work \
  -e BASE_URL=http://127.0.0.1:3000 \
  mcr.microsoft.com/playwright:v1.50.0-noble \
  bash -c '
    cd /work
    npm init -y >/dev/null 2>&1
    npm i playwright@1.50.0 --no-audit --no-fund --silent 2>&1 | tail -3
    node walk.mjs
  '
cat $WORK/report.json | python3 -m json.tool | less
```

报告里关注：

| 字段                 | 值期望            | 不对说明                         |
|----------------------|-------------------|----------------------------------|
| `status`             | 200（除 / → 307） | 路由挂                           |
| `consoleErrors`      | []                | 客户端代码崩                      |
| `networkErrors`      | []                | API 5xx / 4xx                     |
| `pageErrors`         | []                | hydration / runtime              |
| `sidebarProbe.drifted`| false（桌面端）   | B2 sticky 挂了                    |
| `sidebarProbe.topDelta`| ≤ 4 px            | 同上                             |

**检查 dashboard 4 区都在**：`probeDashboardZones` 里 hits今日 / 待办 / 系统健康 / 新建任务 / 写文案 / 出图 / 全流程发布 都应 ≥ 1。

## §六 失败重放（v0.9 b3 已落盘）

`/workspace?tab=history`（旧 /history） 列出 500 条 AIOutput。每条 publish-director 输出有个标识"🎯 发布导演"。点进去能看到：

- styleSummary（step1 文案摘要）
- seriesPlan（step2 系列规划）
- imageOptions（用户当时的设置）
- imageUrls（生成的图）

**v0.11 当前**：单图重放还没做（要等 v0.9.2 b4），但你可以：

1. 复制 stylePrompt 文本
2. 去 `/image` 页粘贴 → 直接发到 image adapter
3. 调出新图

## 当 `/api/health` 也 500 了

说明容器没跑起来。ssh 上：

```bash
# 容器状态
docker ps -a --filter name=design-ai-ops

# 不是 healthy
docker compose -f /opt/design-ai-ops/docker-compose.yml restart

# 还不行 rebuild
cd /opt/design-ai-ops
docker compose build && docker compose up -d
sleep 30
docker logs design-ai-ops --tail 50
```

## 安全降级清单

如果遇到非常糟的情况（容器挂 + 数据库可能损坏），按顺序：

```
1. 不要先 rebuild。先 docker compose stop（保留容器以便 docker exec 调试）
2. cp /data/dev.db /tmp/dev.db.broken                    # 留一份"坏的"用于事后分析
3. 恢复最近一次备份（参 数据备份指南 §恢复 dev.db）
4. docker compose up -d
5. 等 30 秒 curl /api/health
6. 没问题 → 把 /tmp/dev.db.broken 也 scp 回本地存档
```

**联系开发团队（自己）的最少信息**：

```
1. /api/health JSON 完整复制
2. docker logs design-ai-ops --tail 100 输出
3. /api/health.version + git rev-parse HEAD
4. 复现路径（哪个 page / 哪个动作）
5. 浏览器 console 截图（如果是客户端问题）
```
