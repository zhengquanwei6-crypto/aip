import type { Editorial } from "../_data/editorial";

/**
 * v5 · Quote — section divider pull-quote.
 *
 * Renders one editorial entry as a giant pull-quote, like the opening of
 * a magazine feature. 36–60px display weight 700 in body 1 (only the
 * `topic` line). Date + section label sit underneath in monospace small
 * caps. Body paragraphs intentionally NOT rendered here — Quote is a
 * divider, the long-form thinking lives in the Hero sub-paragraph and
 * footer notes.
 *
 * Server component. No DOM markers (Margin TOC was retired in v5).
 */
export default function Quote({
  entry,
  index,
  invert = false,
}: {
  entry: Editorial;
  index: number;
  invert?: boolean;
}) {
  const fg = invert ? "#0a0a0a" : "#faf7f2";
  const sub = invert ? "rgba(10,10,10,0.65)" : "rgba(250,247,242,0.65)";
  const accent = "#b08be8";

  return (
    <div
      style={{
        padding: "clamp(48px, 8vw, 120px) clamp(16px, 4vw, 64px)",
      }}
    >
      <div
        className="font-mono"
        style={{
          fontSize: "11px",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: sub,
          marginBottom: "20px",
          display: "flex",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <span style={{ color: accent }}>§{String(index).padStart(2, "0")}</span>
        <span>{entry.date}</span>
        <span aria-hidden="true">/</span>
        <span>{entry.sectionAfter}</span>
      </div>
      <h2
        className="v5-display"
        style={{
          fontSize: "clamp(28px, 4.5vw, 64px)",
          fontWeight: 700,
          color: fg,
          margin: 0,
          maxWidth: "1200px",
        }}
      >
        “{entry.topic}”
      </h2>
      {entry.body[0] ? (
        <p
          style={{
            marginTop: "20px",
            fontSize: "clamp(14px, 1.1vw, 17px)",
            lineHeight: 1.6,
            color: sub,
            maxWidth: "720px",
          }}
        >
          {entry.body[0]}
        </p>
      ) : null}
    </div>
  );
}
