# 快捷键速查

按使用频率排，背前 5 个就够用。所有快捷键都尊重输入态（focus 在 textarea / input 时全局快捷键禁用，避免你输 prompt 时被劫持，B4 修过这条）。

## 全局

| 键              | 行为                                   | 实现位置                                |
|-----------------|----------------------------------------|-----------------------------------------|
| **Cmd+K** / Ctrl+K | 命令面板（搜任意页面 + 跳转）          | `components/CommandPalette.tsx`         |
| **D**           | 切换深色 / 浅色主题                     | `components/ThemeToggle.tsx`            |
| **Esc**         | 关闭最上层抽屉 / 模态                   | 各 Drawer 组件 (B4 统一改 onPointerDown 遮罩 + onKeyDown Escape) |
| **?**           | 跳到使用手册首页                        | AdminShell 底部 `?` 图标 → /docs/01-quick-start |

## 命令面板（Cmd+K）

打开后输入关键字，命中：

```
首页              → /dashboard
今日              → /today
日历              → /calendar
文案              → /content
图片              → /image
工作区            → /workspace
客户              → /clients
关键词            → /keywords
话术              → /scripts
模板              → /presets
适配器            → /adapters
分析              → /analytics
工具              → /tools
设置              → /settings
手册              → /docs
```

支持模糊匹配："dash" 命中 dashboard、"prom" 命中 prompts (B5 后会跳到 /presets?tab=content)。

## sidebar

| 行为                | 键 / 操作                            |
|---------------------|--------------------------------------|
| 折叠 / 展开侧栏     | 点底部"折叠侧栏"按钮（aria-pressed B4）|
| 移动端打开抽屉      | 点 topbar 左上角 Menu 图标            |
| 移动端关闭抽屉      | 点遮罩 / 点抽屉内 X                    |

折叠状态记忆在 `localStorage[sidebar:collapsed]` = `'1'` / `'0'`。折叠时只显 lucide icon 16px，hover 显 title。

## 任务卡（/today）

| 操作                | 路径                                  |
|---------------------|---------------------------------------|
| 主按钮：全流程发布  | 🎯 全流程发布（B5 整合后主操作）      |
| 编辑任务详情        | 更多 ▾ → 编辑任务详情 → /calendar/[dow]/task/[id] |
| 生成文案（不出图）  | 更多 ▾ → 生成文案                     |
| 生成图片（不动文案）| 更多 ▾ → 生成图片                     |
| 标记已发布           | 更多 ▾ → 标记为已发布                 |
| 改状态              | 状态 ▾ select                         |
| 查看缩略图          | 点封面图 → ImageLightbox 全屏         |

下拉菜单点外面自动关闭（document mousedown listener，B5 实现）。

## 全流程发布抽屉

抽屉 680px 宽（桌面），移动端全屏。

| 操作                 | 键                            |
|----------------------|-------------------------------|
| 关闭                  | Esc / 点遮罩 / 顶部 X         |
| 切换图片选项折叠组    | 点"图片选项 ▾"                |
| 单张图片重生         | 图片右下角 ↻                   |
| 重新构造 prompt      | step1 顶部"重写"               |
| 直接进 step3（跳生成）| imageOptions.autoImage = true |

## /workspace 资产 tab

| 操作            | 键                                   |
|-----------------|--------------------------------------|
| 多选            | 按住 Shift 点资产卡                  |
| 多选全选        | Cmd+A                                |
| 多选下载 zip    | 顶部 BulkActionBar → 下载 zip        |
| 收藏 / 取消     | 资产卡上 ⭐                           |
| 关联到 task     | 资产卡 → 选 task                     |

> 资产收藏走 Setting 表 `asset:fav:<assetId>` key（一收藏一行）。schema 暂未加 Asset.favorited 列，v0.12 才迁。

## /presets?tab=content prompt 编辑器

| 操作               | 键                                    |
|--------------------|---------------------------------------|
| vs 默认 diff       | 顶部"vs 默认"按钮（行级双栏黄色高亮） |
| 重置为默认          | 点"重置"（清掉 Setting 表那行）        |
| 保存当前编辑       | Cmd+S                                  |
| 调用 prompt-coach  | 编辑器右下角"AI 改进"                  |

## /m 移动端

| 操作              | 行为                                  |
|-------------------|---------------------------------------|
| 切到桌面          | topbar 右上 `桌面版` 链接（写 cookie + 跳同名） |
| 返回上一页        | topbar 左上 ← 箭头                    |
| 切 Tab            | 底部 5 Tab：首页 / 任务 / 文案 / 图片 / 我的 |

底部 nav 已加 `pb-[env(safe-area-inset-bottom)]`（B2），iPhone 全面屏 home indicator 不会盖。

## 浏览器原生（提醒）

- macOS 的 **Cmd+/** 是 Safari/Chrome 的"显示开发工具菜单"或某些扩展的保留键。我们没占这个键，但你按下去可能不响应
- **Cmd+P** 是浏览器打印 — 工作台没拦截
- **Cmd+R** / **F5** 刷新 — 当前页面所有 state 会丢，**抽屉打开状态会被关掉但 task 数据不丢**（API 已回写 DB）

## 调试用（dev only）

`NODE_ENV !== 'production'` 时，部分组件会输出 `console.warn`：

- AssetsClient zip 跳过未来格式的资产
- image-runner adapter 路径失败 fallback
- root error.tsx / m error.tsx 错误堆栈

生产环境**0 ungated console.\***（B4 修过，参见 [故障排查与日志](/docs/09-troubleshooting)）。
