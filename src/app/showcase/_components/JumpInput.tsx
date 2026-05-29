"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * showcase v4 · JumpInput
 *
 * `/` 触发的浮层 search-or-jump 输入框。匹配三类目标：
 *   1) section anchor — 通过 `g 1-5` 直跳，或在浮层里输入 `g1`/`§2`/section id
 *   2) agent slug      — 浮层里直接输入 slug 前缀
 *   3) commit short SHA — 浮层里直接输入 short SHA 前缀
 *
 * 同时挂 `g` + digit 1-9（1500ms timeout）的 vim 风序列：跳到对应 section
 * 并把该段装订线日期高亮 1500ms。
 *
 * 系统级组合 (cmd/ctrl + L/F/R/W/T/N) 一律 NOT preventDefault（Req 9.5 / Property 9）。
 *
 * Validates: Requirements 9.1, 9.4, 9.5
 */

const SECTION_LABELS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "architecture", label: "§1 系统组件" },
  { id: "ledger", label: "§2 修改历史" },
  { id: "agents", label: "§3 智能体列表" },
  { id: "constraints", label: "§4 不做什么" },
  { id: "demo", label: "§5 试一次" },
];

const G_TIMEOUT_MS = 1500;
const HIGHLIGHT_MS = 1500;

type Target = { kind: "section" | "agent" | "commit"; key: string; label: string };

function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  return false;
}

function highlightSection(id: string) {
  if (typeof document === "undefined") return;
  const el = document.querySelector<HTMLElement>(`[data-section="${id}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });

  // try to highlight the nearest editorial date label sitting in the gutter
  // for HIGHLIGHT_MS — the Margin component reacts to scroll already, so we
  // dial up its visibility via a temporary class.
  const prev = el.previousElementSibling as HTMLElement | null;
  const target =
    prev?.matches?.("[data-editorial-entry]") ? prev : el.closest("section");
  if (!target) return;
  target.classList.add("showcase-jump-flash");
  window.setTimeout(() => target.classList.remove("showcase-jump-flash"), HIGHLIGHT_MS);
}

export default function JumpInput() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [agents, setAgents] = useState<string[]>([]);
  const [commits, setCommits] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const gPendingRef = useRef<{ at: number } | null>(null);

  // discover available agent slugs and short SHAs from the DOM
  useEffect(() => {
    if (!open) return;
    if (typeof document === "undefined") return;
    // agent slugs from the agents table first column
    const slugs = Array.from(
      document.querySelectorAll<HTMLElement>('[data-section="agents"] tbody tr td:first-child'),
    )
      .map((el) => el.textContent?.trim() ?? "")
      .filter(Boolean);
    setAgents(Array.from(new Set(slugs)));

    // short shas from the provenance ledger (font-mono cells with 7-12 hex)
    const shaCandidates = Array.from(
      document.querySelectorAll<HTMLElement>('[data-section="ledger"] .font-mono'),
    )
      .map((el) => el.textContent?.trim() ?? "")
      .filter((t) => /^[0-9a-f]{6,12}$/i.test(t));
    setCommits(Array.from(new Set(shaCandidates)));
  }, [open]);

  // open/close + g+digit sequence
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return; // Req 9.5

      if (e.key === "Escape" && open) {
        setOpen(false);
        setQuery("");
        return;
      }

      // open with `/`
      if (e.key === "/") {
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        setOpen(true);
        setQuery("");
        setActive(0);
        return;
      }

      // g + digit sequence (Req 9.1)
      if (!open && !isEditableTarget(e.target)) {
        if (e.key === "g") {
          gPendingRef.current = { at: Date.now() };
          return;
        }
        if (gPendingRef.current && /^[1-9]$/.test(e.key)) {
          const since = Date.now() - gPendingRef.current.at;
          gPendingRef.current = null;
          if (since > G_TIMEOUT_MS) return;
          const idx = Number.parseInt(e.key, 10) - 1;
          const target = SECTION_LABELS[idx];
          if (target) {
            e.preventDefault();
            highlightSection(target.id);
          }
          return;
        }
        if (gPendingRef.current && Date.now() - gPendingRef.current.at > G_TIMEOUT_MS) {
          gPendingRef.current = null;
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const targets = useMemo<Target[]>(() => {
    const all: Target[] = [];
    for (let i = 0; i < SECTION_LABELS.length; i++) {
      const s = SECTION_LABELS[i];
      all.push({ kind: "section", key: `g${i + 1}`, label: s.label });
    }
    for (const a of agents) all.push({ kind: "agent", key: a, label: `agent · ${a}` });
    for (const c of commits) all.push({ kind: "commit", key: c, label: `commit · ${c}` });
    if (query.trim().length === 0) return all;
    const q = query.toLowerCase();
    return all.filter((t) =>
      t.key.toLowerCase().includes(q) || t.label.toLowerCase().includes(q),
    );
  }, [agents, commits, query]);

  const jump = useCallback(
    (t: Target) => {
      if (t.kind === "section") {
        const idx = Number.parseInt(t.key.replace("g", ""), 10) - 1;
        const sec = SECTION_LABELS[idx];
        if (sec) highlightSection(sec.id);
      } else if (t.kind === "agent") {
        // navigate to /presets agent tab; deeplink to slug filter not supported globally
        window.location.href = `/presets?tab=agent#${t.key}`;
      } else {
        // commit: scroll the ledger into view + flash the row whose mono SHA matches
        highlightSection("ledger");
        const cells = Array.from(
          document.querySelectorAll<HTMLElement>('[data-section="ledger"] .font-mono'),
        );
        const hit = cells.find((c) => c.textContent?.trim() === t.key);
        if (hit) {
          const row = hit.closest("li") ?? hit.parentElement;
          if (row) {
            row.classList.add("showcase-jump-flash");
            window.setTimeout(() => row.classList.remove("showcase-jump-flash"), HIGHLIGHT_MS);
          }
        }
      }
      setOpen(false);
      setQuery("");
    },
    [],
  );

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(targets.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const t = targets[active];
      if (t) jump(t);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  };

  if (!open) {
    return (
      <style suppressHydrationWarning>{`
        .showcase-jump-flash {
          outline: 2px solid #b08be8;
          outline-offset: 4px;
        }
      `}</style>
    );
  }

  return (
    <>
      <style>{`
        .showcase-jump-flash {
          outline: 2px solid #b08be8;
          outline-offset: 4px;
        }
      `}</style>
      <div
        role="dialog"
        aria-modal="false"
        aria-label="跳转输入框"
        style={{
          position: "fixed",
          top: "max(80px, 8vh)",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 70,
          background: "#faf7f2",
          color: "#0a0a0a",
          border: "1px solid #0a0a0a",
          padding: "10px 14px",
          width: "min(440px, calc(100vw - 32px))",
          fontSize: "13px",
          boxShadow: "4px 4px 0 0 rgba(10,10,10,0.12)",
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onInputKeyDown}
          placeholder="跳转：agent slug / 段号 / commit sha 前缀"
          style={{
            fontFamily: "inherit",
            fontSize: "14px",
            width: "100%",
            border: "none",
            outline: "none",
            background: "transparent",
            color: "#0a0a0a",
            padding: "4px 0",
            borderBottom: "1px solid #0a0a0a",
          }}
        />
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "8px 0 0 0",
            maxHeight: "240px",
            overflowY: "auto",
          }}
        >
          {targets.length === 0 && (
            <li
              style={{
                padding: "6px 4px",
                fontSize: "12.5px",
                opacity: 0.6,
              }}
            >
              没有匹配 — Esc 关闭
            </li>
          )}
          {targets.map((t, i) => (
            <li
              key={`${t.kind}:${t.key}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => jump(t)}
              className="font-mono"
              style={{
                padding: "4px 6px",
                fontSize: "12.5px",
                cursor: "pointer",
                background: i === active ? "rgba(10,10,10,0.06)" : "transparent",
              }}
            >
              <span style={{ opacity: 0.5, marginRight: "8px" }}>{t.kind}</span>
              <span style={{ opacity: 0.85, marginRight: "8px" }}>{t.key}</span>
              <span style={{ opacity: 0.7 }}>{t.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
