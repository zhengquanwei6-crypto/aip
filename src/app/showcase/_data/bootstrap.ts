import "server-only";

/**
 * showcase v4 — server-side bootstrap loader.
 *
 * Single entry point for `/showcase`'s server render. Aggregates everything
 * the page needs into a `Bootstrap` object whose shape is the contract
 * between server and client:
 *
 *   - `counts`     — prisma counts (agents / AIOutput / asset / apiKey / task /
 *                    pendingTasks / customPrompts), each with its own
 *                    `_provenance` mark so the page can render `"—"` per
 *                    individual failed query without taking down the rest.
 *   - `pool`       — api-key pool stats sourced from `/api/health` in one
 *                    fetch; one shared `_provenance` mark.
 *   - `vector`     — RAG status; `enabled` comes from prisma `Setting`,
 *                    `rows` from `/api/vector/status`. Provenance points at
 *                    the status endpoint (the canonical "is RAG live" check).
 *   - `recent` /
 *     `platformRecent` — preview rows from prisma `AIOutput`.
 *   - `commits`    — last N git commits via `_data/git.ts`. The git source
 *                    is allowed to be completely unavailable; that is NOT a
 *                    page-level error, just a fallback rendered as a single
 *                    note in `Provenance`.
 *   - `editorial`  — pure module, never fails (Requirement 2.1).
 *
 * Failure isolation is the whole point of this module. Every individual
 * fetch / query is wrapped in its own try/catch via the `safe()` helper, so
 * one upstream blip never cascades into the entire page failing to render
 * (Requirements 7.1, 7.3).
 *
 * Validates: Requirements 4.1, 4.2, 7.1, 7.3
 */

import { prisma } from "@/lib/db";
import { AGENTS } from "@/lib/agent-types";
import {
  loadCommits,
  GitSourceUnavailableError,
  type CommitEntry,
} from "./git";
import { getEditorialEntries, type Editorial } from "./editorial";

/**
 * Per-field provenance mark. Attached to every numeric / aggregate block so
 * the page can render `"—"` for failed sources and an inline footnote for
 * successful ones (Requirements 7.3, 7.4). `source` is intentionally human-
 * readable AND machine-greppable so the same string appears in the rendered
 * footnote, in audit logs, and in test assertions.
 */
export type ProvenanceMark = {
  /** e.g. `"prisma.aIOutput.count()"`, `"/api/health"`, `".git/logs/HEAD"`. */
  source: string;
  ok: boolean;
  /** Stringified upstream error (`Error.message` or `"unknown"`). Present
   *  iff `ok === false`. */
  error?: string;
};

/**
 * Provenance entries for the seven prisma counts. Keys mirror the count
 * field names exactly — `keyof Omit<Bootstrap["counts"], "_provenance">`.
 */
type CountsProvenance = {
  agents: ProvenanceMark;
  aiOutputs: ProvenanceMark;
  assets: ProvenanceMark;
  apiKeys: ProvenanceMark;
  tasks: ProvenanceMark;
  pendingTasks: ProvenanceMark;
  customPrompts: ProvenanceMark;
};

/**
 * The full server-bootstrap contract handed to `ShowcaseClient`. Every
 * scalar number is paired with provenance; the page is required to render
 * `"—"` whenever the corresponding `_provenance.ok` is false (Req 7.3).
 */
export type Bootstrap = {
  /** ISO timestamp at which this bootstrap was assembled. */
  generatedAt: string;
  version: string;
  serverStartedAt: number;
  serverUptimeMs: number;
  region: string;

  counts: {
    agents: number;
    aiOutputs: number;
    assets: number;
    apiKeys: number;
    tasks: number;
    pendingTasks: number;
    customPrompts: number;
    _provenance: CountsProvenance;
  };

  pool: {
    llm: { active: number; total: number; lastError: string | null };
    image: { active: number; total: number; lastError: string | null };
    imageDefaultAdapter: string;
    /** Always carries `source: "/api/health"`. */
    _provenance: ProvenanceMark;
  };

  vector: {
    enabled: boolean;
    rows: number;
    /** Always carries `source: "/api/vector/status"`. */
    _provenance: ProvenanceMark;
  };

  publishDirector: { total: number; success: number; fail: number };

  agents: Array<{
    slug: string;
    name: string;
    icon?: string;
    desc: string;
    scope: string[];
  }>;

  /**
   * Recent AIOutput rows (excluding `suggestion`). `ago` is a server-rendered
   * fallback label (`"12m ago"`) computed from the same `now` used for the
   * rest of the bootstrap; `isoDate` is the raw ISO 8601 timestamp so the
   * client (`Provenance.tsx`) can recompute the relative-time label every
   * 60 seconds without a server round-trip (Req 4.4).
   */
  recent: Array<{ type: string; text: string; isoDate: string; ago: string }>;
  platformRecent: Array<{ platform: string; model: string; ago: string }>;

  /** Last N commits, newest first. Empty array iff `commitsProvenance.ok`
   *  is false (git source unavailable). */
  commits: CommitEntry[];
  /** `source: ".git/logs/HEAD"`; `ok: false` when git is unavailable. */
  commitsProvenance: ProvenanceMark;

  /** Five-entry editorial spine, fifth entry's date materialised from
   *  the `now` argument. Pure module — never fails. */
  editorial: Editorial[];
};

const HEALTH_URL = "http://127.0.0.1:3000/api/health";
const VECTOR_STATUS_URL = "http://127.0.0.1:3000/api/vector/status";

/**
 * Stringify any thrown value into something we can put in
 * `ProvenanceMark.error`. Always returns a non-empty string so callers can
 * trust the field's presence implies a real error.
 */
function describeError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.length > 0) return err;
  try {
    const s = JSON.stringify(err);
    if (s && s !== "{}") return s;
  } catch {
    /* fallthrough */
  }
  return "unknown";
}

/**
 * Run an async op with isolated failure semantics. On success returns
 * `{ value, mark: { source, ok: true } }`; on rejection returns
 * `{ value: fallback, mark: { source, ok: false, error } }`. NEVER throws —
 * that's the whole point.
 */
async function safe<T>(
  source: string,
  op: () => Promise<T>,
  fallback: T,
): Promise<{ value: T; mark: ProvenanceMark }> {
  try {
    const value = await op();
    return { value, mark: { source, ok: true } };
  } catch (err) {
    return {
      value: fallback,
      mark: { source, ok: false, error: describeError(err) },
    };
  }
}

/**
 * Try to extract a human-friendly preview from an `AIOutput` row's `output`
 * or `input` JSON blob. Mirrors the v3 page.tsx behaviour exactly so the
 * `recent` ledger reads the same after the layout swap.
 *
 * Strategy: try parsing as JSON and pick the first present field of the
 * common preview shapes; on failure, fall back to the raw string. Final
 * result is collapsed whitespace + clipped to 56 chars with an ellipsis.
 */
function preview(out: string, input: string): string {
  const tryParse = (s: string): string | null => {
    try {
      const j = JSON.parse(s);
      if (typeof j?.title === "string") return j.title;
      if (Array.isArray(j?.titles) && j.titles[0]) return String(j.titles[0]);
      if (typeof j?.summary === "string") return j.summary;
      if (typeof j?.body === "string") return j.body.slice(0, 60);
      if (typeof j?.coverText === "string") return j.coverText;
      if (typeof j?.prompt === "string") return j.prompt;
    } catch {
      /* ignore */
    }
    return null;
  };
  const a = (out && tryParse(out)) || (input && tryParse(input));
  const raw = (a || out || input || "").replace(/\s+/g, " ").trim();
  return raw.length > 56 ? raw.slice(0, 56) + "…" : raw;
}

/**
 * Format a relative-time label ("12m ago", "3h ago", ...) given a `Date`
 * and a reference `now`. Pure — same input, same output, always — so
 * server-rendered labels are deterministic per `now`.
 */
function ago(d: Date, now: Date): string {
  const ms = now.getTime() - d.getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d2 = Math.floor(h / 24);
  return `${d2}d ago`;
}

/**
 * Shape of `/api/health` response we read. Only the fields we use are
 * declared; the upstream payload may carry more.
 */
type HealthPayload = {
  version?: string;
  startedAt?: string;
  serverUptimeMs?: number;
  imageDefaultAdapter?: string;
  apiKeyPool?: {
    llm?: { active?: number; total?: number; lastError?: string | null };
    image?: { active?: number; total?: number; lastError?: string | null };
  };
  publishDirectorStats?: { total?: number; success?: number; fail?: number };
};

type HealthSnapshot = {
  version: string;
  serverStartedAt: number;
  serverUptimeMs: number;
  imageDefaultAdapter: string;
  llmActive: number;
  llmTotal: number;
  llmLastError: string | null;
  imgActive: number;
  imgTotal: number;
  imgLastError: string | null;
  pdTotal: number;
  pdSuccess: number;
  pdFail: number;
};

/**
 * Default health snapshot used when `/api/health` fails. Keeps every numeric
 * at zero so the page renders `0` literals (which is correct per Req 5.3 —
 * `0 keys` is valid, `"no keys yet"` is not) and version at `"v0.14"` to
 * match the v3 placeholder so the topbar is never blank.
 */
function defaultHealthSnapshot(now: Date): HealthSnapshot {
  return {
    version: "v0.14",
    serverStartedAt: now.getTime(),
    serverUptimeMs: 0,
    imageDefaultAdapter: "",
    llmActive: 0,
    llmTotal: 0,
    llmLastError: null,
    imgActive: 0,
    imgTotal: 0,
    imgLastError: null,
    pdTotal: 0,
    pdSuccess: 0,
    pdFail: 0,
  };
}

/**
 * Fetch and project `/api/health` into a flat snapshot. Throws on any
 * failure so the caller's `safe()` wrap can record the error mark.
 */
async function fetchHealth(): Promise<HealthPayload> {
  const r = await fetch(HEALTH_URL, { cache: "no-store" });
  if (!r.ok) {
    throw new Error(`/api/health returned HTTP ${r.status}`);
  }
  return (await r.json()) as HealthPayload;
}

function projectHealth(j: HealthPayload, now: Date): HealthSnapshot {
  const fallback = defaultHealthSnapshot(now);
  return {
    version: typeof j.version === "string" ? j.version : fallback.version,
    serverStartedAt:
      typeof j.startedAt === "string"
        ? new Date(j.startedAt).getTime()
        : fallback.serverStartedAt,
    serverUptimeMs:
      typeof j.serverUptimeMs === "number"
        ? j.serverUptimeMs
        : fallback.serverUptimeMs,
    imageDefaultAdapter:
      typeof j.imageDefaultAdapter === "string" ? j.imageDefaultAdapter : "",
    llmActive: j.apiKeyPool?.llm?.active ?? 0,
    llmTotal: j.apiKeyPool?.llm?.total ?? 0,
    llmLastError: j.apiKeyPool?.llm?.lastError ?? null,
    imgActive: j.apiKeyPool?.image?.active ?? 0,
    imgTotal: j.apiKeyPool?.image?.total ?? 0,
    imgLastError: j.apiKeyPool?.image?.lastError ?? null,
    pdTotal: j.publishDirectorStats?.total ?? 0,
    pdSuccess: j.publishDirectorStats?.success ?? 0,
    pdFail: j.publishDirectorStats?.fail ?? 0,
  };
}

/**
 * Pull the row count out of `/api/vector/status`. The endpoint reports
 * separate counts for `history` and `assets`; the showcase page only cares
 * about the total, which is what we return.
 */
async function fetchVectorRows(): Promise<number> {
  const r = await fetch(VECTOR_STATUS_URL, { cache: "no-store" });
  if (!r.ok) {
    throw new Error(`/api/vector/status returned HTTP ${r.status}`);
  }
  const j = (await r.json()) as {
    history?: { rows?: number };
    assets?: { rows?: number };
  };
  return (Number(j?.history?.rows) || 0) + (Number(j?.assets?.rows) || 0);
}

/**
 * Load commits with full error isolation. Returns the same shape regardless
 * of whether the git source is available — `commits: []` plus an `ok: false`
 * mark when unavailable, matching the contract documented in `_data/git.ts`.
 *
 * `GitSourceUnavailableError` is the documented signal for "fall back to
 * AIOutput-only ledger" (Req 4.5); any other unexpected throw is treated
 * the same way so a malformed log row never crashes the page.
 */
async function loadCommitsSafely(): Promise<{
  commits: CommitEntry[];
  mark: ProvenanceMark;
}> {
  const source = ".git/logs/HEAD";
  try {
    const commits = await loadCommits();
    return { commits, mark: { source, ok: true } };
  } catch (err) {
    const message =
      err instanceof GitSourceUnavailableError
        ? err.message
        : `unexpected git loader failure: ${describeError(err)}`;
    return { commits: [], mark: { source, ok: false, error: message } };
  }
}

/**
 * Assemble a `Bootstrap` for one server render. `now` is dependency-injected
 * so callers (including tests) can pin time without monkey-patching `Date`.
 *
 * All upstream calls run in parallel via `Promise.all`. Each call is
 * individually wrapped via `safe()` (or the pattern-equivalent
 * `loadCommitsSafely`), so the outer `Promise.all` never rejects in
 * practice — a single failed prisma count just lands as `value: 0` plus a
 * `_provenance.ok: false` mark, and the page renders `"—"` for that field
 * (Req 7.3).
 */
export async function loadBootstrap(now: Date = new Date()): Promise<Bootstrap> {
  const [
    aiOutputCount,
    assetCount,
    apiKeyCount,
    taskCount,
    pendingTaskCount,
    customPromptCount,
    vectorEnabledRes,
    recentRows,
    pdRecent,
    healthRes,
    commitsRes,
  ] = await Promise.all([
    safe("prisma.aIOutput.count()", () => prisma.aIOutput.count(), 0),
    safe("prisma.asset.count()", () => prisma.asset.count(), 0),
    safe("prisma.apiKey.count()", () => prisma.apiKey.count(), 0),
    safe("prisma.task.count()", () => prisma.task.count(), 0),
    safe(
      "prisma.task.count({ where: { status: 'pending' } })",
      () => prisma.task.count({ where: { status: "pending" } }),
      0,
    ),
    safe(
      "prisma.setting.count({ where: { key: { startsWith: 'prompt:' } } })",
      () =>
        prisma.setting.count({ where: { key: { startsWith: "prompt:" } } }),
      0,
    ),
    safe(
      "prisma.setting.findUnique({ where: { key: 'VECTOR_ENABLED' } })",
      () =>
        prisma.setting
          .findUnique({ where: { key: "VECTOR_ENABLED" } })
          .then((r) => r?.value === "1"),
      false,
    ),
    safe(
      "prisma.aIOutput.findMany(take: 12)",
      () =>
        prisma.aIOutput.findMany({
          orderBy: { createdAt: "desc" },
          take: 12,
          select: {
            type: true,
            input: true,
            output: true,
            model: true,
            createdAt: true,
          },
        }),
      [] as Array<{
        type: string;
        input: string | null;
        output: string | null;
        model: string | null;
        createdAt: Date;
      }>,
    ),
    safe(
      "prisma.aIOutput.findMany({ type: in [platform-build, platform-build-5img] })",
      () =>
        prisma.aIOutput.findMany({
          where: { type: { in: ["platform-build", "platform-build-5img"] } },
          orderBy: { createdAt: "desc" },
          take: 6,
          select: {
            type: true,
            input: true,
            model: true,
            createdAt: true,
          },
        }),
      [] as Array<{
        type: string;
        input: string | null;
        model: string | null;
        createdAt: Date;
      }>,
    ),
    safe<HealthPayload>("/api/health", fetchHealth, {}),
    loadCommitsSafely(),
  ]);

  // The vector-rows fetch is gated on `vectorEnabled`. Only spend a
  // round-trip if the prisma flag confirmed RAG is on.
  let vectorRowsValue = 0;
  let vectorMark: ProvenanceMark;
  if (vectorEnabledRes.value) {
    const r = await safe("/api/vector/status", fetchVectorRows, 0);
    vectorRowsValue = r.value;
    vectorMark = r.mark;
  } else {
    // RAG disabled is a valid system state, not an error. Mark the
    // provenance as ok with a zero count so the architecture map renders
    // the literal `"0 vectors"` per Req 5.3.
    vectorMark = vectorEnabledRes.mark.ok
      ? { source: "/api/vector/status", ok: true }
      : {
          source: "/api/vector/status",
          ok: false,
          error: vectorEnabledRes.mark.error ?? "VECTOR_ENABLED setting unavailable",
        };
  }

  const health = projectHealth(healthRes.value, now);

  const recent = recentRows.value
    .filter((r) => r.type !== "suggestion")
    .slice(0, 8)
    .map((r) => ({
      type: r.type,
      text:
        preview(r.output ?? "", r.input ?? "") || `${r.type} output`,
      isoDate: r.createdAt.toISOString(),
      ago: ago(r.createdAt, now),
    }));

  const platformRecent = pdRecent.value.map((r) => {
    let platform = "?";
    try {
      const j = JSON.parse(r.input ?? "");
      if (typeof j?.platform === "string") platform = j.platform;
    } catch {
      /* ignore */
    }
    return { platform, model: r.model ?? "?", ago: ago(r.createdAt, now) };
  });

  return {
    generatedAt: now.toISOString(),
    version: health.version,
    serverStartedAt: health.serverStartedAt,
    serverUptimeMs: health.serverUptimeMs,
    region: "sgp1",

    counts: {
      // AGENTS is a static module export — its length cannot fail at
      // runtime, so the mark is always ok.
      agents: AGENTS.length,
      aiOutputs: aiOutputCount.value,
      assets: assetCount.value,
      apiKeys: apiKeyCount.value,
      tasks: taskCount.value,
      pendingTasks: pendingTaskCount.value,
      customPrompts: customPromptCount.value,
      _provenance: {
        agents: { source: "AGENTS.length", ok: true },
        aiOutputs: aiOutputCount.mark,
        assets: assetCount.mark,
        apiKeys: apiKeyCount.mark,
        tasks: taskCount.mark,
        pendingTasks: pendingTaskCount.mark,
        customPrompts: customPromptCount.mark,
      },
    },

    pool: {
      llm: {
        active: health.llmActive,
        total: health.llmTotal,
        lastError: health.llmLastError,
      },
      image: {
        active: health.imgActive,
        total: health.imgTotal,
        lastError: health.imgLastError,
      },
      imageDefaultAdapter: health.imageDefaultAdapter,
      _provenance: healthRes.mark,
    },

    vector: {
      enabled: vectorEnabledRes.value,
      rows: vectorRowsValue,
      _provenance: vectorMark,
    },

    publishDirector: {
      total: health.pdTotal,
      success: health.pdSuccess,
      fail: health.pdFail,
    },

    agents: AGENTS.map((a) => ({
      slug: a.slug,
      name: a.name,
      icon: a.icon,
      desc: a.description,
      scope: a.scope ?? [],
    })),

    recent,
    platformRecent,

    commits: commitsRes.commits,
    commitsProvenance: commitsRes.mark,

    editorial: getEditorialEntries(now),
  };
}
