# 数据备份指南

工作台所有重要数据落在两个地方：SQLite `dev.db`（任务 / 客户 / Asset / Setting）+ uploads 目录（手动上传的图）。这一篇讲怎么手动备 + 自动备（B0 已建立）+ 怎么恢复。

## 数据落在哪

| 路径                              | 内容                                        | 大小（参考）     |
|-----------------------------------|---------------------------------------------|------------------|
| `/data/dev.db`                    | SQLite 主库（15 张表，含 ApiKey）            | ~330 KB / ~70 task / ~67 AIOutput |
| `/app/public/uploads`             | 手动上传的图（docker volume `app_uploads`） | ~50 MB / ~43 文件 |
| `/opt/design-ai-ops/prisma/schema.prisma` | schema 定义                       | 8.5 KB           |
| `/opt/design-ai-ops/src/`         | 源码（git 管控）                            | ~250 KB / ~310 文件 |
| `/opt/design-ai-ops/.git`         | git 历史                                     | varies           |

> 如果你想问"我的 prompt 模板存哪了"：在 `Setting` 表，key 是 `prompt:xiaohongshu:case` 这种。备 dev.db 就能备到。

## 三种备份场景

### 场景 1 · 临时手动备份（要改危险东西前）

ssh 上 VPS，跑：

```bash
TS=$(date -u +%Y-%m-%dT%H-%M-%SZ)
BACKUP=/root/dao-backup/$TS-manual
mkdir -p "$BACKUP"
cp /data/dev.db "$BACKUP/dev.db.before"
tar czf "$BACKUP/src.tgz" /opt/design-ai-ops/src /opt/design-ai-ops/prisma
git -C /opt/design-ai-ops rev-parse HEAD > "$BACKUP/git-head-before.txt"
ls -la "$BACKUP"
```

输出：

```
/root/dao-backup/2026-05-24T08-15-30Z-manual/
├── dev.db.before          (~330 KB)
├── src.tgz                (~245 KB · 309 文件 src + prisma)
└── git-head-before.txt    (40 B · 当前 commit hash)
```

### 场景 2 · 已有的 B0 自动备份（每个 batch 之前）

v0.11 路线图 B0 起，每个 batch（B1 / B2 / B3 / B4 / B5 / B6 / B7 / B8）跑前都自动落一份：

```
/root/dao-backup/
├── 20260523T151231Z-v011-pre/     ← B0 基线，含 walk.tgz 30 张截图
├── 2026-05-23T15-52-13Z-v011-b1/  ← B1 多 key 池前
├── 2026-05-23T16-15-31Z-v011-b2/  ← B2 sidebar 重构前
├── 2026-05-23T16-45-52Z-v011-b3/  ← B3 dashboard 重构前
├── 2026-05-23T17-09-27Z-v011-b4/  ← B4 UI/UX polish 前
├── 2026-05-23T17-37-48Z-v011-b5/  ← B5 NAV 整合前
└── ... (B6/B7/B8 陆续)
```

每个目录里有 `git-head-before.txt`（提交 hash）+ `src/`（受影响文件镜像）+ 视情况 `prisma/` `dev.db.before`。

> B0 这次特别加了 `walk.tgz` （5.0 MB · 30 张 Playwright 截图）作为基线，可以用来对比"v0.11 之前页面长啥样"。

### 场景 3 · 长期定期（推荐每周一次）

cron 一行，进 root 的 crontab：

```bash
crontab -e
```

加：

```cron
0 3 * * 0 TS=$(date -u +%Y-%m-%dT%H-%M-%SZ) && mkdir -p /root/dao-backup/$TS-weekly && cp /data/dev.db /root/dao-backup/$TS-weekly/dev.db && tar czf /root/dao-backup/$TS-weekly/uploads.tgz /var/lib/docker/volumes/design-ai-ops_app_uploads/_data 2>/dev/null && find /root/dao-backup/ -name "*-weekly" -mtime +60 -exec rm -rf {} \;
```

每周日 03:00 UTC 备 dev.db + uploads，并删 60 天以前的 weekly。**不**自动备 src/（git 已经管了，没必要重复）。

## 恢复流程

### 恢复 dev.db（最常见）

```bash
# 1. 停容器避免写冲突
cd /opt/design-ai-ops
docker compose stop

# 2. 替换数据库
TS_DIR=/root/dao-backup/<目标时间戳>
cp "$TS_DIR/dev.db.before" /data/dev.db
chown 1001:1001 /data/dev.db   # nextjs 用户

# 3. 启动
docker compose up -d

# 4. 验证
sleep 10
curl -s http://127.0.0.1:3000/api/health | python3 -c "import json,sys;j=json.load(sys.stdin);print('ok=',j['ok'],'db=',j['db'])"
```

**预期**：`ok=true db=ok`，dashboard KPI 数字回到备份时点。

### 回滚源码（如果某 batch 部署后出问题）

```bash
TS_DIR=/root/dao-backup/<目标 batch 时间戳>
cd /opt/design-ai-ops

# 1. 用 backup 里的 src/ 恢复
cp -a "$TS_DIR/src/." /opt/design-ai-ops/src/

# 2. 或者用 git 直接 checkout 到 commit
HEAD_BEFORE=$(cat "$TS_DIR/git-head-before.txt")
git checkout $HEAD_BEFORE -- .

# 3. rebuild
docker compose build
docker compose up -d
```

每个 batch 的报告（如 `D:\xm\design-ai-ops-v0.11-b5-consolidation.md` §五）都列了具体回滚命令。

### 恢复 uploads 卷

```bash
docker compose stop
TS_DIR=/root/dao-backup/<weekly 时间戳>
docker run --rm -v design-ai-ops_app_uploads:/dst -v "$TS_DIR":/src busybox \
  sh -c 'rm -rf /dst/* && tar xzf /src/uploads.tgz -C /dst --strip-components=8'
docker compose up -d
```

> `--strip-components=8` 是因为 tar 里的路径是绝对路径 `/var/lib/docker/volumes/design-ai-ops_app_uploads/_data/...`，需要剥到 `_data` 之后再解。如果你的 docker 安装路径不同，调这个数字。

## 验证备份是有效的（重要）

备完不试一次恢复 = 没备。建议每月最后一天：

```bash
# 1. 找最近一次 weekly
LATEST=$(ls -dt /root/dao-backup/*-weekly | head -1)

# 2. 临时挂到一个 sandbox 容器里看（不影响生产）
docker run --rm -v "$LATEST/dev.db":/data/dev.db:ro alpine \
  sh -c 'apk add sqlite >/dev/null && echo ".tables" | sqlite3 /data/dev.db'
```

**预期输出**包含这 16 张表（v0.11 B1 起）：

```
AIOutput   ApiKey   Asset      Category   Client      ClientNote
ImagePreset Keyword  Metric    Post        PricePackage Product
Schedule   Script   Setting   Task
```

如果输出少表 / 或者空 → 这个备份有问题，去查上一次备的。

## 备份策略建议

| 频率   | 保留   | 内容                                |
|--------|--------|-------------------------------------|
| 每周日 | 60 天  | dev.db + uploads（cron 自动）       |
| 每 batch 前 | 永久 | dev.db + src/ + git hash（路线图自动） |
| 每月一次 | 永久 | 完整 prisma export（json + schema）— 防 SQLite 文件腐烂 |

最后这条手动跑一次：

```bash
docker exec design-ai-ops sh -c 'cd /app && npx prisma db pull --print > /tmp/schema-snapshot.prisma'
docker exec design-ai-ops sqlite3 /data/dev.db .dump > /root/dao-backup/dump-$(date +%Y%m).sql
```

`.sql` 文件可以在任何 SQLite 版本上恢复，不依赖容器镜像。

## 不要做的

- ❌ `rm -rf /root/dao-backup/*`（会删 B0/B1/B2 ⋯ 所有 batch 备份）
- ❌ 在不停容器情况下 `cp /data/dev.db ...`（SQLite WAL 模式可能写到一半，备出来的库损坏）
- ❌ 把 ssh key passphrase / Setting LLM_API_KEY 明文写进备份的 README — backup 目录权限是 700，但泄露还是泄露

## 💾 磁盘清理 (v0.11 B15.7)

> 这一节是 v0.11 B15.7 闭 BUG-L12（self-check §十一 #7）后新加的：当 VPS 根分区 ≥ 85% 时，dashboard 顶部会显示一条 **磁盘紧张** 警告卡，链回这里。

### 为什么需要

Asset 表（图片素材）随着 publish-director 跑得多会一直涨，又因为约束「**不动 prisma schema**」（不加 archived / deletedAt 字段），所以选了**软清理 + 文件 unlink + 删行**这条路。已收藏的 Asset 永远受保护。

### 工作原理

清理脚本：`/app/scripts/cleanup-assets.mjs`

清理条件三个 AND：

1. `Asset.createdAt < (now - DAYS)` — 默认 30 天，可用 `DAYS=60` 等环境变量调
2. `Asset.url LIKE '/uploads/%'` — 只清本地 uploads，外链 URL（中转站直返）原样保留
3. `Asset.id NOT IN (SELECT extracted_id FROM Setting WHERE key LIKE 'asset:fav:%')` — 收藏列表绝对不动

收藏 key 形如 `asset:fav:<assetId>` 或 `asset:fav:<assetId>:1`，脚本截 `:` 第一段反查 assetId。

### 默认 dry-run

容器启动时 `entrypoint.sh` 会**自动跑一次 dry-run**（只读 prisma + fs.stat），把候选数 + 可释放 MB 写到 `docker logs`：

```bash
docker logs design-ai-ops --tail 60 | grep cleanup-dry-run
```

输出长这样：

```
[cleanup-dry-run] === v0.11 B15.7 asset cleanup ===
[cleanup-dry-run]   mode:       DRY-RUN (no changes)
[cleanup-dry-run]   DAYS:       30
[cleanup-dry-run]   fav assetIds (protected):  1
[cleanup-dry-run]   candidate Asset rows (< 30d & /uploads/ local): 0
[cleanup-dry-run]   (nothing to clean up — disk usage stable)
[cleanup-dry-run] === done ===
```

dry-run **不会**删任何东西。

### 手动跑 dry-run

随时可以手动看一眼：

```bash
docker exec design-ai-ops node /app/scripts/cleanup-assets.mjs
```

想看更激进 / 更保守的阈值：

```bash
# 看 60 天以前的（保守，少误删）
docker exec -e DAYS=60 design-ai-ops node /app/scripts/cleanup-assets.mjs

# 看 7 天以前的（激进，磁盘紧张时用）
docker exec -e DAYS=7 design-ai-ops node /app/scripts/cleanup-assets.mjs
```

### 真删（手动）

确认 dry-run 输出里**列出的每条都可以删**，再加 `--apply`：

```bash
docker exec design-ai-ops node /app/scripts/cleanup-assets.mjs --apply
```

脚本会先 `fs.unlink` 文件，再 `prisma.asset.delete` 删 Asset 行，避免悬空。失败的条会写到 stderr 但不阻塞剩余的清理。

### 自动化（cron · host 上配）

容器里没装 cron。要自动化在 **host 的 root crontab** 里加：

```bash
crontab -e
```

加：

```cron
# v0.11 B15.7 · 每周日 04:00 UTC 跑一次真清理
0 4 * * 0  docker exec design-ai-ops node /app/scripts/cleanup-assets.mjs --apply >> /var/log/asset-cleanup.log 2>&1
```

> **注意**：cron 默认跑 `--apply` 是激进做法。如果你想要 cron 只产报告 + 邮件提醒（dry-run），把 `--apply` 去掉，再把 stdout 重定向到邮件：`... | mail -s "asset cleanup dry-run" you@example.com`。

### 警告卡阈值

`/api/health` 现在多了 `diskUsage` 字段：

```jsonc
{
  "diskUsage": {
    "rootPercent": 89,           // 容器根分区使用率（整数 %）
    "rootBytes": 123654389760,
    "rootUsedBytes": 110650398720,
    "uploadsBytes": 62219192,    // /app/public/uploads 累计字节
    "uploadsCount": 45           // 文件数
  }
}
```

dashboard 把 `rootPercent ≥ 85` 当作触发条件渲染 `DiskWarningCard`，附带 uploads 用量摘要 + 一条复制命令。低于阈值这块 UI 完全消失（不占位）。

### 不要做的

- ❌ 直接 `rm -rf /var/lib/docker/volumes/design-ai-ops_app_uploads/_data/*` — 删了文件但 Asset 表还在，进 `/workspace?tab=assets` 会看到一堆破图。要走脚本，文件 + Asset row 一起清。
- ❌ 自己手写 SQL `DELETE FROM Asset WHERE createdAt < ...` — 漏掉收藏过滤，会误删用户珍藏。脚本里的「截 `:` 第一段反查 fav」逻辑是必须的。
- ❌ cron 跑 `--apply` 时不加日志重定向 — 出问题没法排查。

