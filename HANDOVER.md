# 交接文档（用于下一段会话续作）

> 上下文要满了，把所有"恢复工作必需的状态"压缩到这一份。
> 下次会话开始时，AI 只需要读这一份就能立刻接着干。

> **2026-05-24 v0.11 final 收尾**：**v0.11.0 真闭环**（B0..B16 全部落地）。HEAD `18cfb6b` · annotated tag `v0.11.0` 重打到 18cfb6b。
> 11 batch 主线 + 7 个 B15.x 子批 + B16 收尾批 = 共 19 段闭环 commit。
> 关键产物：API Key 池 / sticky sidebar / dashboard 4-zone / NAV 22→14→15 / 11 篇 docs / Playground / market trends / i2i + aspectRatio / size 池修正 / agent prompt editor 入口 / market platform edit / asset cleanup script + disk warning。
> **0 schema** （除 B1 ApiKey 表唯一一次） · **0 LLM/IMAGE 消耗** · **photo-director slug 公共契约不动**。
> 详见 `D:\xm\design-ai-ops-v0.11-b16-final.md` + `D:\xm\design-ai-ops-bugs-v011.md`。

---

## 一、当前在做什么

为 **design-ai-ops** 项目（http://159.65.137.157）做体验优化、功能优化、UI/UX 优化、闭环。

**项目身份**：
- VPS：DigitalOcean Singapore，IP `159.65.137.157`，root + ed25519 私钥
- 部署目录：`/opt/design-ai-ops`
- GitHub 仓库：https://github.com/zhengquanwei6-crypto/aip.git（本地目录已重命名为 design-ai-ops）
- 容器：`design-ai-ops`（Up + healthy）+ 镜像 `design-ai-ops:latest`
- 端口：nginx :80 → 127.0.0.1:3000 → docker
- 技术栈：Next.js 14.2.18 + Prisma + SQLite + Tailwind + lucide-react

**用户身份/性格信号**：
- 平面设计接单的（小红书 + 闲鱼），自用工作台
- 不太懂代码层面但理解架构概念
- 反复说"不要询问、连续做、形成闭环、自检"
- 容忍度：build 失败不接受，旧容器还在跑就是没生效

---

## 二、连接 VPS 的方法

**通用 runner**：`D:\xm\_probe\ssh\runner-ip3.mjs`
- 用 SFTP 上传脚本到 /tmp/，bash 执行，stdout/stderr 落本地两个文件
- 用法：`node runner-ip3.mjs <local.sh> <out.txt> <err.txt>`

**SSH 连接参数**（已固化在 runner）：
- HOST = `159.65.137.157`
- USER = `root`
- KEY = `D:/xm/_probe/ssh/keys/ip3-key`（ed25519 私钥）
- PASSPHRASE = `672229`

**可复用的 push 模板**：
- `D:\xm\_probe\ssh\push-v011-b14.mjs` 是单批 push 标准模板（含 SFTP fastPut + bash exec + push.sh 触发）
- `D:\xm\_probe\ssh\push-v011-b15.7.mjs` 含「7 src 文件 + entrypoint + scripts/ + content-bundle 自动 re-bake」的全套姿势
- `D:\xm\_probe\ssh\push-v011-b14-walk.mjs` + `v011-b14-files\v011-b14-walk.mjs` 是 walk 标准模板（61 paths · sidebar + size + ratio + dashMarket + docs/04 字面量）
- `D:\xm\_probe\ssh\v011-b16-files\walk.mjs` (B16 NEW) 在 B14 walk 基础上加 dashboard `data-b15-7-disk-warning` + settings `data-b15-6-market-platforms-card` + diskUsage 字段完整性 + docs/05/08 节点探测

**已知坑**：
- 本地 PowerShell 终端渲染会把多次输出混到一起，**必须用 read_file 读 .log/.txt** 看真结果
- ssh2 库在 Node 24 上 chmod 报错，runner 已绕开（不调 chmod）
- fs_write 落盘后立刻 node 启动会找不到文件，**必须 ping -n 4 127.0.0.1 等几秒**
- VPS host 没装 node/npm/playwright；要跑 Playwright 用 `docker run --rm --network host mcr.microsoft.com/playwright:v1.50.0-noble`，volume mount /work，进容器后 `npm i playwright@1.50.0` 一次
- VPS host **没装 sqlite3 也没装 node**；要跑 schema 检查用 `docker exec design-ai-ops sqlite3 /data/dev.db ...` + host 端 `python3` （python3 默认装着）

---

## 三、v0.11 commit 链摘要（B0..B16 · 19 段）

```
18cfb6b feat(v0.11-b15.7): asset cleanup script + disk warning widget + docs/08 entry
097cc60 feat(v0.11-b15.6): market platform edit UI + PUT api
5c824d6 feat(v0.11-b15.5): docs 05+01 add prompt template editor entry hint
bba4c58 feat(v0.11-b15.4): photo-director step2 systemPrompt strict size enum
1b863ea feat(v0.11-b15.3): entrypoint auto-seed market platforms + today snapshot
fe99c96 feat(v0.11-b15.2): add disabled placeholder KIE key to IMAGE pool + settings UI hint
436d691 feat(v0.11-b15.1): publish-director / photo-director drawer aspect select polish
85dffb2 fix(v0.11-b14.1.1): docs/04 strip residual 2K/4K/2048/3840 literals (BUG-S5 followup)
3ff2d73 fix(v0.11-b14.3): drop hardcoded ratio select on /image and /m/image (BUG-L11)
875811f fix(v0.11-b14.2): IMAGE ApiKey pool failure coloring (BUG-M26)
902ff8a fix(v0.11-b14.1): docs/04 size table aligned to B12 reality (BUG-S5)
1056c67 fix(v0.11-b12): sizes 池配置 bug — 收紧到 OpenAI gpt-image-1 真实支持的 3 档
3964301 fix(v0.11-b11): i2i 真生图 fix-2 — 解析 OpenAI /v1/images/edits 的 b64_json
62a5636 fix(v0.11-b11): i2i 真生图 — 4router multipart 缺 model 字段
926c4e4 feat(v0.11-b11): self-audit + critical fixes (BUG-S5/S6/L10/DX)
e84ece0 feat(v0.11-b10): home market trends module (xiaohongshu / xianyu / qianniu)
6d1db49 feat(v0.11-b9): image-to-image (i2i) + aspectRatio presets per adapter
221b467 feat(v0.11-b8): AI Playground · 3 tabs (LLM / IMAGE / Agent) integrated
16db26f fix(v0.11-b7): re-bake content-bundle.ts to include 04 「📐 尺寸与质量预设」 section
d0bbb25 feat(v0.11-b7): image size/quality presets per adapter (3 UI + migrate)
178ba5c feat(v0.11-b7): bug deep scan + critical fixes (TaskActionGroup split / workspace deeplink) + bugs-v011.md
2c2c043 fix(v0.11-b7): bug scan · 修 1 严重 + 2 中级 (Phase 1 deep scan 抓到)
79e8022 fix(v0.11-b6): /docs renders 第一篇 directly
6a2e9b4 fix(v0.11-b6): bake 9 docs into content-bundle.ts
451d8e7 feat(v0.11-b6): docs handbook /docs · 9 篇 markdown · NAV 14→15
e841556 feat(v0.11-b5): NAV 22 → 14 整合
566df89 feat(v0.11-b4): UI/UX polish 30+
0dd323c feat(v0.11-b3): dashboard 4 zone refactor
d77b200 feat(v0.11-b2): sidebar sticky + max-w-1400
2305a53 feat(v0.11-b1): 多 API key 池
ac7cb08 snapshot v0.9.2 b1 + handover (B0 baseline · pre-v011)
```

**git tag 状态（B16 重打后）**：
- `v0.11.0` annotated → **18cfb6b**（B16 重打覆盖原 178ba5c），message 含「v0.11 final · B0..B16」摘要
- `v0.11.1-baseline` → 5506301（B7 prior · 历史标记保留）
- `v0.10-pre-baseline` → ac7cb08（B0 baseline · 保留）
- `v0.8.1-baseline` → 1176b83（保留）

**版本统计（B16 时点）**：
- 11 篇 docs（B6 9 篇 → B8 +playground +1 → B10 +market-trends +1 = 11 篇）
- 16 张 prisma 表（B1 加 ApiKey 唯一一次 schema 改）
- 6 个内置 image adapter / 8 个 agent / 14 项 NAV + 1 docs = 15
- 11 docs 全部 200 + content-bundle 完整性
- 0 LLM/IMAGE 消耗（全程 GET 或 POST {} → 400）

---

## 四、关键架构决策（v0.11 沉淀）

1. **API Key 池（B1）** — 新增 ApiKey schema · provider/baseUrl/apiKey/model/active/priority/lastError/consecutiveErrors。失败 ≥ 3 自动 disable。`getActiveLLMKey/getActiveImageKey` 按 priority asc 取 active 第一条。**这是 v0.11 唯一的 schema 改动**。

2. **adapter 池（B7→B12→B14）** — 6 个内置 adapter 各自带 `sizes / qualities / aspectRatios / supportsImg2Img / img2imgFlow` 池。OpenAI gpt-image-1 协议（4router/openai-gpt-img-2/kie-gpt-image-2 共用）真实只支持 3 档尺寸（B7 误塞 2K/4K → B12 收紧）。/image 与 /m/image 上的硬编码 3:4 / 1:1 select 已删（B14.3）。

3. **sticky sidebar（B2）** — `AdminShell` aside 加 `lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto` + 父 `lg:items-start`。修复 v0.11 之前 22/22 路径全 drift。max-w-1400 + safe-area-inset 同批落。

4. **dashboard 4-zone（B3）** — KPIBar + QuickActions + TodayPreview + SystemHealth + `/api/dashboard/summary` 一次拉聚合。B10 加第 5 区 market trends；B15.7 加 DiskWarningCard（条件渲染 ≥85%）。

5. **NAV 22→14→15（B5+B6）** — 4 合并组：/clients(+pricing) /presets(+prompts) /workspace(=history+assets) /tools(=weekly+calc)。B6 加 /docs +1=15。/pricing /prompts 强 307 redirect。/history /assets /contents /suggestions /weekly-report /calculator 6 路径仍保持 200（deeplink 历史 ≥16 次）。

6. **市场趋势（B10）** — Setting 表 `market:snapshot:<platform>:<YYYY-MM-DD>` 一天一行；3 平台（xiaohongshu / xianyu / qianniu）各 6 KPI；UI 走 dashboard 第 5 区。**不写真爬虫**（用户原话锁），未来 Chrome 扩展 hook response 喂数据进 `/api/market/trends/sync`（v0.10 路线图）。B15.3 entrypoint 自动 seed 三平台 + today snapshot；B15.6 加 PUT API + 编辑 modal。

7. **docs bundle（B6+）** — 11 篇 .md 通过 push.sh 内 python3 inline 重打到 `src/lib/docs/content-bundle.ts`（避开 VPS 没 node）。`/docs` 默认渲染第 1 篇（避免 Next.js redirect meta-refresh）。

8. **disk warning（B15.7）** — `/api/health` + `/api/dashboard/summary` 加 `diskUsage{rootPercent, rootBytes, rootUsedBytes, uploadsBytes, uploadsCount}`。dashboard `DiskWarningCard` 仅 `rootPercent ≥ 85` 渲染（条件渲染，否则 return null）。`scripts/cleanup-assets.mjs` 默认 dry-run · `--apply` 才真删；`fav` Asset（Setting `asset:fav:*` key）永远受保护。entrypoint 启动自动跑一次 dry-run 落 docker logs。

9. **0 schema 持续（除 B1）** — Asset 表清理选「软清理 + 文件 unlink + 删行」（不加 archived/deletedAt 字段）；asset:fav 收藏走 Setting 表；market trends 走 Setting 表；prompt 模板走 Setting 表；customPromptCount 也是 Setting 表行数计数。

---

## 五、B15 子批新增功能清单

**B15.1（436d691）** publish-director / photo-director drawer aspect select polish · 抽屉 aspectRatio select 改用 adapter 池驱动（不再硬编码）。

**B15.2（fe99c96）** IMAGE ApiKey 池占位 KIE key + /settings UI hint · 解决"池里只有 4router 一条 active 时如果 baseUrl 抖动没有 fallback"。

**B15.3（1b863ea）** entrypoint auto-seed market platforms + today snapshot · 容器启动跑 once seed 三平台 PlatformInfo + 当天 placeholder snapshot，避免空 dashboard。

**B15.4（bba4c58）** photo-director step2 systemPrompt strict size enum · 把 size 集合从模糊 "1024 / 2048" 收紧到当前 adapter 池的真实白名单（避免幻觉 size）。

**B15.5（5c824d6）** docs 05 + 01 加 prompt 模板编辑入口 · `/presets?tab=agent` 自定义 prompt 模板 → 8 个 agent 各写一条 systemPrompt 覆盖。

**B15.6（097cc60）** market platform edit UI + PUT api · `/settings` 顶部 PlatformsCard（`data-b15-6-market-platforms-card`）+ 「编辑平台」modal · `PUT /api/market/platforms/<slug>` 写回 PlatformInfo。

**B15.7（18cfb6b）** asset cleanup script + disk warning widget + docs/08 entry · 见 §四 #8。

---

## 六、路线图 v0.12 候选（B16 后顺延）

> v0.11 全闭环后下一段优先级。`D:\xm\design-ai-ops-roadmap-v0.12.md` 已落地（17.5h / 8 batch · 数据驱动）。B16 收尾后剩余候选：

1. **Asset.taskId schema** — 唯一会动 prisma schema 的 batch（v0.9.2 b3 + v0.11 路线沿用），让 /assets 加 task 筛选 + 批量发布
2. **agent prompt editor 落地** — 当前 `/presets?tab=agent` 是占位（仅 docs 05 提到），B15.5 已加文档，B16 后落 UI
3. **Chrome 扩展骨架（v0.10 b2）** — Manifest V3 + 小红书/闲鱼 content script + 喂 /api/market/trends/sync · 0 schema
4. **/market 页面诊断** — 当前 market trends 仅 dashboard 第 5 区展示；独立 /market 列表 + 历史 snapshot 趋势图
5. **photo-director body 校验对齐** — B15.4 已收紧 size enum；后续把 aspectRatio 也收紧到 adapter 池
6. **`/api/admin/cleanup/dry-run` API** — 把 B15.7 cleanup-assets.mjs 包成 HTTP 端点；DiskWarningCard 加「立即跑 dry-run」按钮
7. **DB 真分库** — 从 SQLite 升 Postgres（保留 SQLite dev fallback）；解决 Setting 表 `prompt:agent:*` / `market:snapshot:*` / `asset:fav:*` 单表 key 数无脑增长的隐患
8. **v0.10 b3-b7** — /analytics 接真数据 + 闲鱼镜像 + /inbox 私信 + 竞品订阅 + 关键词监控
9. **安全审计（v0.13）** — A1 最小化登录 + A2 密钥轮换 + A3 .gitignore + A4 SyncToken + A5 webhook 白名单

---

## 七、一键启动 + 故障排查

**容器启动**：
```bash
cd /opt/design-ai-ops
docker compose up -d
sleep 30
curl -s http://127.0.0.1:3000/api/health | python3 -m json.tool
```

健康判定：`ok=true / db=ok / version="v0.11" / agentRoutes=8 / apiKeyPool.{llm,image}.active≥1 / playgroundEnabled=true / marketTrendsModule.enabled=true / diskUsage.rootPercent` 都不应缺。

**故障排查 4 步法**（详见 [/docs/09-troubleshooting](/docs/09-troubleshooting)）：

1. `GET /api/health` 看 ok / db / apiKeyPool / recentFailures / diskUsage
2. `docker logs design-ai-ops --tail 200 --since 1h`
3. Playwright 走查：用 `D:\xm\_probe\ssh\v011-b16-files\walk.mjs`（最新 B16 模板，61 paths + 6 探针）
4. 失败重放 `/workspace?tab=history`

**B15.7 磁盘清理**（详见 [/docs/08-backup §磁盘清理](/docs/08-backup)）：
```bash
# 默认 dry-run（不会删任何东西）
docker exec design-ai-ops node /app/scripts/cleanup-assets.mjs

# 看 60 天 / 7 天阈值
docker exec -e DAYS=60 design-ai-ops node /app/scripts/cleanup-assets.mjs
docker exec -e DAYS=7  design-ai-ops node /app/scripts/cleanup-assets.mjs

# 真删（已检查 dry-run 输出 OK 后）
docker exec design-ai-ops node /app/scripts/cleanup-assets.mjs --apply
```

**容器 entrypoint 启动期 dry-run**：
```bash
docker logs design-ai-ops --tail 60 | grep cleanup-dry-run
```

**market platform 编辑**（B15.6）：进 `/settings` 顶部 PlatformsCard → 「编辑」modal → 改 displayName / description / kpiKeys → PUT 自动写 Setting 表。

**安全降级**（详见 docs/09 §六）：
```bash
docker compose stop
cp /data/dev.db /tmp/dev.db.broken
TS_DIR=$(ls -dt /root/dao-backup/* | head -1)
cp "$TS_DIR/dev.db.before" /data/dev.db || cp "$TS_DIR/dev.db" /data/dev.db
chown 1001:1001 /data/dev.db
docker compose up -d
```

---

## 八、密码 / key 提醒（v0.13 务必换一遍）

会话历史里残留的：
- VPS root 密码 `Zheng672229.`（旧 IP 172.104.117.123）
- ed25519 私钥 + passphrase `672229`（IP 159.65.137.157，**当前在用**）
- `ADMIN_SESSION_SECRET=myverysecretkey32chars1234567890`
- `ADMIN_PASSWORD=672229`
- `KIE_API_KEY=282c01cf125bb6e547f1fe207c23c95b`
- Setting 表 LLM_API_KEY / IMAGE_API_KEY 旧 key 仍在用（B1 后已迁到 ApiKey 池，但 Setting 表 row 还在做 fallback，可考虑 v0.13 清掉）

下一段会话开始时，**主动提醒一次**这些密钥已泄露，建议轮换（v0.13 A2 工单）。

---

## 九、不动的事（用户硬约束）

- **不动 Prisma schema**（B1 加 ApiKey 表是 v0.11 唯一一次；v0.12 b2 Asset.taskId 才会再动）
- **不写真爬虫**（小红书 / 闲鱼 / 千牛 — 用户原话锁。VPS 没 headless 浏览器、不签名逆向、不设备指纹伪造、不验证码识别、不模拟登录）
- **保留 photo-director slug**（公共契约 · `/api/agents/photo-director/build` · 整段 v0.11 一字不改）
- **不主动改 root 密码**（用户自己改）
- **每动作单独 commit · msg 带 batch 标记**（v0.11 19 段 commit 全做到）
- **0 LLM/IMAGE 消耗**（所有 push.sh / walk 全 GET 或 POST {} → 400 校验路径）
- **不并发调 LLM**（中转站易限流，所有 LLM 操作串行）

---

## 十、本机文件位置（Windows）

| 用途 | 路径 |
|---|---|
| 工作区根 | `D:\xm\` |
| SSH 工具脚本 | `D:\xm\_probe\ssh\` |
| SSH 私钥 | `D:\xm\_probe\ssh\keys\ip3-key`（passphrase: 672229） |
| **Phase 0 侦察报告** | `D:\xm\design-ai-ops-v08-recon.md` |
| **v0.11 路线图** | `D:\xm\design-ai-ops-roadmap-v0.11.md` |
| **v0.11 final 收尾报告（B16, 本批最新）** | `D:\xm\design-ai-ops-v0.11-b16-final.md` |
| **v0.11 B0-B15 各批报告** | `D:\xm\design-ai-ops-v0.11-b{0..15.7}-*.md` |
| **bug 三级活档** | `D:\xm\design-ai-ops-bugs-v011.md` |
| **v0.12 路线图（候选）** | `D:\xm\design-ai-ops-roadmap-v0.12.md` |
| **本交接文档** | `D:\xm\HANDOVER.md`（已 sync 到 VPS `/opt/design-ai-ops/HANDOVER.md`，B16 起 git 管控） |

可复用的脚本/库：
- `runner-ip3.mjs` — 通用 SSH 执行器（脚本走 SFTP 上传 + bash 执行）
- `push-v011-b14.mjs` — 单批 push 标准模板
- `push-v011-b15.7.mjs` — 含 entrypoint + scripts/ + content-bundle 自动 re-bake 的全套姿势
- `push-v011-b14-walk.mjs` + `v011-b14-files\v011-b14-walk.mjs` — 走查标准模板
- `v011-b16-files\walk.mjs` — B16 NEW · 加 disk-warning + market-platforms-card + diskUsage 字段完整性 + docs/05/08 节点探测

---

## 十一、下一段会话开场建议

如果用户说"继续"：

1. 简短回应 "v0.11.0 final 已闭环（B0..B16 共 19 段 commit · annotated tag 重打到 18cfb6b · HANDOVER + 11 docs 已同步），可以开始 v0.12"
2. 主动按 §六 优先级排序问要不要做（推荐：B0 备份 + git tag v0.12.0-baseline → B1 DX 收尾 → B2 Asset.taskId schema）
3. 如果用户说"做 GitHub push" → `git push origin main && git push --tags v0.11.0`（需要 GitHub 凭据，本地未配过；目前只是 VPS 本地 commit + tag）
4. 如果用户说"先用一下"→ 等他下一步反馈，让真实使用 1-2 天后再决定 v0.12 顺序

如果用户说别的，按他说的来。

---

## 十二、v0.11 关键产物索引（B16 时点 · 19 段 commit · 全闭环）

```
git:
  HEAD = 18cfb6b feat(v0.11-b15.7) ← v0.11.0 annotated tag (B16 重打)
  base = ac7cb08 snapshot v0.9.2 b1 (B0 · v0.10-pre-baseline)
  统计 = 19 commits / ~120+ files / +12000 / -3500 行 (粗估，含每批自带 backup)
  build = 19 次（每 batch + B6/B14/B15 各小修一次）
  walk = ~14 次（B0/B1/B2/B3/B4/B5/B6/B7/B8/B9/B10/B11/B12/B13/B14/B15.1/B16）

主线 batch:
  ac7cb08  B0  · backup + tag v0.10-pre-baseline + recon (sidebar 22/22 drift)
  2305a53  B1  · 多 API key 池 (ApiKey schema 唯一一次 + /api/settings/keys CRUD)
  d77b200  B2  · sticky sidebar + max-w-1400 + safe-area
  0dd323c  B3  · dashboard 4 zone + 5 list GET endpoints
  566df89  B4  · UI/UX polish 30+ · brand 404/error · console.* dev-only
  e841556  B5  · NAV 22→14 整合 · /clients+pricing /presets+prompts /workspace /tools
  451d8e7  B6  · /docs 9 篇 markdown · NAV 14→15
  6a2e9b4  B6  · bake 9 docs into content-bundle.ts
  79e8022  B6  · /docs 渲染第一篇直接（避开 Next redirect meta-refresh）
  2c2c043  B7  · BUG scan prior · 修 1 严重 + 2 中级 (S2/M22/M23)
  178ba5c  B7  · BUG followup · 拆 TaskActionGroup + workspace deeplink seed (S3/S4)
  d0bbb25  B7  · image size/quality presets per adapter (3 UI + migrate)
  16db26f  B7  · re-bake content-bundle 04 「📐 尺寸与质量」节
  221b467  B8  · AI Playground · 3 tabs (LLM / IMAGE / Agent) integrated
  6d1db49  B9  · i2i + aspectRatio presets per adapter
  e84ece0  B10 · home market trends 第 5 区 (xiaohongshu / xianyu / qianniu) + 11 docs
  926c4e4  B11 · self-audit + critical fixes (BUG-S5/S6/L10/DX)
  62a5636  B11 · i2i 真生图 — 4router multipart 缺 model 字段
  3964301  B11 · i2i 真生图 fix-2 — 解析 OpenAI /v1/images/edits 的 b64_json
  1056c67  B12 · sizes 池配置 bug — 收紧到 OpenAI gpt-image-1 真实 3 档
  902ff8a  B14 · docs/04 size table 同步到 B12 真实 3 档 (BUG-S5)
  875811f  B14 · IMAGE ApiKey 池 failure coloring (BUG-M26)
  3ff2d73  B14 · drop hardcoded ratio select on /image and /m/image (BUG-L11)
  85dffb2  B14 · docs/04 strip residual 2K/4K/2048/3840 literals (BUG-S5 followup)
  436d691  B15.1 · publish-director / photo-director drawer aspect select polish
  fe99c96  B15.2 · disabled placeholder KIE key + settings UI hint
  1b863ea  B15.3 · entrypoint auto-seed market platforms + today snapshot
  bba4c58  B15.4 · photo-director step2 systemPrompt strict size enum
  5c824d6  B15.5 · docs 05 + 01 加 prompt 模板编辑入口
  097cc60  B15.6 · market platform edit UI + PUT api
  18cfb6b  B15.7 · asset cleanup script + disk warning widget + docs/08 entry
  ←B16 收尾·重打 v0.11.0 annotated → 18cfb6b · HANDOVER 全量更新 · 11 docs 一致性 · walk 61 paths

新增 schema (B1 唯一一次):
  prisma/schema.prisma 加 ApiKey 模型
    fields: id / provider / label / baseUrl / apiKey / model / active / priority
            lastUsedAt / lastError / consecutiveErrors / totalRequests / totalErrors
            notes / createdAt / updatedAt
    @@index([provider, active, priority])

新增源文件（累积 v0.11）:
  /opt/design-ai-ops/src/app/api/settings/keys/                          (B1 · CRUD 4 个路由)
  /opt/design-ai-ops/src/lib/ai/keys.ts                                  (B1)
  /opt/design-ai-ops/src/lib/seed-api-keys.ts                            (B1)
  /opt/design-ai-ops/src/app/(admin)/dashboard/zones/                    (B3 · 4 个 zone)
  /opt/design-ai-ops/src/app/(admin)/dashboard/components/DiskWarningCard.tsx (B15.7 NEW)
  /opt/design-ai-ops/src/app/api/dashboard/summary/route.ts              (B3)
  /opt/design-ai-ops/src/app/api/dashboard/summary/aggregate.ts          (B3 · B15.7 +diskUsage)
  /opt/design-ai-ops/src/app/api/tasks /assets /presets /suggestions/    (B3 · list GET)
  /opt/design-ai-ops/src/components/EmptyState.tsx                       (B4)
  /opt/design-ai-ops/src/app/(admin)/error.tsx + not-found.tsx           (B4 · brand)
  /opt/design-ai-ops/src/app/m/error.tsx + not-found.tsx + loading.tsx   (B4)
  /opt/design-ai-ops/src/app/(admin)/workspace/                          (B5 NEW · history+assets 合并)
  /opt/design-ai-ops/src/app/(admin)/tools/                              (B5 NEW · weekly+calc 合并)
  /opt/design-ai-ops/src/components/admin/TaskActionGroup.tsx            (B7-followup)
  /opt/design-ai-ops/src/content/docs/01..11.md                          (B6/B8/B10 · 11 篇 .md)
  /opt/design-ai-ops/src/lib/docs/index.ts + render.ts + content-bundle.ts (B6)
  /opt/design-ai-ops/src/app/(admin)/docs/                               (B6)
  /opt/design-ai-ops/src/app/(admin)/playground/                         (B8 NEW · 3 tab)
  /opt/design-ai-ops/src/app/api/playground/llm /image /agent/           (B8)
  /opt/design-ai-ops/src/lib/market/seed.ts + types.ts                   (B10)
  /opt/design-ai-ops/src/app/api/market/platforms /trends/               (B10 + B15.6 PUT)
  /opt/design-ai-ops/src/app/(admin)/dashboard/zones/MarketTrendsZone.tsx (B10)
  /opt/design-ai-ops/src/app/(admin)/settings/components/PlatformsCard.tsx (B15.6)
  /opt/design-ai-ops/scripts/cleanup-assets.mjs                          (B15.7 NEW)
  /opt/design-ai-ops/HANDOVER.md                                         (B16 NEW · git 管控)

API 字段扩展（累积）:
  GET /api/health
    + apiKeyPool: { llm:{total,active,lastError}, image:{...} }            (B1)
    + customPromptCount: number                                            (v0.9.2 b1)
    + agentRoutes / imageDefaultAdapter / recentFailures /
      publishDirectorStats                                                  (v0.9 b3)
    + imageSizesPerAdapter                                                  (B7)
    + imageCapabilitiesPerAdapter                                           (B9)
    + playgroundEnabled                                                     (B8)
    + marketTrendsModule: { enabled, platforms, snapshotCount }             (B10)
    + diskUsage: { rootPercent, rootBytes, rootUsedBytes,
                    uploadsBytes, uploadsCount }                            (B15.7)
  GET /api/dashboard/summary  (B3 NEW · 一次拉聚合)
    + marketTrends                                                          (B10)
    + diskUsage                                                             (B15.7)
  GET /api/settings/keys?provider=llm|image  (B1 NEW · 列表)
  GET /api/tasks /api/assets /api/presets /api/suggestions  (B3 · list GET)
  POST /api/playground/llm/chat /image/generate /agent/chat  (B8 · 3 路径)
  GET /api/market/platforms (B10) + PUT /api/market/platforms/[slug] (B15.6)
  GET /api/market/trends?platform=...&limit=...  (B10)
  POST /api/market/trends                                                   (B10)

未动:
  docker-compose.yml · package.json deps · prompts.ts (B6 后未动) ·
  LLM/IMAGE 模型 / 中转站 · photo-director slug · publish-director slug · agent-types.ts (B15.4 仅改 systemPrompt)

报告: D:\xm\design-ai-ops-v0.11-b16-final.md (本批 · 2026-05-24)
     · D:\xm\design-ai-ops-v0.11-b{1..15.7}-*.md (各批单独报告)
     · D:\xm\design-ai-ops-bugs-v011.md (53 BUG 三级活档)
     · D:\xm\design-ai-ops-roadmap-v0.12.md (v0.12 候选 · 17.5h / 8 batch)

VPS 备份:
  /root/dao-backup/<TS>-v011-b{0..16}/  (每批 git-head-before.txt + .before 镜像)
  /root/dao-backup/<TS>-v011-b16/HANDOVER.md.before (B16 时 HANDOVER.md 不存在 → marker)
```

---

## 十三、B15 子批关键产物索引

```
B15.1 (436d691) · publish-director / photo-director drawer aspect select polish
  改: src/components/agents/PublishDirectorDrawer.tsx
      src/components/agents/PhotoDirectorDrawer.tsx
  约: 抽屉 aspectRatio select 改用 adapter 池驱动（不再硬编码）

B15.2 (fe99c96) · disabled placeholder KIE key + settings UI hint
  改: src/lib/seed-api-keys.ts
      src/app/(admin)/settings/components/ApiKeysPoolCard.tsx
  约: IMAGE 池失败兜底；UI 显示 "占位 disabled" 行

B15.3 (1b863ea) · entrypoint auto-seed market platforms + today snapshot
  改: docker/entrypoint.sh
      src/lib/market/seed.ts
  约: 容器启动跑 once seed 三平台 PlatformInfo + 当天 placeholder snapshot

B15.4 (bba4c58) · photo-director step2 systemPrompt strict size enum
  改: src/app/api/agents/publish-director/build/route.ts (step2 prompt)
  约: photo-director step2 systemPrompt 把 size 集合收紧到当前 adapter 池真实白名单

B15.5 (5c824d6) · docs 05 + 01 加 prompt 模板编辑入口
  改: src/content/docs/01-quick-start.md
      src/content/docs/05-agents.md
      src/lib/docs/content-bundle.ts (auto re-bake)
  约: 文档加 /presets?tab=agent 自定义 prompt 模板入口提示

B15.6 (097cc60) · market platform edit UI + PUT api
  改: src/app/api/market/platforms/[slug]/route.ts (PUT NEW)
      src/app/(admin)/settings/components/PlatformsCard.tsx (NEW)
      src/app/(admin)/settings/SettingsClient.tsx
  marker: data-b15-6-market-platforms-card

B15.7 (18cfb6b) · asset cleanup script + disk warning widget + docs/08 entry
  新: scripts/cleanup-assets.mjs (DAYS=30 dry-run / --apply)
      src/app/(admin)/dashboard/components/DiskWarningCard.tsx
  改: Dockerfile (+COPY scripts)
      docker/entrypoint.sh (启动跑 dry-run · 落 docker logs)
      src/app/api/health/route.ts (+diskUsage)
      src/app/api/dashboard/summary/aggregate.ts (+diskUsage)
      src/app/(admin)/dashboard/DashboardClient.tsx (+DiskWarningCard)
      src/content/docs/08-backup.md (+磁盘清理节)
      src/lib/docs/content-bundle.ts (auto re-bake)
  marker: data-b15-7-disk-warning
```

---

## 十四、v0.11 已知 BUG 状态（B16 时点）

> 完整活档：`D:\xm\design-ai-ops-bugs-v011.md`（53 入档 · 三级分类）

**已修闭环（v0.11 内）**：
- BUG-S2 image/prompt 加 platform 400 (B7)
- BUG-S3 TaskActionGroup 拆文件 (B7-followup)
- BUG-S4 workspace deeplink seed (B7-followup)
- BUG-S5 docs/04 size table 对齐 (B14.1 + B14.1.1)
- BUG-S6 / BUG-L10 self-audit fixes (B11)
- BUG-M22 brand 404 文案 (B4)
- BUG-M23 console.* dev-only (B4)
- BUG-M26 IMAGE ApiKey 池 failure coloring (B14.2)
- BUG-L11 硬编码 3:4/1:1 ratio select (B14.3)
- BUG-L12 磁盘清理 cron (B15.7)

**v0.12 排队（5 项）**：
- BUG-M11 /api/tasks list GET 返回字段
- BUG-M16 /calendar 自适应断点
- BUG-M18 dashboard hydration warning
- BUG-M19 /presets?tab=agent 编辑器落地（B15.5 已加文档）
- BUG-S?  Asset.taskId schema 字段（v0.9.2 b3 来源）

**v0.13 排队（28 项 🟢 低）**：
- 部分 lucide icon 替换、提示文案润色、更稳的 Toast queue 排队、a11y 完善、polish 类项

---
