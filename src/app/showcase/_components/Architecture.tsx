import Link from "next/link";

import type { Bootstrap } from "../_data/bootstrap";

/**
 * v5 · Architecture — 8-card asymmetric grid on inkbed.
 *
 * Each card is a real `<a>` deep-link to the live page. Brutalist treatment:
 *   - 1px paper hairline border
 *   - mono uppercase eyebrow with index number
 *   - 32–44px display label, weight 700, tight tracking
 *   - mono 12px count line ("8 agents", "1024 vectors", "0 keys")
 *   - hover inverts to paper bg + ink text + accent purple count
 *
 * Asymmetric grid (sm+): 2 wide rows of 4, but first card spans col 1-2 ×
 * row 1-2 to act as the "main entry point" anchor — that's the agent
 * registry. Below sm collapses to single column.
 *
 * Zero-count rule (Req 5.3): n=0 renders as the literal "0 agents", never
 * "no agents yet".
 */
function formatCount(n: number, label: string): string {
  return `${n} ${label}`;
}

interface Card {
  id: string;
  label: string;
  href: string;
  description: string;
  count: string | null;
  prominent?: boolean;
}

function buildCards(
  data: Pick<
    Bootstrap,
    "counts" | "pool" | "vector" | "publishDirector"
  >,
): Card[] {
  const adapter = data.pool.imageDefaultAdapter?.trim() || "—";
  return [
    {
      id: "agents",
      label: "agent registry",
      href: "/presets?tab=agent",
      description: "8 个智能体的 system prompt + scope，所有调用从这里起手",
      count: formatCount(data.counts.agents, "agents"),
      prominent: true,
    },
    {
      id: "keys",
      label: "api-key pool",
      href: "/settings",
      description: "LLM + Image 双池，按可用度轮询，自动熔断坏 key",
      count: `${data.pool.llm.active}/${data.pool.llm.total} keys`,
    },
    {
      id: "adapter",
      label: "model adapter",
      href: "/adapters",
      description: "OpenAI 兼容上游统一封装，5 个内置 adapter",
      count: adapter,
    },
    {
      id: "vector",
      label: "vector index",
      href: "/dashboard",
      description: "bge-m3 1024 维 + Zilliz Cloud REST，启用 RAG 时自动写入",
      count: formatCount(data.vector.rows, "vectors"),
    },
    {
      id: "platforms",
      label: "platform builders",
      href: "/today",
      description: "三平台 (xhs / xy / qn) 内容打包，统一 5 帧或 1 帧契约",
      count: formatCount(data.publishDirector.total, "runs"),
    },
    {
      id: "tools",
      label: "ai tools",
      href: "/ai-tools",
      description: "erase / recolor / retouch / seamless / upscale 五件图像工具",
      count: null,
    },
    {
      id: "history",
      label: "history",
      href: "/dashboard",
      description: "所有 AI 输出真实落库，可回溯 + RAG 增量索引",
      count: formatCount(data.counts.aiOutputs, "outputs"),
    },
    {
      id: "prompts",
      label: "prompt store",
      href: "/presets?tab=content",
      description: "自定义提示词集合，运行时覆盖默认 system prompt",
      count: formatCount(data.counts.customPrompts, "prompts"),
    },
  ];
}

export default function Architecture({
  data,
}: {
  data: Pick<
    Bootstrap,
    "counts" | "pool" | "vector" | "publishDirector"
  >;
}) {
  const cards = buildCards(data);

  return (
    <section
      data-section="architecture"
      style={{
        padding: "clamp(48px, 8vw, 96px) clamp(16px, 4vw, 64px)",
      }}
    >
      <SectionHeader
        index="01"
        kicker="ARCHITECTURE"
        title="一台 VPS 上的 8 个组件"
        sub="每个节点都是真实运行的子页面，点开就能看到。计数永远来自正在运行的 prisma 与 /api/health。"
      />

      <div
        className="v5-arch-grid"
        style={{
          marginTop: "48px",
          display: "grid",
          gridTemplateColumns: "repeat(1, 1fr)",
          gap: "0",
        }}
      >
        <style>{`
          @media (min-width: 768px) {
            .v5-arch-grid {
              grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
              grid-auto-rows: 200px !important;
            }
            .v5-arch-grid .v5-card-prominent {
              grid-column: span 2;
              grid-row: span 2;
            }
          }
          .v5-arch-card {
            position: relative;
            padding: 24px;
            border: 1px solid rgba(250, 247, 242, 0.22);
            margin: -1px 0 0 -1px;
            color: #faf7f2;
            text-decoration: none;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            min-height: 200px;
            transition: background 120ms ease, color 120ms ease;
          }
          .v5-arch-card:hover {
            background: #faf7f2;
            color: #0a0a0a;
          }
          .v5-arch-card:hover .v5-card-count { color: #b08be8; opacity: 1; }
          .v5-arch-card:focus-visible {
            outline: 2px solid #b08be8;
            outline-offset: -3px;
          }
          .v5-arch-card.v5-card-prominent { background: #b08be8; color: #0a0a0a; border-color: #b08be8; }
          .v5-arch-card.v5-card-prominent:hover { background: #faf7f2; color: #0a0a0a; }
        `}</style>

        {cards.map((c, i) => (
          <Link
            key={c.id}
            href={c.href}
            className={
              c.prominent
                ? "v5-arch-card v5-card-prominent"
                : "v5-arch-card"
            }
            aria-label={`${c.label} — ${c.description}`}
          >
            <div>
              <div
                className="font-mono"
                style={{
                  fontSize: "10.5px",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  marginBottom: "12px",
                  opacity: 0.75,
                }}
              >
                {String(i + 1).padStart(2, "0")} · {c.label}
              </div>
              <div
                style={{
                  fontSize: c.prominent
                    ? "clamp(28px, 3vw, 44px)"
                    : "clamp(20px, 1.8vw, 26px)",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                  marginBottom: c.prominent ? "20px" : "12px",
                }}
              >
                {c.label}
              </div>
              <div
                style={{
                  fontSize: c.prominent ? "15px" : "12.5px",
                  lineHeight: 1.55,
                  opacity: 0.75,
                  maxWidth: "320px",
                }}
              >
                {c.description}
              </div>
            </div>
            <div
              className="font-mono v5-card-count"
              style={{
                fontSize: c.prominent ? "16px" : "12px",
                letterSpacing: "0.04em",
                marginTop: "20px",
                opacity: 0.7,
              }}
            >
              {c.count ?? "open →"}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * Shared section header — eyebrow / index / display title / sub. Kept
 * inline here so the file stays self-contained; lifted to its own
 * component if a third section adopts it.
 */
export function SectionHeader({
  index,
  kicker,
  title,
  sub,
  invert = false,
}: {
  index: string;
  kicker: string;
  title: string;
  sub?: string;
  invert?: boolean;
}) {
  const fg = invert ? "#0a0a0a" : "#faf7f2";
  const subFg = invert ? "rgba(10,10,10,0.65)" : "rgba(250,247,242,0.65)";
  return (
    <header style={{ maxWidth: "920px" }}>
      <div
        className="font-mono"
        style={{
          fontSize: "11px",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "#b08be8",
          marginBottom: "10px",
          display: "flex",
          gap: "12px",
        }}
      >
        <span>§{index}</span>
        <span style={{ color: subFg }}>{kicker}</span>
      </div>
      <div
        className="v5-rule-accent"
        style={{ background: "#b08be8" }}
      />
      <h2
        className="v5-display"
        style={{
          fontSize: "clamp(32px, 5vw, 64px)",
          color: fg,
          fontWeight: 700,
          margin: 0,
        }}
      >
        {title}
      </h2>
      {sub ? (
        <p
          style={{
            marginTop: "20px",
            fontSize: "clamp(14px, 1.1vw, 17px)",
            lineHeight: 1.6,
            color: subFg,
            maxWidth: "720px",
          }}
        >
          {sub}
        </p>
      ) : null}
    </header>
  );
}
