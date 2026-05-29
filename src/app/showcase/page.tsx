/**
 * /showcase v4 — server entry.
 *
 * Pure wiring: opts the route out of static rendering, asks
 * `_data/bootstrap.ts` for one immutable snapshot of every numeric source
 * (counts / pool / vector / commits / editorial), then hands it to the
 * client root. No rendering logic lives here — that is the contract behind
 * Requirement 4.1 (single bootstrap entry) and Requirement 7.1 (the page
 * never invents numbers, it only forwards what `loadBootstrap` returned).
 *
 * Also emits a JSON-LD `SoftwareApplication` block (Req 12.4) with
 * `datePublished` derived from the latest commit ISO date (or the
 * bootstrap's `generatedAt` when git is unavailable).
 *
 * Validates: Requirements 4.1, 7.1, 12.4
 */

import { headers } from "next/headers";
import { loadBootstrap } from "./_data/bootstrap";
import { ShowcaseClient } from "./client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ShowcasePage() {
  // Touching `headers()` is the belt-and-braces opt-out of static rendering;
  // `dynamic = "force-dynamic"` already disables prerender, but reading
  // headers also poisons the route segment cache so a stray ISR config
  // can't sneak the page back into static generation.
  headers();

  const bootstrap = await loadBootstrap();

  const datePublished =
    bootstrap.commits[0]?.isoDate ?? bootstrap.generatedAt;
  const description =
    bootstrap.editorial[bootstrap.editorial.length - 1]?.topic ??
    "纸面工程笔记 — 单人维护的多智能体工作台。";

  const ldJson = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "guodong.ai",
    description,
    applicationCategory: "DesignApplication",
    operatingSystem: "Web",
    url: "https://www.ojly.top/showcase",
    datePublished,
    softwareVersion: bootstrap.version,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    author: { "@type": "Person", name: "cuiqd" },
  };

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJson) }}
      />
      <ShowcaseClient data={bootstrap} />
    </>
  );
}
