/**
 * showcase v4 — anti-pattern markers + scanner.
 *
 * Single source-of-truth for v3-era and 2026 SaaS-template phrases that must
 * never appear in showcase v4 source code or rendered HTML.
 *
 * IMPORTANT — self-exclusion is the caller's job:
 *   This file itself contains every marker as a string literal (that's the
 *   point of being the source-of-truth). Any caller that scans repository
 *   files or rendered HTML MUST exclude `src/app/showcase/v4-anti-patterns.ts`
 *   from its input set. `scanForAntiPatterns` does NOT auto-skip — it reports
 *   every match in whatever string it is given.
 *
 * Pure TypeScript, zero runtime dependencies. Safe to import from both Node
 * scripts (e.g. `scripts/check-showcase-v4.mjs`) and Next.js client
 * components.
 *
 * Validates: Requirements 13.1
 */

export const V3_ANTI_PATTERN_MARKERS = [
  "$ guodong --", // v3 命令风按钮
  "$ tail -f",    // v3 hero/log 句柄
  "dmesg",        // boot 序列
  "boot sequence",
  "CRT",          // 扫描线
  "scanShimmer",
  "Sparkline",    // v3 组件名
  "TermBox",
  "AsciiBar",
] as const;

export const COOKIE_CUTTER_2026_MARKERS = [
  "trusted by",
  "join thousands",
  "we believe",
  "we built",
  "bento",
  "mesh-gradient",
  "glass-",       // glass-morphism / glass-card
  "backdrop-blur",
] as const;

/**
 * One hit reported by `scanForAntiPatterns`. `line` and `col` are both
 * 1-based and point at the first character of the matched substring.
 */
export interface AntiPatternHit {
  marker: string;
  line: number;
  col: number;
}

/**
 * Scan `source` for every occurrence of any marker in
 * `V3_ANTI_PATTERN_MARKERS ∪ COOKIE_CUTTER_2026_MARKERS`.
 *
 * Matching is case-insensitive substring matching (no word boundaries — the
 * markers are deliberately narrow enough that any in-word hit is also a
 * regression we want to flag).
 *
 * Returns every hit, including overlapping ones, sorted by (line, col) for
 * stable diagnostics. The empty array means a clean source.
 */
export function scanForAntiPatterns(
  source: string,
): { marker: string; line: number; col: number }[] {
  const hits: AntiPatternHit[] = [];

  if (source.length === 0) return hits;

  const lower = source.toLowerCase();

  // Precompute line-start offsets (offset of column 1 of each line in the
  // original source). lineStarts[0] === 0 always.
  const lineStarts: number[] = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10 /* \n */) {
      lineStarts.push(i + 1);
    }
  }

  const allMarkers: readonly string[] = [
    ...V3_ANTI_PATTERN_MARKERS,
    ...COOKIE_CUTTER_2026_MARKERS,
  ];

  for (const marker of allMarkers) {
    if (marker.length === 0) continue;
    const needle = marker.toLowerCase();
    let from = 0;
    while (true) {
      const idx = lower.indexOf(needle, from);
      if (idx === -1) break;
      const { line, col } = positionAt(idx, lineStarts);
      hits.push({ marker, line, col });
      from = idx + 1; // allow overlapping matches
    }
  }

  hits.sort((a, b) => (a.line - b.line) || (a.col - b.col) || a.marker.localeCompare(b.marker));
  return hits;
}

/**
 * Translate a 0-based source offset into a 1-based (line, col) pair using a
 * precomputed `lineStarts` index. Binary search keeps this O(log lines) per
 * hit so large files stay fast.
 */
function positionAt(
  offset: number,
  lineStarts: readonly number[],
): { line: number; col: number } {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, col: offset - lineStarts[lo] + 1 };
}
