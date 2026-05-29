#!/usr/bin/env node
/**
 * scripts/check-showcase-v4.mjs
 *
 * 反退化围栏脚本（Req 13.2 / 13.3 / Property 1）。
 *
 * 扫描两类输入：
 *   1. 源码：`src/app/showcase/**` 下所有 .tsx / .ts 文件（自动跳过
 *      `v4-anti-patterns.ts` —— 那是 marker 的源真值，必然包含字面量）。
 *   2. 渲染产物：`.next/server/app/showcase/**` 下所有 .html / .rsc / .body
 *      文件（next build 后才存在，缺失时跳过该阶段并打印 hint，不算失败）。
 *
 * 命中任何 V3 anti-pattern marker 或 cookie-cutter 2026 marker → 立刻
 * `process.exit(1)` 并打印 `file:line:col  marker`，CI 据此 fail。
 *
 * 用法：
 *   node scripts/check-showcase-v4.mjs
 *
 * 在 package.json 里挂：
 *   "check:showcase": "node scripts/check-showcase-v4.mjs"
 *
 * 这是 Node 原生 ESM 脚本，零依赖，CI / 本地都能直跑。
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// scripts/ 与 src/ 平级 — 两层往上回到 repo root。
const REPO_ROOT = path.resolve(__dirname, "..");

const V3_ANTI_PATTERN_MARKERS = [
  "$ guodong --",
  "$ tail -f",
  "dmesg",
  "boot sequence",
  "CRT",
  "scanShimmer",
  "Sparkline",
  "TermBox",
  "AsciiBar",
];

const COOKIE_CUTTER_2026_MARKERS = [
  "trusted by",
  "join thousands",
  "we believe",
  "we built",
  "bento",
  "mesh-gradient",
  "glass-",
  "backdrop-blur",
];

const ALL_MARKERS = [...V3_ANTI_PATTERN_MARKERS, ...COOKIE_CUTTER_2026_MARKERS];

const SOURCE_ROOT = path.join(REPO_ROOT, "src", "app", "showcase");
const BUILD_ROOT = path.join(REPO_ROOT, ".next", "server", "app", "showcase");

const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const BUILD_EXTS = new Set([".html", ".body", ".rsc", ".meta", ".json"]);

const EXCLUDED_BASENAMES = new Set([
  // 这一份本身是 marker 的源真值，必然命中；按 Req 13.1 的 self-exclusion 契约跳过。
  "v4-anti-patterns.ts",
]);

/**
 * 递归收集 dir 下所有满足 ext 集合的文件路径。dir 不存在时返回空数组。
 */
function walk(dir, allowedExts) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    if (e && e.code === "ENOENT") return out;
    throw e;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...walk(full, allowedExts));
    } else if (ent.isFile()) {
      const ext = path.extname(ent.name).toLowerCase();
      if (allowedExts.has(ext) && !EXCLUDED_BASENAMES.has(ent.name)) {
        out.push(full);
      }
    }
  }
  return out;
}

/**
 * Substring 扫描；返回 [{ marker, line, col }]，1-based。case-insensitive。
 */
function scanContent(source) {
  const hits = [];
  if (!source || source.length === 0) return hits;
  const lower = source.toLowerCase();
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) lineStarts.push(i + 1);
  }
  function pos(offset) {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: offset - lineStarts[lo] + 1 };
  }
  for (const marker of ALL_MARKERS) {
    const needle = marker.toLowerCase();
    let from = 0;
    while (true) {
      const idx = lower.indexOf(needle, from);
      if (idx === -1) break;
      const p = pos(idx);
      hits.push({ marker, line: p.line, col: p.col });
      from = idx + 1;
    }
  }
  hits.sort(
    (a, b) => a.line - b.line || a.col - b.col || a.marker.localeCompare(b.marker),
  );
  return hits;
}

function relFromRoot(p) {
  return path.relative(REPO_ROOT, p).split(path.sep).join("/");
}

function scanFiles(files) {
  const allHits = [];
  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const hits = scanContent(content);
    if (hits.length === 0) continue;
    const rel = relFromRoot(file);
    for (const h of hits) {
      allHits.push({ file: rel, ...h });
    }
  }
  return allHits;
}

function reportPhase(label, hits, opts = {}) {
  if (hits.length === 0) {
    console.log(`[${label}] PASS`);
    return false;
  }
  console.log(`[${label}] FAIL · ${hits.length} hit(s)`);
  for (const h of hits) {
    console.log(`  ${h.file}:${h.line}:${h.col}  ${h.marker}`);
  }
  return true;
}

function main() {
  console.log("scripts/check-showcase-v4.mjs · scanning for v3 + 2026 anti-patterns");

  const sourceFiles = walk(SOURCE_ROOT, SOURCE_EXTS);
  console.log(
    `[source] root=${relFromRoot(SOURCE_ROOT)} · scanning ${sourceFiles.length} file(s)`,
  );
  const sourceHits = scanFiles(sourceFiles);
  const sourceFail = reportPhase("source", sourceHits);

  let buildFail = false;
  if (fs.existsSync(BUILD_ROOT)) {
    const buildFiles = walk(BUILD_ROOT, BUILD_EXTS);
    console.log(
      `[build]  root=${relFromRoot(BUILD_ROOT)} · scanning ${buildFiles.length} file(s)`,
    );
    const buildHits = scanFiles(buildFiles);
    buildFail = reportPhase("build", buildHits);
  } else {
    console.log(
      `[build]  SKIP · ${relFromRoot(BUILD_ROOT)} not found (run \`next build\` first to enable build-product scan)`,
    );
  }

  if (sourceFail || buildFail) {
    console.log("\noverall: FAIL — anti-pattern markers detected. Fix or update v4-anti-patterns.ts.");
    process.exit(1);
  }
  console.log("\noverall: PASS");
}

main();
