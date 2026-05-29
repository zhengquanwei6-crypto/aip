import type { ReactNode } from "react";

/**
 * showcase v4 · Footnote — 11.5px 溯源脚注
 *
 * Tiny inline span that hangs off the right side of a number, a row, or
 * an SVG node and quietly states where the value came from
 * (e.g. "from prisma.aIOutput.count()", "from .git/logs/HEAD",
 * "from /api/health").
 *
 * Server component (zero state, zero effects) so it can be inlined into
 * any RSC tree — Provenance rows, ArchitectureMap nodes, the bootstrap
 * counts panel, or just inline mid-sentence. Safe to nest inside text
 * because the rendered element is a single inline-level <span>.
 *
 * Visual contract (Req 7.4):
 *   - 11.5px font size (explicit inline style — must not float to whatever
 *     the surrounding paragraph is set to).
 *   - color #0a0a0a at 60% opacity (the spec's "ink at 60%" small-print).
 *   - Tabular monospace via Tailwind `font-mono` so digits, dots, and
 *     parentheses inside the source string stay aligned no matter the
 *     parent font.
 *   - 0.5em left margin so the footnote sits visibly to the right of
 *     whatever number / row it is annotating.
 *
 * Provenance contract (Req 7.4 + Property 3):
 *   - `data-provenance={source}` is ALWAYS emitted with the exact `source`
 *     string, regardless of whether `children` overrides the visible text.
 *     Property 3 (numeric provenance integrity) walks the rendered HTML
 *     and reads this attribute, so it must round-trip the prop verbatim.
 *
 * Visible text:
 *   - Default: "· " + source — reads as a footnote tail next to the
 *     adjacent number ("12 commits · from .git/logs/HEAD").
 *   - When `children` is provided, render that instead (lets callers say
 *     things like "from /api/health · ok" or use a localized label) —
 *     the data-provenance attribute still carries the canonical source.
 *
 * Validates: Requirements 7.4
 */
export interface FootnoteProps {
  /**
   * Canonical provenance string. Round-tripped verbatim into the
   * `data-provenance` attribute so downstream property tests can recover
   * it. Examples: `"from prisma.aIOutput.count()"`,
   * `"from .git/logs/HEAD"`, `"from /api/health"`.
   */
  source: string;
  /**
   * Optional override for the visible text. When omitted the component
   * renders `"· {source}"`. When provided the visible text is exactly
   * `children` and the data-provenance attribute still equals `source`.
   */
  children?: ReactNode;
  /** Optional extra Tailwind classes appended to the default ones. */
  className?: string;
}

export default function Footnote({
  source,
  children,
  className,
}: FootnoteProps) {
  const visible = children ?? `· ${source}`;
  const cls = className
    ? `font-mono align-baseline ${className}`
    : "font-mono align-baseline";

  return (
    <span
      data-provenance={source}
      className={cls}
      style={{
        fontSize: "11.5px",
        color: "#0a0a0a",
        opacity: 0.6,
        marginLeft: "0.5em",
        whiteSpace: "nowrap",
      }}
    >
      {visible}
    </span>
  );
}
