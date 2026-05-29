import "server-only";

/**
 * showcase v4 · git source loader.
 *
 * Reads the most recent commits from the running repository's `.git/` via
 * the `git` binary in two stages:
 *
 *   1. `git log -n {limit} --pretty=format:%h|%aI|%an|%s|%H` — pipe-delimited
 *      one row per commit, used to populate `shortSha / isoDate / author /
 *      subject / fullSha`.
 *   2. For every entry, `git show --shortstat --pretty=format: {fullSha}` —
 *      used only to extract the `N files? changed` count from the
 *      `--shortstat` summary line.
 *
 * The two stages have very different failure semantics (Requirements 4.1 and
 * 4.5):
 *
 *   - Stage 1 is the source-of-truth. If `git log` exits non-zero, times
 *     out, or `git` itself is missing (`ENOENT`), this module throws
 *     `GitSourceUnavailableError`. The Provenance component catches that at
 *     server-render and renders the "git source unavailable" fallback row,
 *     showing only the AIOutput ledger column.
 *   - Stage 2 is best-effort per entry. A failing `git show` (parse error,
 *     timeout, weird merge commit) does NOT trigger fallback — the entry is
 *     kept with `filesChanged = 0`, surfaced as a gap rather than a fault.
 *     Same applies to log lines that fail field parsing: they are skipped,
 *     other entries are still returned.
 *
 * Module-scope cache holds results for 60s keyed by `limit`. Single-process
 * deployment (one VPS, no horizontal scale) is acknowledged in design.md;
 * if/when we go multi-VPS, swap this for a tiny redis hashmap.
 *
 * `import "server-only"` at the top guarantees this can never end up in a
 * client bundle — child_process is Node-only and trying to ship it to the
 * browser would hard-error at build time.
 *
 * Validates: Requirements 4.1, 4.5
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * One row of the git ledger. Field order matches what `Provenance` renders
 * left-to-right.
 */
export type CommitEntry = {
  /** Abbreviated SHA from `%h`, e.g. `"3a4f1c2"`. */
  shortSha: string;
  /** Strict ISO 8601 with timezone from `%aI`, e.g. `"2026-05-12T08:14:09+08:00"`. */
  isoDate: string;
  /** Author name from `%an`, e.g. `"cuiqd"`. */
  author: string;
  /** Subject line from `%s` — may contain pipe characters. */
  subject: string;
  /**
   * Files-changed count from `git show --shortstat`. Zero when the per-commit
   * `git show` call fails or the shortstat line is absent (e.g. empty merge
   * commit). Non-fatal — see module docstring.
   */
  filesChanged: number;
};

/**
 * Thrown when the git source is COMPLETELY unavailable: the `git` binary is
 * missing, the cwd is not a repository, or the outer `git log` call exits
 * non-zero / times out. Callers (currently `_components/Provenance.tsx` via
 * server-render) catch this and render the fallback row.
 *
 * Partial / per-commit parsing errors do NOT raise this — they are reported
 * as gaps in individual entries (`filesChanged = 0` or skipped log lines).
 */
export class GitSourceUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GitSourceUnavailableError";
    // Preserve `cause` on engines that ignore the constructor option.
    if (options && "cause" in options && this.cause === undefined) {
      Object.defineProperty(this, "cause", {
        value: options.cause,
        enumerable: false,
        writable: true,
        configurable: true,
      });
    }
  }
}

const GIT_TIMEOUT_MS = 4_000;
const CACHE_TTL_MS = 60_000;
const MAX_BUFFER = 4 * 1024 * 1024;

type CacheEntry = { value: CommitEntry[]; expiresAt: number };
const cache = new Map<number, CacheEntry>();

/**
 * Spawn `git` with the given args from `process.cwd()`. Returns stdout on
 * success. On any failure (non-zero exit, timeout, ENOENT) the underlying
 * Error is propagated to the caller for context-specific handling.
 */
async function runGit(args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args as string[], {
    cwd: process.cwd(),
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
    windowsHide: true,
    encoding: "utf8",
  });
  return stdout;
}

type Partial = Omit<CommitEntry, "filesChanged"> & { fullSha: string };

/**
 * Parse one row of `git log --pretty=format:%h|%aI|%an|%s|%H`. Returns null
 * for malformed rows so the caller can skip them.
 *
 * Splitting strategy: %h, %aI, %an, %H never contain pipes; only %s
 * (subject) might. We anchor on the FIRST three pipes (for shortSha,
 * isoDate, author) and the LAST pipe (for fullSha), and treat everything
 * between as the subject.
 */
function parseLogLine(rawLine: string): Partial | null {
  const line = rawLine.trim();
  if (line.length === 0) return null;

  const sep1 = line.indexOf("|");
  if (sep1 <= 0) return null;
  const sep2 = line.indexOf("|", sep1 + 1);
  if (sep2 <= sep1 + 1) return null;
  const sep3 = line.indexOf("|", sep2 + 1);
  if (sep3 <= sep2 + 1) return null;
  const sepLast = line.lastIndexOf("|");
  if (sepLast <= sep3) return null;

  const shortSha = line.slice(0, sep1);
  const isoDate = line.slice(sep1 + 1, sep2);
  const author = line.slice(sep2 + 1, sep3);
  const subject = line.slice(sep3 + 1, sepLast);
  const fullSha = line.slice(sepLast + 1);

  // Cheap sanity gates — full SHA is 40 hex chars, ISO date should at least
  // start with `YYYY-`. Reject and let the caller skip.
  if (shortSha.length === 0 || author.length === 0) return null;
  if (!/^\d{4}-/.test(isoDate)) return null;
  if (!/^[0-9a-f]{40}$/i.test(fullSha)) return null;

  return { shortSha, isoDate, author, subject, fullSha };
}

/**
 * Pull the files-changed count out of `git show --shortstat`. The stat
 * summary appears at the end of stdout in one of these shapes:
 *
 *     " 8 files changed, 124 insertions(+), 32 deletions(-)"
 *     " 1 file changed, 4 insertions(+)"
 *
 * For commits with no diff (initial commit edge cases, merges with no
 * changes) the line is absent — return 0.
 */
function parseFilesChanged(stdout: string): number {
  const lines = stdout.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.length === 0) continue;
    const m = /^(\d+)\s+files?\s+changed/.exec(trimmed);
    if (m) {
      const n = Number.parseInt(m[1] ?? "0", 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    }
    // First non-empty line from the bottom that does not match the stat
    // pattern means there is no shortstat summary in this output.
    return 0;
  }
  return 0;
}

/**
 * Load up to `limit` most-recent commits from the running repo, newest
 * first. Cached in-process for 60 seconds per `limit`.
 *
 * Throws `GitSourceUnavailableError` only when the outer `git log` call
 * fails. Per-commit `git show` failures are absorbed silently and the
 * affected entries surface with `filesChanged = 0`.
 */
export async function loadCommits(limit = 12): Promise<CommitEntry[]> {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 12;
  const now = Date.now();

  const cached = cache.get(safeLimit);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  // Stage 1 — fatal on failure.
  let logStdout: string;
  try {
    logStdout = await runGit([
      "log",
      "-n",
      String(safeLimit),
      "--pretty=format:%h|%aI|%an|%s|%H",
    ]);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new GitSourceUnavailableError(
      `git log failed: ${reason}`,
      { cause: err },
    );
  }

  const partials: Partial[] = [];
  for (const rawLine of logStdout.split(/\r?\n/)) {
    const parsed = parseLogLine(rawLine);
    if (parsed) partials.push(parsed);
  }

  // Stage 2 — non-fatal; missing stat = 0.
  const entries: CommitEntry[] = await Promise.all(
    partials.map(async (p): Promise<CommitEntry> => {
      let filesChanged = 0;
      try {
        const showStdout = await runGit([
          "show",
          "--shortstat",
          "--pretty=format:",
          p.fullSha,
        ]);
        filesChanged = parseFilesChanged(showStdout);
      } catch {
        // Per-commit failure stays a gap, not a fault.
        filesChanged = 0;
      }
      return {
        shortSha: p.shortSha,
        isoDate: p.isoDate,
        author: p.author,
        subject: p.subject,
        filesChanged,
      };
    }),
  );

  // Cap defensively — `git log -n` should already enforce this, but a noisy
  // log (extra blank rows that survived `parseLogLine`) shouldn't blow past
  // the contract.
  const capped = entries.slice(0, safeLimit);

  cache.set(safeLimit, { value: capped, expiresAt: now + CACHE_TTL_MS });
  return capped;
}
