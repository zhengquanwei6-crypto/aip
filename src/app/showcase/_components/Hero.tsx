import Link from "next/link";

import type { Bootstrap } from "../_data/bootstrap";

/**
 * v5 · Hero — full-bleed black inkbed with a 144px+ display headline.
 *
 * Layout:
 *   - Topbar: tiny mono eyebrow (publication tag · issue · region · version)
 *     hugging the top edge with a 1px paper hairline below.
 *   - Headline: clamp(64px, 12vw, 180px) display 900 weight letter-spaced
 *     -0.05em. Two lines, the second carries the accent purple word that
 *     anchors brand colour in the first viewport.
 *   - Sub: 17px paragraph at 70% paper opacity, max 720px wide.
 *   - Stat strip: 4 live numbers (agents, outputs, vectors, demos) in
 *     monospace, 1px paper rules between them. Each number is real
 *     bootstrap data so the visitor reads "this thing is alive" without
 *     a dashboard pretending to be a live demo.
 *   - CTA pair: ghost button → /dashboard, solid → #demo (anchor).
 *
 * Reveal: the headline opacity-1 by default (no jank on first paint), the
 * stat strip + sub fade in via Reveal sibling. Headline also subtly
 * outline-text-stroke for a brutalist visual hit on the page break.
 */

function nf(n: number): string {
  return n.toLocaleString("en-US");
}

export default function Hero({ data }: { data: Bootstrap }) {
  const issue = (() => {
    const d = new Date(data.generatedAt);
    if (Number.isNaN(d.getTime())) return "ISSUE 0000";
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `ISSUE ${mm}${dd}`;
  })();

  return (
    <section
      data-section="hero"
      style={{
        position: "relative",
        minHeight: "100vh",
        padding: "32px clamp(16px, 4vw, 64px) 64px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* topbar */}
      <div
        className="font-mono"
        style={{
          fontSize: "11px",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#faf7f2",
          opacity: 0.6,
          display: "flex",
          flexWrap: "wrap",
          gap: "16px",
          alignItems: "baseline",
          paddingBottom: "10px",
          borderBottom: "1px solid rgba(250, 247, 242, 0.18)",
        }}
      >
        <span style={{ color: "#b08be8" }}>guodong.ai</span>
        <span aria-hidden="true">/</span>
        <span>field notes</span>
        <span aria-hidden="true">/</span>
        <span>{issue}</span>
        <span style={{ marginLeft: "auto", opacity: 0.7 }}>
          {data.version} · {data.region}
        </span>
      </div>

      {/* headline block — vertically centred via flex-grow spacer. */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", paddingTop: "48px", paddingBottom: "48px" }}>
        <div
          className="font-mono"
          style={{
            fontSize: "11px",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#b08be8",
            marginBottom: "24px",
          }}
        >
          single-author · multi-agent · single VPS
        </div>
        <h1
          className="v5-display"
          style={{
            fontSize: "clamp(56px, 11vw, 168px)",
            margin: 0,
          }}
        >
          <span style={{ display: "block" }}>不做云后端，</span>
          <span style={{ display: "block" }}>
            一个人{" "}
            <span style={{ color: "#b08be8" }}>把活</span>
            {" "}干完。
          </span>
        </h1>
        <p
          style={{
            marginTop: "32px",
            fontSize: "clamp(15px, 1.2vw, 18px)",
            lineHeight: 1.6,
            color: "#faf7f2",
            opacity: 0.72,
            maxWidth: "720px",
          }}
        >
          guodong.ai 是部署在 DigitalOcean SGP1 一台 6 美元 VPS 上的多智能体工作台。
          所有数字都来自正在运行的 prisma 与 /api/health。
          没有注册、没有云后端、没有第三方分析。
        </p>

        {/* CTA */}
        <div
          style={{
            marginTop: "44px",
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <a
            href="#demo"
            style={{
              display: "inline-block",
              padding: "16px 28px",
              background: "#b08be8",
              color: "#0a0a0a",
              fontSize: "14px",
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              textDecoration: "none",
              border: "1px solid #b08be8",
            }}
          >
            亲手试一次 →
          </a>
          <Link
            href="/dashboard"
            style={{
              display: "inline-block",
              padding: "16px 28px",
              background: "transparent",
              color: "#faf7f2",
              fontSize: "14px",
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              textDecoration: "none",
              border: "1px solid #faf7f2",
            }}
          >
            进入工作台
          </Link>
        </div>
      </div>

      {/* stat strip */}
      <div
        className="font-mono"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          borderTop: "1px solid rgba(250, 247, 242, 0.18)",
          paddingTop: "20px",
          gap: "0",
        }}
      >
        {[
          { label: "AGENTS", value: nf(data.counts.agents) },
          { label: "AI OUTPUTS", value: nf(data.counts.aiOutputs) },
          {
            label: "VECTORS",
            value: data.vector.enabled ? nf(data.vector.rows) : "—",
          },
          {
            label: "ACTIVE KEYS",
            value: `${data.pool.llm.active}/${data.pool.llm.total}`,
          },
        ].map((s, i) => (
          <div
            key={s.label}
            style={{
              padding: "8px 16px 8px 0",
              borderLeft:
                i === 0 ? "none" : "1px solid rgba(250, 247, 242, 0.18)",
              paddingLeft: i === 0 ? 0 : "16px",
            }}
          >
            <div
              style={{
                fontSize: "10.5px",
                letterSpacing: "0.18em",
                color: "#faf7f2",
                opacity: 0.55,
                marginBottom: "8px",
              }}
            >
              {s.label}
            </div>
            <div
              style={{
                fontSize: "clamp(28px, 3.6vw, 48px)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                lineHeight: 1,
                color: "#faf7f2",
              }}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
