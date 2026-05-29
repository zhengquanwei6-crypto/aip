/**
 * v5 · Marquee — between-section rhythmic strip.
 *
 * Server component. Renders a CSS-only infinite horizontal scroll of short
 * mono phrases, separated by accent purple bullets. Used to break the
 * vertical reading rhythm and re-anchor brand colour without a gradient.
 *
 * Two copies of the items are rendered back-to-back so the CSS animation
 * can translate -50% and seamlessly loop.
 *
 * Hover pauses (layout.tsx) so visitors can actually read what's there.
 */
const PHRASES = [
  "BYOK only",
  "无注册",
  "no cloud backend",
  "single VPS · sgp1",
  "real prisma counts",
  "no third-party analytics",
  "anonymous demo · 3/IP/24h",
  "not a SaaS",
];

export default function Marquee({
  invert = false,
}: {
  invert?: boolean;
}) {
  const items = [...PHRASES, ...PHRASES];
  return (
    <div
      aria-hidden="true"
      style={{
        overflow: "hidden",
        background: invert ? "#faf7f2" : "#0a0a0a",
        color: invert ? "#0a0a0a" : "#faf7f2",
        borderTop: `1px solid ${invert ? "#0a0a0a" : "#faf7f2"}`,
        borderBottom: `1px solid ${invert ? "#0a0a0a" : "#faf7f2"}`,
      }}
    >
      <div
        className="v5-marquee font-mono"
        style={{
          padding: "16px 0",
          fontSize: "13px",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        {items.map((p, i) => (
          <span
            key={i}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "48px",
              flexShrink: 0,
            }}
          >
            <span>{p}</span>
            <span style={{ color: "#b08be8" }}>•</span>
          </span>
        ))}
      </div>
    </div>
  );
}
