import "server-only";

/**
 * showcase v4 — anonymous demo rate-limit.
 *
 * In-memory dual-window counter for the public Live Agent Demo. Per-IP and
 * global windows both slide over a 24 hour period; expired timestamps are
 * lazily dropped on every consume call (no background timer, no cron).
 *
 * State is held in a single module-scoped object that is allocated lazily on
 * first use. Tests can call `__resetForTest()` to wipe state between cases.
 *
 * Validates: Requirements 3.4
 */

export const WINDOW_MS = 24 * 60 * 60 * 1000;
export const IP_LIMIT = 3;
export const GLOBAL_LIMIT = 100;

type State = { perIp: Map<string, number[]>; global: number[] };

let state: State | null = null;

function getState(): State {
  if (state === null) {
    state = { perIp: new Map<string, number[]>(), global: [] };
  }
  return state;
}

/**
 * Reset the in-memory state. Test-only — production code never calls this.
 * Exported so vitest property tests (task 2.6) can drive deterministic
 * windows without leaking state across iterations.
 */
export function __resetForTest(): void {
  state = { perIp: new Map<string, number[]>(), global: [] };
}

/**
 * Drop every timestamp at or before `now - WINDOW_MS` from the head of
 * `bucket`. Bucket entries are appended in monotonic order, so a single
 * forward scan is sufficient.
 */
function prune(bucket: number[], now: number): void {
  const cutoff = now - WINDOW_MS;
  let i = 0;
  while (i < bucket.length && bucket[i] <= cutoff) i++;
  if (i > 0) bucket.splice(0, i);
}

export interface ConsumeResult {
  ok: boolean;
  /**
   * Remaining slots for the binding scope.
   *  - on ok=true: the smaller of (ip remaining, global remaining)
   *  - on ok=false: 0 (the violated scope is exhausted)
   */
  remaining: number;
  /**
   * Epoch milliseconds when the binding scope's earliest in-window
   * timestamp expires (i.e. when at least one slot will free up).
   */
  resetAt: number;
  /** Only present when ok=false. Identifies which scope blocked. */
  scope?: "ip" | "global";
}

/**
 * Attempt to consume one slot for `ip` at logical time `now`.
 *
 * Pure with respect to time: the caller injects `now` so deterministic
 * tests can drive exact window boundaries. The function itself is stateful
 * by design — calling it twice with the same `now` for the same IP each
 * consumes a slot.
 */
export function tryConsume(ip: string, now: number): ConsumeResult {
  const s = getState();

  // 1. Lazy-prune both windows.
  prune(s.global, now);
  const ipBucket = s.perIp.get(ip);
  if (ipBucket !== undefined) prune(ipBucket, now);

  // 2. Per-IP guard.
  const ipCount = ipBucket === undefined ? 0 : ipBucket.length;
  if (ipCount >= IP_LIMIT) {
    // ipBucket is non-empty here because ipCount >= IP_LIMIT >= 1.
    return {
      ok: false,
      remaining: 0,
      resetAt: (ipBucket as number[])[0] + WINDOW_MS,
      scope: "ip",
    };
  }

  // 3. Global guard.
  if (s.global.length >= GLOBAL_LIMIT) {
    return {
      ok: false,
      remaining: 0,
      resetAt: s.global[0] + WINDOW_MS,
      scope: "global",
    };
  }

  // 4. Append to both windows.
  let bucket = ipBucket;
  if (bucket === undefined) {
    bucket = [];
    s.perIp.set(ip, bucket);
  }
  bucket.push(now);
  s.global.push(now);

  // 5. Compute remaining as the tighter of the two scopes.
  const ipRemaining = IP_LIMIT - bucket.length;
  const globalRemaining = GLOBAL_LIMIT - s.global.length;
  const remaining = ipRemaining < globalRemaining ? ipRemaining : globalRemaining;

  // 6. resetAt = earliest in-window timestamp across both scopes + WINDOW_MS.
  //    After the appends above both buckets are non-empty, so the fallback
  //    `now + WINDOW_MS` branch is unreachable in practice but kept for
  //    defensive correctness if future refactors reorder steps.
  const earliestIp = bucket[0];
  const earliestGlobal = s.global[0];
  let earliest: number;
  if (bucket.length === 0 && s.global.length === 0) {
    earliest = now;
  } else if (bucket.length === 0) {
    earliest = earliestGlobal;
  } else if (s.global.length === 0) {
    earliest = earliestIp;
  } else {
    earliest = earliestIp < earliestGlobal ? earliestIp : earliestGlobal;
  }
  const resetAt = earliest + WINDOW_MS;

  return { ok: true, remaining, resetAt };
}

/**
 * Diagnostics helper. Returns aggregate sizes only — never the per-IP
 * timestamp arrays (those are visitor-identifying when correlated with
 * server logs and have no caller outside tests).
 */
export function snapshot(): { ipBuckets: number; globalCount: number } {
  const s = getState();
  return { ipBuckets: s.perIp.size, globalCount: s.global.length };
}
