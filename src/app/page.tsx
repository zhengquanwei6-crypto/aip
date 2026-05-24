/**
 * v0.12 B4.3 · 果冻的AI 公共首页（替换原来的 redirect→/dashboard）。
 *
 * 这是一个 server component · 拉一次 /api/health 真实数据 + 一次 prisma count。
 * 不带 sidebar （AdminShell 在 (admin)/layout.tsx，不进 src/app/page.tsx），
 * 也不带 admin 顶栏，整页极简。
 *
 * 设计原则（用户原话「简约、高端、流畅、有差异化、不千篇一律」）：
 *   - 配色：纯黑 #0a0a0a + 米白 #faf7f2 + 跳色 honey amber #c2410c（不用默认 indigo）
 *   - 字体：衬线（serif · 中文标题）+ 等宽（mono · 数据/slug）混排
 *   - 布局：左对齐 + 不规则间距，不用 grid-cols-3 默认套
 *   - 数据真实：从 prisma + health 读，不假造「服务 10000+」
 *   - 差异化：流程图用纯 SVG 手绘，不是模板化的 mermaid 风
 *   - 0 carousel / 0 video bg / 0 客户 logo wall / 0「立即注册」框
 *
 * 导航策略：访客访问「/」看 landing；右上 CTA「进入工作台 →」走 /dashboard。
 * 已登录用户也看 landing（项目无登录态），需要工作台自己点 CTA。
 */
import Link from 'next/link';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { AGENTS } from '@/lib/agent-types';

// 不缓存（landing 显示真实数据）
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: '果冻的AI · 智能体集合平台',
  description:
    '从「设计接单」起步，演进为多垂直智能体的本地化工作台。当前 8 个内置智能体，本地 SQLite 持久化，自定义 systemPrompt。',
};

interface LandingData {
  agentCount: number;
  taskCount: number;
  aiOutputCount: number;
  assetCount: number;
  apiKeyCount: number;
  customPromptCount: number;
  version: string;
  serverUptimeHours: number;
}

async function loadLandingData(): Promise<LandingData> {
  const [taskCount, aiOutputCount, assetCount, apiKeyCount, customPromptCount] =
    await Promise.all([
      prisma.task.count().catch(() => 0),
      prisma.aIOutput.count().catch(() => 0),
      prisma.asset.count().catch(() => 0),
      prisma.apiKey.count().catch(() => 0),
      prisma.setting
        .count({ where: { key: { startsWith: 'prompt:' } } })
        .catch(() => 0),
    ]);

  // health 通过自身 fetch 拿（landing 不依赖 health 也能渲染）
  let version = 'v0.12';
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
    /* ignore — 离线状态也能渲染 */
  }

  return {
    agentCount: AGENTS.length,
    taskCount,
    aiOutputCount,
    assetCount,
    apiKeyCount,
    customPromptCount,
    version,
    serverUptimeHours,
  };
}

/**
 * 选 4 个最有代表性的 agent 上首页（不全列 8 个，避免视觉拥挤）。
 * 用户实际跑得最多的：publish-director / copy-writer / api-doctor / photo-director。
 */
const FEATURED_AGENT_SLUGS = [
  'publish-director',
  'copy-writer',
  'api-doctor',
  'photo-director',
];

export default async function PublicLandingPage() {
  // headers() 强制 dynamic（避免被静态化 · Next 14.2 优化）
  headers();
  const data = await loadLandingData();
  const featured = FEATURED_AGENT_SLUGS.map((s) =>
    AGENTS.find((a) => a.slug === s),
  ).filter((x): x is (typeof AGENTS)[number] => Boolean(x));

  return (
    <div
      className="min-h-screen text-[#0a0a0a]"
      style={{ background: '#faf7f2' }}
      data-v012-b4-landing
    >
      <TopBar version={data.version} />

      <main className="mx-auto max-w-[1080px] px-6 lg:px-10">
        <Hero data={data} />
        <SectionDivider />
        <FeaturedAgents agents={featured} totalAgents={data.agentCount} />
        <SectionDivider />
        <FlowDiagram />
        <SectionDivider />
        <Numbers data={data} />
        <SectionDivider />
        <CallToAction />
      </main>

      <SiteFooter version={data.version} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 顶栏 · 极简：左品牌 + 右 CTA
// ──────────────────────────────────────────────────────────────────────
function TopBar({ version }: { version: string }) {
  return (
    <header
      className="border-b border-[#0a0a0a]/10"
      data-v012-b4-landing-topbar
    >
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
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-[#0a0a0a] text-[#faf7f2] hover:bg-[#c2410c] transition-colors rounded-sm"
            data-v012-b4-cta-enter
          >
            进入工作台
            <span aria-hidden>→</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Hero · 1 行大字 + 副标 + 一段说明
// ──────────────────────────────────────────────────────────────────────
function Hero({ data }: { data: LandingData }) {
  return (
    <section className="pt-20 pb-16 lg:pt-28 lg:pb-24" data-v012-b4-hero>
      <div
        className="text-[10px] tracking-[0.32em] uppercase text-[#c2410c] font-mono mb-5"
        aria-hidden
      >
        agent · collection · platform
      </div>
      <h1
        className="text-[40px] sm:text-[56px] lg:text-[72px] leading-[1.05] font-serif tracking-tight"
        style={{ fontFamily: '"Source Serif Pro", "Noto Serif SC", Georgia, serif' }}
      >
        让多个 AI 智能体
        <br />
        <span className="text-[#c2410c]">为同一个工作流</span>
        <br />
        协作。
      </h1>
      <p className="mt-8 text-[15px] sm:text-[17px] leading-relaxed text-[#0a0a0a]/70 max-w-[640px]">
        果冻的AI 是一个本地化的智能体集合工作台。从「设计接单」起步，
        正在演进为覆盖学习 / 代码 / 文档 / 数据等多个垂直场景的 agent
        平台。每个 agent 都跑在你自己的 SQLite 上，systemPrompt 完全可改，
        token 走你自己的 API key 池。
      </p>
      <div className="mt-10 flex flex-wrap gap-3 items-center">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium bg-[#0a0a0a] text-[#faf7f2] hover:bg-[#c2410c] transition-colors rounded-sm"
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
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Featured Agents · 4 个 · 不规则 stagger 布局（非 grid-cols-3）
// ──────────────────────────────────────────────────────────────────────
function FeaturedAgents({
  agents,
  totalAgents,
}: {
  agents: { slug: string; name: string; description: string; icon: string; scope?: string[] }[];
  totalAgents: number;
}) {
  return (
    <section className="py-16 lg:py-20" data-v012-b4-agents>
      <SectionLabel left="agents · 当前阵容" right={`${totalAgents} active`} />
      <h2
        className="mt-4 text-[28px] sm:text-[36px] leading-[1.1] font-serif"
        style={{ fontFamily: '"Source Serif Pro", "Noto Serif SC", Georgia, serif' }}
      >
        4 个最常被调用的智能体
      </h2>
      <p className="mt-3 text-[14px] text-[#0a0a0a]/60 max-w-[560px]">
        每个 agent 有自己的 scope（限定哪些路由能调），systemPrompt
        可在 /presets?tab=agent 改写，token 走全局 LLM key 池。
      </p>

      {/* 不规则 stagger：第 1/3 偏左，第 2/4 偏右，错开缩进 */}
      <div className="mt-10 space-y-6">
        {agents.map((a, i) => (
          <AgentRow agent={a} index={i} key={a.slug} />
        ))}
      </div>

      <div className="mt-10 text-[12px] font-mono text-[#0a0a0a]/45">
        还有 {totalAgents - agents.length} 个智能体（price-quoter / day-coach
        / client-coach / prompt-coach）— 进工作台 /presets?tab=agent 看完整名单。
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
      data-v012-b4-agent-row
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

// ──────────────────────────────────────────────────────────────────────
// Flow diagram · 极简流程图（用户 → agent → SQLite + LLM key pool）
// ──────────────────────────────────────────────────────────────────────
function FlowDiagram() {
  return (
    <section className="py-16 lg:py-20" data-v012-b4-flow>
      <SectionLabel left="how it works" right="local-first · single-tenant" />
      <h2
        className="mt-4 text-[28px] sm:text-[36px] leading-[1.1] font-serif"
        style={{ fontFamily: '"Source Serif Pro", "Noto Serif SC", Georgia, serif' }}
      >
        每个请求的实际路径
      </h2>
      <p className="mt-3 text-[14px] text-[#0a0a0a]/60 max-w-[560px]">
        不是黑盒 SaaS。所有数据都在你自己的 SQLite，所有 prompt 都能看 + 改，
        所有 token 走你自己的 key 池（支持多 key 自动 fallback）。
      </p>

      <div className="mt-10 overflow-x-auto">
        <svg
          viewBox="0 0 720 280"
          width="100%"
          className="block max-w-[720px]"
          role="img"
          aria-label="果冻的AI 请求流程图：用户 → 智能体 → 系统服务（SQLite + LLM key 池）"
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 Z" fill="#0a0a0a" />
            </marker>
            <marker
              id="arrow-amber"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 Z" fill="#c2410c" />
            </marker>
          </defs>

          {/* 用户 */}
          <g>
            <rect
              x="20"
              y="115"
              width="120"
              height="50"
              fill="none"
              stroke="#0a0a0a"
              strokeWidth="1.5"
              rx="2"
            />
            <text
              x="80"
              y="138"
              textAnchor="middle"
              fontSize="13"
              fontFamily="ui-sans-serif,system-ui,sans-serif"
              fill="#0a0a0a"
            >
              用户
            </text>
            <text
              x="80"
              y="153"
              textAnchor="middle"
              fontSize="9"
              fontFamily="ui-monospace,monospace"
              fill="#0a0a0a"
              opacity="0.45"
            >
              /dashboard
            </text>
          </g>

          {/* 用户 → agent */}
          <line
            x1="142"
            y1="140"
            x2="218"
            y2="140"
            stroke="#0a0a0a"
            strokeWidth="1.5"
            markerEnd="url(#arrow)"
          />

          {/* agent registry */}
          <g>
            <rect
              x="220"
              y="80"
              width="180"
              height="120"
              fill="#0a0a0a"
              rx="2"
            />
            <text
              x="310"
              y="105"
              textAnchor="middle"
              fontSize="11"
              fontFamily="ui-monospace,monospace"
              fill="#c2410c"
              opacity="0.85"
            >
              agent registry
            </text>
            <text
              x="310"
              y="125"
              textAnchor="middle"
              fontSize="14"
              fontFamily="ui-sans-serif,system-ui,sans-serif"
              fontWeight="600"
              fill="#faf7f2"
            >
              智能体调度
            </text>
            <text
              x="310"
              y="148"
              textAnchor="middle"
              fontSize="11"
              fontFamily="ui-monospace,monospace"
              fill="#faf7f2"
              opacity="0.75"
            >
              find by slug
            </text>
            <text
              x="310"
              y="166"
              textAnchor="middle"
              fontSize="11"
              fontFamily="ui-monospace,monospace"
              fill="#faf7f2"
              opacity="0.75"
            >
              + scope check
            </text>
            <text
              x="310"
              y="184"
              textAnchor="middle"
              fontSize="11"
              fontFamily="ui-monospace,monospace"
              fill="#faf7f2"
              opacity="0.75"
            >
              + system prompt
            </text>
          </g>

          {/* agent → SQLite */}
          <path
            d="M 400 110 C 460 110, 480 60, 540 60"
            fill="none"
            stroke="#0a0a0a"
            strokeWidth="1.5"
            markerEnd="url(#arrow)"
          />
          <text
            x="470"
            y="80"
            fontSize="9"
            fontFamily="ui-monospace,monospace"
            fill="#0a0a0a"
            opacity="0.5"
          >
            persist
          </text>

          {/* agent → LLM */}
          <path
            d="M 400 170 C 460 170, 480 220, 540 220"
            fill="none"
            stroke="#c2410c"
            strokeWidth="1.5"
            markerEnd="url(#arrow-amber)"
          />
          <text
            x="470"
            y="215"
            fontSize="9"
            fontFamily="ui-monospace,monospace"
            fill="#c2410c"
            opacity="0.7"
          >
            invoke
          </text>

          {/* SQLite */}
          <g>
            <rect
              x="540"
              y="35"
              width="160"
              height="50"
              fill="none"
              stroke="#0a0a0a"
              strokeWidth="1.5"
              rx="2"
            />
            <text
              x="620"
              y="58"
              textAnchor="middle"
              fontSize="13"
              fontFamily="ui-sans-serif,system-ui,sans-serif"
              fill="#0a0a0a"
            >
              SQLite
            </text>
            <text
              x="620"
              y="74"
              textAnchor="middle"
              fontSize="9"
              fontFamily="ui-monospace,monospace"
              fill="#0a0a0a"
              opacity="0.45"
            >
              /data/dev.db
            </text>
          </g>

          {/* LLM key pool */}
          <g>
            <rect
              x="540"
              y="195"
              width="160"
              height="50"
              fill="none"
              stroke="#c2410c"
              strokeWidth="1.5"
              rx="2"
            />
            <text
              x="620"
              y="218"
              textAnchor="middle"
              fontSize="13"
              fontFamily="ui-sans-serif,system-ui,sans-serif"
              fill="#0a0a0a"
            >
              LLM key 池
            </text>
            <text
              x="620"
              y="234"
              textAnchor="middle"
              fontSize="9"
              fontFamily="ui-monospace,monospace"
              fill="#c2410c"
              opacity="0.7"
            >
              priority + fallback
            </text>
          </g>
        </svg>
      </div>

      <ul className="mt-8 grid sm:grid-cols-2 gap-x-10 gap-y-3 text-[13px] text-[#0a0a0a]/70">
        <li className="flex gap-2">
          <span aria-hidden className="text-[#c2410c]">·</span>
          <span>
            agent registry 在 <code className="font-mono text-[12px]">src/lib/agent-types.ts</code>，每个 agent 一个 slug + scope + systemPrompt。
          </span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="text-[#c2410c]">·</span>
          <span>
            所有输出落 <code className="font-mono text-[12px]">AIOutput</code> 表，可以重新打开看 prompt + 结果，可以重放。
          </span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="text-[#c2410c]">·</span>
          <span>
            LLM key 池支持多 key，priority asc 取，连续 3 次失败自动 disable，下次请求走备用。
          </span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="text-[#c2410c]">·</span>
          <span>
            systemPrompt 可在 <code className="font-mono text-[12px]">/presets?tab=agent</code> 直接改，立即生效，不用重启。
          </span>
        </li>
      </ul>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Numbers · 真实数字（mono · 大字号）
// ──────────────────────────────────────────────────────────────────────
function Numbers({ data }: { data: LandingData }) {
  const items: { value: string | number; label: string; sub?: string }[] = [
    { value: data.agentCount, label: '内置智能体', sub: 'agents' },
    { value: data.aiOutputCount, label: 'AI 输出累计', sub: 'persisted to sqlite' },
    { value: data.taskCount, label: '任务卡', sub: 'tasks' },
    { value: data.assetCount, label: '生成 / 上传图片', sub: 'assets' },
    { value: data.apiKeyCount, label: 'API key 池条数', sub: 'priority pool' },
    {
      value: data.customPromptCount,
      label: '自定义 prompt 模板',
      sub: 'overrides',
    },
  ];
  return (
    <section className="py-16 lg:py-20" data-v012-b4-numbers>
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
                fontFamily: '"Source Serif Pro", "Noto Serif SC", Georgia, serif',
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

// ──────────────────────────────────────────────────────────────────────
// CTA 末尾
// ──────────────────────────────────────────────────────────────────────
function CallToAction() {
  return (
    <section className="py-20 lg:py-28" data-v012-b4-cta>
      <div className="border-t border-[#0a0a0a]/15 pt-16">
        <div
          className="text-[10px] tracking-[0.32em] uppercase text-[#c2410c] font-mono mb-5"
          aria-hidden
        >
          start now
        </div>
        <h2
          className="text-[32px] sm:text-[44px] leading-[1.1] font-serif"
          style={{
            fontFamily: '"Source Serif Pro", "Noto Serif SC", Georgia, serif',
          }}
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
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium bg-[#0a0a0a] text-[#faf7f2] hover:bg-[#c2410c] transition-colors rounded-sm"
          >
            进入工作台
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium border border-[#0a0a0a]/20 hover:border-[#0a0a0a]/60 transition-colors rounded-sm"
          >
            看使用手册（11 篇）
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

// ──────────────────────────────────────────────────────────────────────
// Footer
// ──────────────────────────────────────────────────────────────────────
function SiteFooter({ version }: { version: string }) {
  return (
    <footer
      className="border-t border-[#0a0a0a]/10 mt-10"
      data-v012-b4-landing-footer
    >
      <div className="mx-auto max-w-[1080px] px-6 lg:px-10 py-8 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-[11px] font-mono text-[#0a0a0a]/45">
        <div>
          果冻的AI · build {version} · single-tenant local workstation
        </div>
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

// ──────────────────────────────────────────────────────────────────────
// 装饰组件
// ──────────────────────────────────────────────────────────────────────
function SectionDivider() {
  return (
    <div className="h-px bg-[#0a0a0a]/8" aria-hidden role="presentation" />
  );
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
