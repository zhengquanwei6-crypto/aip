/**
 * v0.15 · 果冻的AI 公共介绍页
 *
 * 用户原话：优化网站介绍页。
 *
 * 改动：
 *   - 文案对齐 v0.15 实际能力（三平台运营 + AI 工具 5 个 + 8 智能体 + 简约对话）
 *   - 去掉过期段落（"4 个最常被调用的智能体" Hero 后改成"三平台运营驱动"）
 *   - 真实 KPI 加 todayPending
 *   - 颜色锚点 jelly purple 保持，hover/focus 加阴影
 *   - 加"最近更新"段落（v0.15 整改要点）
 */
import Link from 'next/link';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { AGENTS } from '@/lib/agent-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: '果冻的AI · 智能体集合平台',
  description:
    '从平面设计接单工作室起步、为多垂直智能体演化的本地化 AI 工作台。三平台运营 + 5 个 AI 工具 + 8 个内置智能体 + 自定义 systemPrompt。',
};

interface LandingData {
  agentCount: number;
  taskCount: number;
  pendingTaskCount: number;
  aiOutputCount: number;
  assetCount: number;
  apiKeyCount: number;
  customPromptCount: number;
  version: string;
  serverUptimeHours: number;
}

async function loadLandingData(): Promise<LandingData> {
  const [
    taskCount,
    pendingTaskCount,
    aiOutputCount,
    assetCount,
    apiKeyCount,
    customPromptCount,
  ] = await Promise.all([
    prisma.task.count().catch(() => 0),
    prisma.task.count({ where: { status: 'pending' } }).catch(() => 0),
    prisma.aIOutput.count().catch(() => 0),
    prisma.asset.count().catch(() => 0),
    prisma.apiKey.count().catch(() => 0),
    prisma.setting
      .count({ where: { key: { startsWith: 'prompt:' } } })
      .catch(() => 0),
  ]);

  let version = 'v0.15';
  let serverUptimeHours = 0;
  try {
    const h = await fetch('http://127.0.0.1:3000/api/health', {
      cache: 'no-store',
    });
    if (h.ok) {
      const j = await h.json();
      if (typeof j.version === 'string') version = j.version;
      if (typeof j.serverUptimeMs === 'number') {
        serverUptimeHours = Math.floor(j.serverUptimeMs / 3_600_000);
      }
    }
  } catch {
    /* offline 渲染兜底 */
  }

  return {
    agentCount: AGENTS.length,
    taskCount,
    pendingTaskCount,
    aiOutputCount,
    assetCount,
    apiKeyCount,
    customPromptCount,
    version,
    serverUptimeHours,
  };
}

const FEATURED_AGENT_SLUGS = [
  'publish-director',
  'photo-director',
  'copy-writer',
  'api-doctor',
];

export default async function PublicLandingPage() {
  headers();
  const data = await loadLandingData();
  const featured = FEATURED_AGENT_SLUGS.map((s) =>
    AGENTS.find((a) => a.slug === s),
  ).filter((x): x is (typeof AGENTS)[number] => Boolean(x));

  return (
    <div
      className="min-h-screen text-[#0a0a0a]"
      style={{ background: '#faf7f2' }}
      data-v015-landing
    >
      <TopBar version={data.version} />

      <main className="mx-auto max-w-[1080px] px-6 lg:px-10">
        <Hero data={data} />
        <SectionDivider />
        <PlatformAgents />
        <SectionDivider />
        <AiTools />
        <SectionDivider />
        <FeaturedAgents agents={featured} totalAgents={data.agentCount} />
        <SectionDivider />
        <Numbers data={data} />
        <SectionDivider />
        <Changelog />
        <SectionDivider />
        <CallToAction />
      </main>

      <SiteFooter version={data.version} />
    </div>
  );
}

function TopBar({ version }: { version: string }) {
  return (
    <header className="border-b border-[#0a0a0a]/10 sticky top-0 z-30 backdrop-blur bg-[#faf7f2]/85">
      <div className="mx-auto max-w-[1080px] px-6 lg:px-10 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark className="h-7 w-7" />
          <div className="leading-tight">
            <div className="font-semibold text-[15px]">果冻的AI</div>
            <div
              className="text-[9px] text-[#0a0a0a]/40 tracking-[0.32em] uppercase font-mono"
              aria-hidden
            >
              GUODONG
            </div>
          </div>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-3">
          <Link
            href="/docs"
            className="hidden sm:inline-flex items-center px-3 py-1.5 text-sm text-[#0a0a0a]/70 hover:text-[#0a0a0a] transition-colors"
          >
            文档
          </Link>
          <span
            className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-mono text-[#0a0a0a]/50 border border-[#0a0a0a]/15 rounded"
            title="当前部署版本"
          >
            {version}
          </span>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-[#0a0a0a] text-[#faf7f2] hover:bg-[#b08be8] hover:shadow-md transition-all rounded-sm"
          >
            进入工作台
            <span aria-hidden>→</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Hero({ data }: { data: LandingData }) {
  return (
    <section className="pt-20 pb-16 lg:pt-28 lg:pb-24">
      <div
        className="text-[10px] tracking-[0.32em] uppercase text-[#b08be8] font-mono mb-5"
        aria-hidden
      >
        agent · collection · platform
      </div>
      <h1
        className="text-[40px] sm:text-[56px] lg:text-[72px] leading-[1.05] font-serif tracking-tight"
        style={{ fontFamily: '"Source Serif Pro", "Noto Serif SC", Georgia, serif' }}
      >
        三个平台的运营，
        <br />
        <span className="text-[#b08be8]">由一组智能体</span>
        <br />
        协同搞定。
      </h1>
      <p className="mt-8 text-[15px] sm:text-[17px] leading-relaxed text-[#0a0a0a]/70 max-w-[640px]">
        果冻的AI 是一个本地化的智能体集合工作台。从平面设计接单工作室起步，覆盖
        小红书 / 闲鱼 / 千牛 三个平台的内容产出，配合 5 个 AI 工具 + 8 个内置智能体，
        所有数据都在你自己的 SQLite 上，systemPrompt 完全可改，token 走你自己的
        API key 池。
      </p>
      <div className="mt-10 flex flex-wrap gap-3 items-center">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium bg-[#0a0a0a] text-[#faf7f2] hover:bg-[#b08be8] hover:shadow-md transition-all rounded-sm"
        >
          进入工作台
          <span aria-hidden>→</span>
        </Link>
        <Link
          href="/docs/01-quick-start"
          className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium border border-[#0a0a0a]/20 hover:border-[#0a0a0a]/60 transition-colors rounded-sm"
        >
          5 分钟快速开始
        </Link>
      </div>
      <div
        className="mt-12 flex flex-wrap gap-x-6 gap-y-2 text-[11px] font-mono text-[#0a0a0a]/45"
        aria-hidden
      >
        <span>{data.agentCount} agents online</span>
        <span>·</span>
        <span>{data.apiKeyCount} api keys pooled</span>
        <span>·</span>
        <span>{data.aiOutputCount} ai outputs persisted</span>
        <span>·</span>
        <span>{data.pendingTaskCount} tasks pending</span>
      </div>
    </section>
  );
}

function PlatformAgents() {
  const items = [
    {
      emoji: '📕',
      name: '小红书运营',
      slug: 'xiaohongshu-operator',
      desc: '一键产 5 张同源笔记图（封面 → 痛点 → 思路 → 结果 → 转化）+ 标题 5 选 + 正文 + 标签 + 评论引导',
    },
    {
      emoji: '🐟',
      name: '闲鱼运营',
      slug: 'xianyu-operator',
      desc: '主图 + 细节 + 场景 + 规格 + 诚信 5 张同源图，含商品标题 / 卖点 / 议价话术',
    },
    {
      emoji: '🐂',
      name: '千牛 / 淘宝运营',
      slug: 'qianniu-operator',
      desc: '主图 + 卖点 + 规格 + 场景 + 信任 5 张同源图，电商主图标准比例',
    },
  ];
  return (
    <section className="py-16 lg:py-20">
      <SectionLabel left="platform agents" right="3 verticals" />
      <h2
        className="mt-4 text-[28px] sm:text-[36px] leading-[1.1] font-serif"
        style={{ fontFamily: '"Source Serif Pro", "Noto Serif SC", Georgia, serif' }}
      >
        三个平台运营智能体
      </h2>
      <p className="mt-3 text-[14px] text-[#0a0a0a]/60 max-w-[560px]">
        统一工作流：输入主题 → AI 润色 → 关键问题问答 → 一次产出 5 张同源图 + 完整文案。
        第 1 张走 t2i 出封面，后 4 张走 i2i 同源，保证 5 张视觉统一。
      </p>
      <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {items.map((it) => (
          <div
            key={it.slug}
            className="border border-[#0a0a0a]/15 rounded-sm p-5 hover:border-[#0a0a0a]/40 hover:shadow-sm transition-all"
          >
            <div className="text-3xl mb-2" aria-hidden>
              {it.emoji}
            </div>
            <div className="text-[15px] font-semibold">{it.name}</div>
            <div className="mt-1 text-[11px] font-mono text-[#0a0a0a]/40">/{it.slug}</div>
            <p className="mt-3 text-[13px] leading-relaxed text-[#0a0a0a]/70">
              {it.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function AiTools() {
  const tools = [
    { label: '无缝纹理', desc: '瓷砖 / 布料 / 大理石平铺版' },
    { label: '无损放大', desc: '低清放大到 2K / 4K' },
    { label: '一键消除', desc: '去水印 / 去路人 / 去杂物' },
    { label: '一键变色', desc: '保形保材质，仅换色' },
    { label: '产品精修', desc: '电商级灯光 / 阴影 / 高光' },
  ];
  return (
    <section className="py-16 lg:py-20">
      <SectionLabel left="ai tools" right="ready to use" />
      <h2
        className="mt-4 text-[28px] sm:text-[36px] leading-[1.1] font-serif"
        style={{ fontFamily: '"Source Serif Pro", "Noto Serif SC", Georgia, serif' }}
      >
        5 个 AI 图像工具
      </h2>
      <p className="mt-3 text-[14px] text-[#0a0a0a]/60 max-w-[560px]">
        共用同一组 image API key 池，处理结果直接落 Asset 库可被任务页复用。
      </p>
      <ul className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {tools.map((t) => (
          <li
            key={t.label}
            className="border border-[#0a0a0a]/15 rounded-sm p-3 hover:border-[#b08be8] transition-all"
          >
            <div className="text-[13px] font-medium">{t.label}</div>
            <div className="mt-1 text-[11px] text-[#0a0a0a]/55">{t.desc}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FeaturedAgents({
  agents,
  totalAgents,
}: {
  agents: { slug: string; name: string; description: string; icon: string; scope?: string[] }[];
  totalAgents: number;
}) {
  return (
    <section className="py-16 lg:py-20">
      <SectionLabel left="agents · 当前阵容" right={`${totalAgents} active`} />
      <h2
        className="mt-4 text-[28px] sm:text-[36px] leading-[1.1] font-serif"
        style={{ fontFamily: '"Source Serif Pro", "Noto Serif SC", Georgia, serif' }}
      >
        最常被调用的 4 个智能体
      </h2>
      <p className="mt-3 text-[14px] text-[#0a0a0a]/60 max-w-[560px]">
        每个 agent 有自己的 scope（限定哪些路由能调），systemPrompt 可在
        /presets?tab=agent 改写，token 走全局 LLM key 池。
      </p>

      <div className="mt-10 space-y-6">
        {agents.map((a, i) => (
          <AgentRow agent={a} index={i} key={a.slug} />
        ))}
      </div>

      <div className="mt-10 text-[12px] font-mono text-[#0a0a0a]/45">
        还有 {Math.max(0, totalAgents - agents.length)} 个智能体（price-quoter
        / day-coach / client-coach / prompt-coach）— 进 /presets?tab=agent 看完整名单。
      </div>
    </section>
  );
}

function AgentRow({
  agent,
  index,
}: {
  agent: { slug: string; name: string; description: string; icon: string; scope?: string[] };
  index: number;
}) {
  const odd = index % 2 === 1;
  return (
    <div
      className={`flex flex-col sm:flex-row gap-4 sm:gap-8 items-start ${
        odd ? 'sm:pl-[15%]' : 'sm:pr-[15%]'
      }`}
    >
      <div className="text-3xl shrink-0 leading-none mt-1" aria-hidden>
        {agent.icon}
      </div>
      <div className="flex-1 min-w-0 border-l border-[#0a0a0a]/15 pl-4 sm:pl-5">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h3 className="text-[18px] font-semibold">{agent.name}</h3>
          <span className="text-[11px] font-mono text-[#0a0a0a]/40">
            /{agent.slug}
          </span>
        </div>
        <p className="mt-2 text-[14px] leading-relaxed text-[#0a0a0a]/70">
          {agent.description}
        </p>
        <div
          className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono text-[#0a0a0a]/45"
          aria-hidden
        >
          <span>scope:</span>
          {(agent.scope ?? []).map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Numbers({ data }: { data: LandingData }) {
  const items: { value: string | number; label: string; sub?: string }[] = [
    { value: data.agentCount, label: '内置智能体', sub: 'agents' },
    { value: data.aiOutputCount, label: 'AI 输出累计', sub: 'persisted' },
    { value: data.taskCount, label: '任务卡', sub: 'tasks' },
    { value: data.assetCount, label: '生成 / 上传图片', sub: 'assets' },
    { value: data.apiKeyCount, label: 'API key 池条数', sub: 'priority pool' },
    { value: data.customPromptCount, label: '自定义 prompt', sub: 'overrides' },
  ];
  return (
    <section className="py-16 lg:py-20">
      <SectionLabel left="real numbers" right="this instance" />
      <h2
        className="mt-4 text-[28px] sm:text-[36px] leading-[1.1] font-serif"
        style={{ fontFamily: '"Source Serif Pro", "Noto Serif SC", Georgia, serif' }}
      >
        本机的真实数字
      </h2>
      <p className="mt-3 text-[14px] text-[#0a0a0a]/60 max-w-[560px]">
        没有「服务过 10000+ 用户」的营销数据。下面这些数字来自这台 VPS 上你
        自己的 prisma 表，直接 SELECT COUNT(*) 来的。
      </p>

      <dl className="mt-10 grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-10">
        {items.map((it, i) => (
          <div key={i} className="border-t border-[#0a0a0a]/15 pt-3">
            <dt className="text-[11px] font-mono text-[#0a0a0a]/45 uppercase tracking-wider">
              {it.sub}
            </dt>
            <dd
              className="mt-2 text-[40px] sm:text-[48px] font-serif tabular-nums leading-none"
              style={{
                fontFamily:
                  '"Source Serif Pro", "Noto Serif SC", Georgia, serif',
              }}
            >
              {it.value}
            </dd>
            <dd className="mt-2 text-[12px] text-[#0a0a0a]/60">{it.label}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 text-[11px] font-mono text-[#0a0a0a]/45">
        version {data.version} · uptime {data.serverUptimeHours}h · last fetch{' '}
        {new Date().toISOString().slice(11, 19)}
      </div>
    </section>
  );
}

function Changelog() {
  return (
    <section className="py-16 lg:py-20">
      <SectionLabel left="recent changes" right="v0.15" />
      <h2
        className="mt-4 text-[28px] sm:text-[36px] leading-[1.1] font-serif"
        style={{ fontFamily: '"Source Serif Pro", "Noto Serif SC", Georgia, serif' }}
      >
        最近一次升级
      </h2>
      <ul className="mt-8 space-y-3 text-[14px] leading-relaxed text-[#0a0a0a]/75">
        <Item>首页看板 / 今日任务 / 历史记录三个高频页 UI 推倒重做，去掉冗余卡片，留有用数据。</Item>
        <Item>三个运营智能体（小红书 / 闲鱼 / 千牛）走统一工作流：润色 → 关键问答 → 5 张同源图。</Item>
        <Item>AI 工具集合扩展到 5 个：无缝纹理、无损放大、一键消除、一键变色、产品精修。</Item>
        <Item>AI 对话页改简约下划线 segment，三 tab（LLM / 图片 / Agent）保留全部参数。</Item>
        <Item>API 适配器文档抓取增强：多重候选 URL + Jina Reader 兜底。</Item>
        <Item>清理无用入口：发布日历、关键词库、客户管理、私信话术从导航移除。</Item>
      </ul>
    </section>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="text-[#b08be8] shrink-0" aria-hidden>
        ·
      </span>
      <span>{children}</span>
    </li>
  );
}

function CallToAction() {
  return (
    <section className="py-20 lg:py-28">
      <div className="border-t border-[#0a0a0a]/15 pt-16">
        <div
          className="text-[10px] tracking-[0.32em] uppercase text-[#b08be8] font-mono mb-5"
          aria-hidden
        >
          start now
        </div>
        <h2
          className="text-[32px] sm:text-[44px] leading-[1.1] font-serif"
          style={{ fontFamily: '"Source Serif Pro", "Noto Serif SC", Georgia, serif' }}
        >
          直接进工作台。
          <br />
          <span className="text-[#0a0a0a]/55">不需要注册账号。</span>
        </h2>
        <p className="mt-6 text-[15px] text-[#0a0a0a]/65 max-w-[600px]">
          这是一个个人本地工作台。打开 /dashboard 就能用，需要 LLM 调用时
          填一次自己的 API key。所有数据落本机 SQLite，没有云后端。
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium bg-[#0a0a0a] text-[#faf7f2] hover:bg-[#b08be8] hover:shadow-md transition-all rounded-sm"
          >
            进入工作台
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium border border-[#0a0a0a]/20 hover:border-[#0a0a0a]/60 transition-colors rounded-sm"
          >
            看使用手册
          </Link>
          <Link
            href="/playground"
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium border border-[#0a0a0a]/20 hover:border-[#0a0a0a]/60 transition-colors rounded-sm"
          >
            先去 playground 试一次
          </Link>
        </div>
      </div>
    </section>
  );
}

function SiteFooter({ version }: { version: string }) {
  return (
    <footer className="border-t border-[#0a0a0a]/10 mt-10">
      <div className="mx-auto max-w-[1080px] px-6 lg:px-10 py-8 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-[11px] font-mono text-[#0a0a0a]/45">
        <div>果冻的AI · build {version} · single-tenant local workstation</div>
        <div className="flex gap-4">
          <Link href="/docs" className="hover:text-[#0a0a0a]">
            docs
          </Link>
          <Link href="/dashboard" className="hover:text-[#0a0a0a]">
            workstation
          </Link>
          <Link href="/api/health" className="hover:text-[#0a0a0a]">
            health
          </Link>
        </div>
      </div>
    </footer>
  );
}

function SectionDivider() {
  return <div className="h-px bg-[#0a0a0a]/8" aria-hidden role="presentation" />;
}

function SectionLabel({ left, right }: { left: string; right?: string }) {
  return (
    <div
      className="flex items-center justify-between text-[10px] font-mono tracking-[0.28em] uppercase text-[#0a0a0a]/45"
      aria-hidden
    >
      <span>{left}</span>
      {right ? <span>{right}</span> : null}
    </div>
  );
}

function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      width="28"
      height="28"
      aria-hidden="true"
    >
      <rect
        x="2.5"
        y="2.5"
        width="35"
        height="35"
        rx="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M20 8 L22 18 L32 20 L22 22 L20 32 L18 22 L8 20 L18 18 Z"
        fill="currentColor"
      />
    </svg>
  );
}
