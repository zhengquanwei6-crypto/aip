import type { Metadata, Viewport } from "next";

import { EDITORIAL_ENTRIES } from "./_data/editorial";

/**
 * /showcase v5 · Black Editorial — full-bleed dark hero, brutalist editorial
 * sectioning. Anti-2026-template via single-color accent (no gradients, no
 * glass, no mesh) + extreme display type at 144px+.
 *
 * Palette:
 *   - bg ink #0a0a0a · fg paper #faf7f2 · accent jelly #b08be8
 *   - section dividers 1px paper hairlines, never dashed
 *   - 0 image / 0 emoji / 0 gradient / 0 frosted layers
 *
 * Type stack:
 *   - Display + body share one humanist sans (Inter + Source Han Sans SC).
 *     The "weight ladder" carries hierarchy: 900 hero, 700 section, 500
 *     editorial body, mono 400 metadata. No serif (would read as 2026
 *     editorial cliché when the rest of the page is brutalist).
 *
 * Forced light text on inkbed: regardless of OS color-scheme, this subtree
 * stays dark. A separate child `data-surface="paper"` on inverted sections
 * (constraints + ledger) flips palette inline without touching globals.
 */
function currentMonthTag(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const LATEST_TOPIC =
  EDITORIAL_ENTRIES[EDITORIAL_ENTRIES.length - 1]?.topic ??
  "single-author multi-agent workstation";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.ojly.top"),
  title: `guodong.ai · ${currentMonthTag()}`,
  description: LATEST_TOPIC,
  openGraph: {
    title: `guodong.ai · ${currentMonthTag()}`,
    description: LATEST_TOPIC,
    type: "article",
    siteName: "guodong.ai",
    images: [
      {
        url: "/api/showcase/og",
        width: 1200,
        height: 630,
        alt: "guodong.ai",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `guodong.ai · ${currentMonthTag()}`,
    description: LATEST_TOPIC,
    images: ["/api/showcase/og"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
  themeColor: "#0a0a0a",
};

export default function ShowcaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="showcase-v5-root antialiased min-h-screen selection:bg-[#b08be8] selection:text-[#0a0a0a]"
      style={{
        background: "#0a0a0a",
        color: "#faf7f2",
        fontFamily:
          '"Inter", "Source Han Sans SC", -apple-system, "Helvetica Neue", sans-serif',
        fontFeatureSettings: '"ss01", "cv11"',
      }}
    >
      <style>{`
        .showcase-v5-root .font-mono {
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-variant-numeric: tabular-nums;
        }
        .showcase-v5-root,
        .showcase-v5-root section,
        .showcase-v5-root article,
        .showcase-v5-root header,
        .showcase-v5-root footer,
        .showcase-v5-root aside,
        .showcase-v5-root hr,
        .showcase-v5-root button,
        .showcase-v5-root input,
        .showcase-v5-root a {
          border-radius: 0;
        }
        .showcase-v5-root hr {
          border: 0;
          border-top: 1px solid #faf7f2;
          margin: 0;
          opacity: 0.18;
        }

        /* Inverted section: paper bg + ink fg. Flips selection too. */
        .showcase-v5-root [data-surface="paper"] {
          background: #faf7f2;
          color: #0a0a0a;
        }
        .showcase-v5-root [data-surface="paper"] hr {
          border-top-color: #0a0a0a;
        }
        .showcase-v5-root [data-surface="paper"] ::selection {
          background: #b08be8;
          color: #faf7f2;
        }

        /* Hairline accent rule for section eyebrow lines. */
        .showcase-v5-root .v5-rule {
          height: 1px;
          background: currentColor;
          opacity: 0.2;
          width: 100%;
        }
        .showcase-v5-root .v5-rule-accent {
          height: 1px;
          background: #b08be8;
          width: 48px;
          margin-bottom: 14px;
        }

        /* Reveal-on-scroll: intentionally tiny (8px / 220ms) — feels like
           the page is settling rather than performing. Reduced-motion cuts
           it entirely. */
        .showcase-v5-root [data-reveal] {
          opacity: 0;
          transform: translateY(8px);
          transition: opacity 220ms ease-out, transform 220ms ease-out;
        }
        .showcase-v5-root [data-reveal][data-revealed="true"] {
          opacity: 1;
          transform: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .showcase-v5-root *,
          .showcase-v5-root *::before,
          .showcase-v5-root *::after {
            transition-duration: 0ms !important;
            animation-duration: 0ms !important;
          }
          .showcase-v5-root [data-reveal] {
            opacity: 1 !important;
            transform: none !important;
          }
        }

        @media (prefers-color-scheme: light) {
          .showcase-v5-root {
            background: #0a0a0a !important;
            color: #faf7f2 !important;
          }
        }

        /* Display heading helper used by Hero + section dividers. */
        .showcase-v5-root .v5-display {
          font-weight: 900;
          letter-spacing: -0.04em;
          line-height: 0.92;
        }

        /* Marquee strip used between sections to create rhythmic
           brutalist beats. CSS-only, infinite, paused on hover so visitors
           can read it. Reduced-motion users get a static stripe. */
        .showcase-v5-root .v5-marquee {
          display: flex;
          gap: 48px;
          width: max-content;
          animation: v5-marquee 30s linear infinite;
        }
        .showcase-v5-root .v5-marquee:hover {
          animation-play-state: paused;
        }
        @keyframes v5-marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>

      {children}
    </div>
  );
}
