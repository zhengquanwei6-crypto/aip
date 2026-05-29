"use client";

import { useEffect, useState } from "react";
import type { CommitEntry } from "../_data/git";
import type { ProvenanceMark, Bootstrap } from "../_data/bootstrap";
import { SectionHeader } from "./Architecture";

/**
 * v5 · Ledger — paper-surface dual time-line.
 *
 * Inverts colour palette via `data-surface="paper"` on the section so the
 * page rhythm reads as a hard cut from inkbed → paper → inkbed. Renders
 * two parallel ledgers side by side: git commits (left) and AIOutput rows
 * excluding suggestions (right). Relative-time labels rewrite every minute
 * client-side without re-fetching.
 *
 * Fallback: when commitsProvenance.ok===false, single column AIOutput only
 * with a 1-line note, exactly per Req 4.5.
 */
const TICK_MS = 60_000;

function formatAgo(isoDate: string, now: number): string {
  const t = Date.parse(isoDate);
  if (!Number.isFinite(t)) return isoDate;
  const sec = Math.max(0, Math.floor((now - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function useMinuteTick(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const tick = () => setNow(Date.now());
    const start = () => {
      if (id !== null) return;
      tick();
      id = setInterval(tick, TICK_MS);
    };
    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };
    const onVis = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "hidden") stop();
      else start();
    };
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      tick();
    } else {
      start();
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVis);
    }
    return () => {
      stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVis);
      }
    };
  }, []);
  return now;
}

export interface LedgerProps {
  commits: CommitEntry[];
  commitsProvenance: ProvenanceMark;
  recent: Bootstrap["recent"];
}

export default function Ledger({
  commits,
  commitsProvenance,
  recent,
}: LedgerProps) {
  const now = useMinuteTick();
  const gitOk = commitsProvenance.ok;

  return (
    <section
      data-section="ledger"
      data-surface="paper"
      style={{
        padding: "clamp(48px, 8vw, 96px) clamp(16px, 4vw, 64px)",
      }}
    >
      <SectionHeader
        invert
        index="02"
        kicker="LEDGER"
        title="正在维护，不是发布会留痕"
        sub="左边是 .git 真实提交，右边是 prisma AIOutput 真实写入。每分钟客户端重算相对时间，不再请求服务器。"
      />

      <div
        style={{
          marginTop: "48px",
          display: "grid",
          gridTemplateColumns: gitOk ? "1fr 1fr" : "1fr",
          gap: "32px 48px",
        }}
        className="v5-ledger-grid"
      >
        <style>{`
          @media (max-width: 767px) {
            .v5-ledger-grid {
              grid-template-columns: 1fr !important;
            }
          }
          .v5-ledger-row {
            display: grid;
            grid-template-columns: 64px 1fr;
            align-items: baseline;
            padding: 10px 0;
            border-top: 1px solid rgba(10, 10, 10, 0.12);
            transition: background 80ms ease;
          }
          .v5-ledger-row:hover {
            background: rgba(10, 10, 10, 0.04);
          }
          .v5-ledger-time {
            font-family: "JetBrains Mono", ui-monospace, monospace;
            font-size: 11px;
            color: rgba(10, 10, 10, 0.55);
            letter-spacing: 0.04em;
          }
          .v5-ledger-body {
            font-size: 13.5px;
            line-height: 1.55;
            color: #0a0a0a;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .v5-ledger-tag {
            font-family: "JetBrains Mono", ui-monospace, monospace;
            font-size: 11px;
            color: #b08be8;
            margin-right: 8px;
            letter-spacing: 0.04em;
          }
          .v5-ledger-source {
            font-family: "JetBrains Mono", ui-monospace, monospace;
            font-size: 10.5px;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            color: rgba(10, 10, 10, 0.5);
            margin-bottom: 12px;
          }
        `}</style>

        {gitOk ? (
          <div>
            <div className="v5-ledger-source">
              GIT · .git/logs/HEAD
            </div>
            <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {commits.map((c) => (
                <li key={c.shortSha} className="v5-ledger-row">
                  <span className="v5-ledger-time">
                    {now === null
                      ? c.isoDate.slice(5, 10)
                      : formatAgo(c.isoDate, now)}
                  </span>
                  <span className="v5-ledger-body">
                    <span className="v5-ledger-tag">{c.shortSha}</span>
                    {c.subject}
                    <span style={{ color: "rgba(10,10,10,0.45)", marginLeft: "8px" }}>
                      · {c.author}
                      {c.filesChanged > 0
                        ? ` · ${c.filesChanged}f`
                        : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div
            className="font-mono"
            style={{
              fontSize: "11.5px",
              color: "rgba(10,10,10,0.6)",
              gridColumn: "1 / -1",
              padding: "12px 0",
            }}
            role="status"
          >
            git source unavailable — showing AIOutput ledger only
          </div>
        )}

        <div>
          <div className="v5-ledger-source">
            PRISMA · aIOutput.findMany(take: 12)
          </div>
          <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {recent.map((r, i) => (
              <li key={`${r.isoDate}-${i}`} className="v5-ledger-row">
                <span className="v5-ledger-time">
                  {r.isoDate && now !== null
                    ? formatAgo(r.isoDate, now)
                    : r.ago}
                </span>
                <span className="v5-ledger-body">
                  <span className="v5-ledger-tag">{r.type}</span>
                  {r.text}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
