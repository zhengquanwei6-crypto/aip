import type { Bootstrap } from "../_data/bootstrap";
import { SectionHeader } from "./Architecture";

/**
 * v5 · AgentsGrid — 8 智能体卡片，3 列 brutalist grid。
 *
 * 每张卡：mono slug + 大字 name + scope 标签 + 描述。Hover 加 accent 紫
 * 顶边和反白。每张卡的 slug 用作 stable key + 显示在卡片左上角索引位。
 */
export default function AgentsGrid({
  agents,
}: {
  agents: Bootstrap["agents"];
}) {
  return (
    <section
      data-section="agents"
      style={{
        padding: "clamp(48px, 8vw, 96px) clamp(16px, 4vw, 64px)",
      }}
    >
      <SectionHeader
        index="03"
        kicker="AGENTS"
        title="8 个智能体，自己定义"
        sub="每一个都注册在 src/lib/agent-types.ts，system prompt 可以从 /presets?tab=agent 直接覆盖。"
      />

      <div
        className="v5-agents-grid"
        style={{
          marginTop: "48px",
          display: "grid",
          gridTemplateColumns: "repeat(1, 1fr)",
          gap: "0",
        }}
      >
        <style>{`
          @media (min-width: 640px) {
            .v5-agents-grid { grid-template-columns: repeat(2, 1fr) !important; }
          }
          @media (min-width: 1024px) {
            .v5-agents-grid { grid-template-columns: repeat(3, 1fr) !important; }
          }
          .v5-agent-card {
            position: relative;
            padding: 32px 28px;
            border: 1px solid rgba(250, 247, 242, 0.22);
            margin: -1px 0 0 -1px;
            display: flex;
            flex-direction: column;
            min-height: 220px;
            transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
          }
          .v5-agent-card:hover {
            background: #b08be8;
            color: #0a0a0a;
            border-color: #b08be8;
          }
          .v5-agent-card:hover .v5-agent-slug,
          .v5-agent-card:hover .v5-agent-scope {
            color: #0a0a0a;
            opacity: 0.75;
          }
        `}</style>

        {agents.map((a, i) => (
          <article key={a.slug} className="v5-agent-card">
            <div
              className="v5-agent-slug font-mono"
              style={{
                fontSize: "10.5px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                opacity: 0.6,
                marginBottom: "16px",
                display: "flex",
                gap: "12px",
              }}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              <span>{a.slug}</span>
            </div>
            <h3
              style={{
                fontSize: "clamp(22px, 2vw, 28px)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
                margin: 0,
                marginBottom: "12px",
              }}
            >
              {a.name}
            </h3>
            <p
              style={{
                fontSize: "13.5px",
                lineHeight: 1.6,
                opacity: 0.75,
                margin: 0,
                flex: 1,
              }}
            >
              {a.desc}
            </p>
            <div
              className="v5-agent-scope font-mono"
              style={{
                marginTop: "20px",
                fontSize: "10.5px",
                letterSpacing: "0.06em",
                opacity: 0.5,
              }}
            >
              {a.scope.length > 0 ? a.scope.join(" · ") : "—"}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
