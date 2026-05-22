# design-ai-ops

平面设计接单 AI 运营工作台 · 个人本地工具

> 把"小红书 + 闲鱼平面设计接单"的日常运营动作（今日任务、文案生成、图片生成、素材管理、数据复盘、AI 建议）整合到一个本地 Web 工作台里。

不是公开 SaaS，不需要登录注册。直接本地起 `npm run dev`，浏览器打开即用。

---

## 功能一览

| 模块 | 路径 | 说明 |
| --- | --- | --- |
| 首页看板 | `/dashboard` | 今日日期、主推类目、今日 10 条任务统计、最近 7 天数据、AI 建议 |
| 今日任务 | `/today` | 自动展示今日 10 条任务，每条可一键生成文案/图片/切换状态 |
| 发布日历 | `/calendar` | 一周视图（周一→周日，每天 10 条），点任务进入详情编辑页 |
| 文案生成 | `/content` | 小红书：5 个标题/正文/封面大字/标签/CTA；闲鱼：商品标题/详情/三档/流程/交付/FAQ |
| 图片生成 | `/image` | 两步式：① LLM 生成图片提示词 → 可手改 → ② 调 GPT IMG 2 出图，自动入库 |
| 素材库 | `/assets` | 网格视图，上传图片、AI 图片、按类型筛选、复制提示词、删除 |
| 关键词库 | `/keywords` | 内置 70+ 词，按类目/平台筛选、CRUD |
| 价格套餐 | `/pricing` | 内置三档矩阵（引流/标准/利润）、CRUD |
| 私信话术 | `/scripts` | 内置 10 条常用话术、CRUD、一键复制 |
| 数据复盘 | `/analytics` | 17 字段录入、本周统计、类目排行、平台对比、高低表现内容 |
| AI 建议 | `/suggestions` | 基于近 7/30 天数据生成下周打法（含 10 条内容建议） |
| 设置 | `/settings` | LLM/图片 API 的 baseUrl/key/model，支持测试连接 |

---

## 技术栈

- **前端 / 后端**：Next.js 14（App Router）+ TypeScript + Tailwind CSS
- **数据库**：SQLite（默认 `prisma/dev.db`）+ Prisma
- **AI 文案**：兼容 OpenAI Chat Completions（`/v1/chat/completions`）
- **AI 图片**：兼容 GPT IMG 2 / OpenAI Images（`/v1/images/generations`）
- **图片存储**：本地 `public/uploads/`

---

## 本地启动

### 1. 准备 Node 18+

```bash
node -v   # 建议 18 或 20
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

打开 `.env`，按需填写。最少需要：

```dotenv
DATABASE_URL="file:./dev.db"
LLM_API_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini

IMAGE_API_BASE_URL=https://api.openai.com/v1
IMAGE_API_KEY=sk-...
IMAGE_MODEL=gpt-img-2
```

> 也可以暂时留空 `LLM_API_KEY` / `IMAGE_API_KEY`，启动后在「设置」页面填，存储在数据库里。

### 4. 一键初始化（生成 Prisma Client + 建库 + 写入种子数据）

```bash
npm run setup
```

等价于：

```bash
npm run prisma:generate
npm run prisma:push      # 用 db push 直接同步 schema 到 SQLite
npm run prisma:seed
```

执行成功后会写入：

- 7 天发布计划（周一 ~ 周日）
- 70 条任务（每天 10 条：6 条小红书 + 4 条闲鱼）
- 11 个类目
- 70+ 关键词
- 26 条价格套餐
- 10 条常用私信话术

### 5. 启动开发环境

```bash
npm run dev
```

浏览器打开 http://localhost:3000  会自动跳转到 `/dashboard`。

### 6. 生产构建

```bash
npm run build
npm run start
```

---

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 开发模式 |
| `npm run build` | 产出生产构建（先跑 prisma generate） |
| `npm run start` | 运行生产构建（默认端口 3000） |
| `npm run prisma:generate` | 生成 Prisma Client |
| `npm run prisma:push` | 把 schema 同步到 SQLite（无 migration） |
| `npm run prisma:seed` | 写入种子数据 |
| `npm run db:reset` | ⚠️ 清空数据库并重新 seed |
| `npm run setup` | 一键 generate + push + seed |

---

## 配置 API（两种方式任选）

### 方式 A：写到 `.env`（推荐永久使用）

```dotenv
LLM_API_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-xxx
LLM_MODEL=gpt-4o-mini

IMAGE_API_BASE_URL=https://api.openai.com/v1
IMAGE_API_KEY=sk-xxx
IMAGE_MODEL=gpt-img-2
```

修改后重启 `npm run dev` 生效。

### 方式 B：在「设置」页面填写

进入 `/settings`，填写后点「保存设置」，存到本地数据库。
点击「测试连接」可验证 baseUrl + key 是否可用。

> 优先级：**数据库设置 > .env**。在设置页留空即"回退到 .env"。

---

## 关键流程示例

### 1. 早上打开工作台

`/dashboard` 看今日主推类目、10 条任务状态。

### 2. 一键生成今日所有内容

进 `/today`，对每条任务点击「生成文案」「生成图片」。
所有结果会自动存到帖子库 / 商品库 / 素材库 / AI 输出历史。

### 3. 发布前微调

任务详情页 `/calendar/{dow}/task/{id}` 可手动改标题、正文、封面大字。

### 4. 发布完成后录数据

`/analytics` 录入曝光/私信/咨询/成交等 17 个字段。

### 5. 周日复盘

`/suggestions` 点「重新生成」拿到下周打法 + 10 条内容建议。

---

## 目录结构

```
.
├── prisma/
│   ├── schema.prisma     # 数据模型（SQLite）
│   └── seed.ts           # 种子数据
├── public/uploads/       # 本地图片存储（gitignore）
├── src/
│   ├── app/
│   │   ├── (admin)/      # 后台路由组（含 sidebar 布局）
│   │   ├── api/          # 所有后端接口
│   │   ├── layout.tsx
│   │   ├── page.tsx      # 根路径 → 重定向 /dashboard
│   │   └── globals.css
│   ├── components/       # Sidebar / Topbar / PageTitleSetter
│   └── lib/
│       ├── ai/           # text.ts / image.ts / prompts.ts
│       ├── constants.ts
│       ├── date.ts
│       ├── db.ts         # Prisma 客户端
│       └── storage.ts    # 本地图片保存
├── .env.example
├── next.config.js
├── tailwind.config.ts
└── package.json
```

---

## 常见问题

**Q：图片生成报"未配置 IMAGE_API_KEY"。**
A：去 `/settings` 填写或在 `.env` 配置后重启。

**Q：LLM 返回的 JSON 解析失败？**
A：不同模型对严格 JSON 输出能力不同。建议使用 `gpt-4o-mini` 或更高级模型。返回的原始文本会出现在错误信息里方便排查。

**Q：图片不显示？**
A：图片保存在 `public/uploads/` 下，`/uploads/xxx.png` 由 Next.js 直接服务。删除任务/素材时本地文件会一并删除。

**Q：怎么修改默认每日发布计划？**
A：编辑 `prisma/seed.ts` 里的 `dailyTaskTemplate`，重新跑 `npm run prisma:seed`。或直接在 `/calendar` 页面点单条任务进去编辑。

**Q：怎么完全清库重来？**
A：`npm run db:reset`，会重新建库 + seed。⚠️ 会清空所有数据。

---

## 安全注意

- 这是个人本地工具，没做登录/权限。**不要直接公网暴露**。
- 如果一定要部署到 VPS，请用 Nginx 加 Basic Auth 或仅监听 127.0.0.1 后通过 SSH 隧道访问。
- API Key 仅存在本地 SQLite 与 `.env`，不会上传。

---

## License

仅限个人内部使用。
