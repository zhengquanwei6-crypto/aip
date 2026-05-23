// v0.11 B6 · 使用手册：篇目元数据 + slug → content 字符串 map
//
// 设计：
//   - 9 篇 markdown 在源码树里位于 `src/content/docs/*.md`（人可读 / 可改）
//   - push.sh 在 `docker compose build` 之前自动跑一段脚本，把 9 个 .md 文件的内容
//     生成一个 `src/lib/docs/content-bundle.ts`（template literal 形式 export const）
//   - 本文件 import 该 content-bundle，所有内容在 JS bundle 里就是普通字符串字段，
//     **完全不依赖运行时 fs.readFileSync**。这样：
//       (a) Next.js standalone 输出无需改 outputFileTracingIncludes
//       (b) Dockerfile 不需要新增 COPY src/content
//       (c) dev / prod / 容器内任意 cwd 下行为一致
//   - 0 第三方 markdown 依赖（render 由 src/lib/docs/render.ts 实现）

import { DOCS_CONTENT_MAP } from './content-bundle';

export type DocsEntry = {
  slug: string;
  order: number;
  title: string;
  description: string;
  /** content 目录下对应的 .md 文件名（仅作元数据，不用于 fs 读取） */
  filename: string;
};

/**
 * 9 篇手册 · 顺序与 ToC 渲染顺序一致
 *
 * slug 命名约定：`<order>-<kebab-case>` 与文件名一致（去 .md 扩展），方便人脑映射。
 */
export const DOCS_ENTRIES: ReadonlyArray<DocsEntry> = [
  {
    slug: '01-quick-start',
    order: 1,
    title: '快速开始',
    description: '5 分钟从零跑通：设置 LLM key → 第一个任务 → 第一次出图',
    filename: '01-quick-start.md',
  },
  {
    slug: '02-modules-tour',
    order: 2,
    title: '板块导览',
    description: 'NAV 14 项 + 6 个保留 URL 全图，每项用途 / 场景 / 入口 / 快捷键',
    filename: '02-modules-tour.md',
  },
  {
    slug: '03-workflow',
    order: 3,
    title: '推荐工作流',
    description: '接单 → 客户记录 → 创建任务 → 全流程发布 → 数据回填 → 周报',
    filename: '03-workflow.md',
  },
  {
    slug: '04-image-best-practices',
    order: 4,
    title: '图片生成最佳实践',
    description: 'prompt 7 维度 + 风格预设 + Adapter 切换 + 一套图模式',
    filename: '04-image-best-practices.md',
  },
  {
    slug: '05-agents',
    order: 5,
    title: 'Agents 子系统',
    description: '8 个 agent slug 入口 + publish-director 三步抽屉详解',
    filename: '05-agents.md',
  },
  {
    slug: '06-shortcuts',
    order: 6,
    title: '快捷键速查',
    description: 'Cmd+K / D 主题 / Esc 关抽屉 / 任务卡主操作',
    filename: '06-shortcuts.md',
  },
  {
    slug: '07-faq',
    order: 7,
    title: '常见问题 FAQ',
    description: '13 条最常踩的坑 + 最少步骤解法',
    filename: '07-faq.md',
  },
  {
    slug: '08-backup',
    order: 8,
    title: '数据备份指南',
    description: 'dev.db 位置 / 手动备份 / cron 每周 / 恢复流程',
    filename: '08-backup.md',
  },
  {
    slug: '09-troubleshooting',
    order: 9,
    title: '故障排查与日志',
    description: '/api/health 字段 / docker logs / Playwright 走查 / 失败重放',
    filename: '09-troubleshooting.md',
  },
] as const;

const SLUG_SET: ReadonlySet<string> = new Set(DOCS_ENTRIES.map((e) => e.slug));

/** 默认入口（对应 NAV /docs / 重定向目标） */
export const DEFAULT_DOC_SLUG = '01-quick-start';

/** 全 map（极少用，主要给后续可能的"全文搜索"功能） */
export function loadAllDocs(): Record<string, string> {
  return DOCS_CONTENT_MAP;
}

/** 单篇读 — page.tsx 里直接用 */
export function loadDocBySlug(slug: string): {
  entry: DocsEntry;
  content: string;
} | null {
  if (!SLUG_SET.has(slug)) return null;
  const entry = DOCS_ENTRIES.find((e) => e.slug === slug);
  if (!entry) return null;
  const content =
    DOCS_CONTENT_MAP[slug] ??
    `# ${entry.title}\n\n> 文档加载失败：\`${entry.filename}\` 未生成到 content-bundle。请重跑 push.sh。`;
  return { entry, content };
}

/** generateStaticParams 用 */
export function listDocSlugs(): string[] {
  return DOCS_ENTRIES.map((e) => e.slug);
}
