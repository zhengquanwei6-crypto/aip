"use client";

import type { Bootstrap } from "./_data/bootstrap";

import Hero from "./_components/Hero";
import Architecture from "./_components/Architecture";
import Ledger from "./_components/Ledger";
import AgentsGrid from "./_components/AgentsGrid";
import Constraints from "./_components/Constraints";
import LiveDemoPanel from "./_components/LiveDemoPanel";
import Quote from "./_components/Quote";
import Marquee from "./_components/Marquee";
import Reveal from "./_components/Reveal";

/**
 * /showcase v5 · ShowcaseClient — Black Editorial Brutalist.
 *
 * Reading flow (top → bottom):
 *   Hero          (inkbed · stat strip)
 *   Marquee       (stripe · constraints teaser)
 *   Quote §01     (editorial pull-quote on inkbed)
 *   Architecture  (inkbed · 8-card asymmetric grid)
 *   Quote §02
 *   Ledger        (paper-surface flip · git + AIOutput)
 *   Quote §03     (back to inkbed)
 *   AgentsGrid    (inkbed · 8 cards)
 *   Marquee       (second beat)
 *   Quote §04
 *   Constraints   (paper flip · 5 numbered headlines)
 *   Quote §05
 *   LiveDemoPanel (inkbed · brand-coloured CTA)
 *   Footer        (inkbed · tiny mono)
 *
 * Constraints sit ABOVE LiveDemoPanel CTA — Req 6.3.
 */

export type { Bootstrap } from "./_data/bootstrap";

export function ShowcaseClient({ data }: { data: Bootstrap }) {
  return (
    <div>
      <Hero data={data} />
      <Marquee />
      <Reveal>
        <Quote entry={data.editorial[0]} index={1} />
      </Reveal>

      <Reveal>
        <Architecture data={data} />
      </Reveal>

      <Reveal>
        <Quote entry={data.editorial[1]} index={2} />
      </Reveal>

      <Reveal>
        <Ledger
          commits={data.commits}
          commitsProvenance={data.commitsProvenance}
          recent={data.recent}
        />
      </Reveal>

      <Reveal>
        <Quote entry={data.editorial[2]} index={3} />
      </Reveal>

      <Reveal>
        <AgentsGrid agents={data.agents} />
      </Reveal>

      <Marquee invert />

      <Reveal>
        <Quote entry={data.editorial[3]} index={4} />
      </Reveal>

      <Reveal>
        <Constraints />
      </Reveal>

      <Reveal>
        <Quote entry={data.editorial[4]} index={5} />
      </Reveal>

      <Reveal>
        <LiveDemoPanel />
      </Reveal>

      <PageFooter data={data} />
    </div>
  );
}

function PageFooter({ data }: { data: Bootstrap }) {
  const sha = data.commits[0]?.shortSha ?? "—";
  return (
    <footer
      style={{
        padding: "48px clamp(16px, 4vw, 64px)",
        borderTop: "1px solid rgba(250,247,242,0.18)",
        display: "flex",
        flexWrap: "wrap",
        gap: "16px",
        alignItems: "baseline",
        justifyContent: "space-between",
      }}
      className="font-mono"
    >
      <span
        style={{
          fontSize: "11px",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "rgba(250,247,242,0.55)",
        }}
      >
        guodong.ai · cuiqd · sgp1
      </span>
      <span
        style={{
          fontSize: "11px",
          letterSpacing: "0.04em",
          color: "rgba(250,247,242,0.4)",
        }}
      >
        build {data.version} · head {sha}
      </span>
    </footer>
  );
}
