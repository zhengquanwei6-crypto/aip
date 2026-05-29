"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { SectionHeader } from "./Architecture";

/**
 * v5 · LiveDemoPanel — full-bleed inkbed demo.
 *
 * Single text input + 4 preset buttons. Submit → POST /api/showcase/demo
 * (SSE). Streams output character by character into a paper-surface block
 * that flips palette to make the output stand out from the dark hero/
 * agents/architecture sections around it.
 *
 * Mobile (< 768px viewport) shows the latest 3 demo runs read-only and
 * disables the input.
 */

const PRESETS = [
  { key: "1", text: "给小红书写一条护肤前后对比的 hook，主打春季敏感肌" },
  { key: "2", text: "给闲鱼一条二手大衣的标题，强调九成新+原价 1980" },
  { key: "3", text: "给千牛一段冬装羊毛裤的卖点 5 句话" },
  { key: "4", text: "给 xhs 写 5 条治愈系奶茶店主题" },
] as const;

const PROMPT_MAX = 200;
const MOBILE_BREAKPOINT = 768;

type Stream =
  | { phase: "idle" }
  | { phase: "running"; t0: number; tokens: number; output: string }
  | { phase: "done"; ms: number; tokens: number; output: string; model: string }
  | { phase: "error"; status: number | null; reason: string };

type RecentRow = {
  id: string;
  promptPreview: string;
  outputPreview: string;
  model: string;
  isoDate: string;
  ago: string;
};

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => setMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

function formatReset(resetAt: number | null, now: number): string {
  if (resetAt === null) return "—";
  const ms = Math.max(0, resetAt - now);
  const min = Math.ceil(ms / 60_000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseDelta(payload: string): string {
  if (payload === "[DONE]") return "";
  try {
    const j = JSON.parse(payload);
    const d =
      j?.choices?.[0]?.delta?.content ??
      j?.choices?.[0]?.message?.content ??
      "";
    return typeof d === "string" ? d : "";
  } catch {
    return "";
  }
}

export default function LiveDemoPanel() {
  const isMobile = useIsMobile();
  const [prompt, setPrompt] = useState("");
  const [stream, setStream] = useState<Stream>({ phase: "idle" });
  const [remaining, setRemaining] = useState<number | null>(null);
  const [resetAt, setResetAt] = useState<number | null>(null);
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const [now, setNow] = useState(Date.now());
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    let cancel = false;
    const load = async () => {
      try {
        const r = await fetch("/api/showcase/recent-demos", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { ok: boolean; items?: RecentRow[] };
        if (!cancel && j.ok && Array.isArray(j.items)) {
          setRecent(j.items.slice(0, 3));
        }
      } catch {
        /* silent */
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancel = true;
      clearInterval(id);
    };
  }, [isMobile]);

  const submit = useCallback(async () => {
    const p = prompt.trim();
    if (p.length === 0 || p.length > PROMPT_MAX) return;
    if (remaining === 0) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const t0 = Date.now();
    setStream({ phase: "running", t0, tokens: 0, output: "" });

    try {
      const res = await fetch("/api/showcase/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p }),
        signal: ac.signal,
      });
      const remHdr = res.headers.get("X-RateLimit-Remaining");
      const rstHdr = res.headers.get("X-RateLimit-Reset");
      if (remHdr !== null) setRemaining(Math.max(0, Number.parseInt(remHdr, 10)));
      if (rstHdr) setResetAt(Number.parseInt(rstHdr, 10));

      if (!res.ok) {
        const text = await res.text();
        let reason = text.slice(0, 200);
        try {
          const j = JSON.parse(text);
          if (typeof j.reason === "string") reason = j.reason;
          else if (typeof j.error === "string") reason = j.error;
        } catch {
          /* ignore */
        }
        if (res.status === 429) setRemaining(0);
        setStream({ phase: "error", status: res.status, reason });
        return;
      }
      const model = res.headers.get("X-Upstream-Model") ?? "";
      const reader = res.body?.getReader();
      if (!reader) {
        setStream({ phase: "error", status: null, reason: "empty response body" });
        return;
      }
      const decoder = new TextDecoder();
      let buf = "";
      let collected = "";
      let tokens = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;
          const delta = parseDelta(payload);
          if (delta.length > 0) {
            collected += delta;
            tokens += 1;
            setStream({ phase: "running", t0, tokens, output: collected });
          }
        }
      }
      const ms = Date.now() - t0;
      setStream({ phase: "done", ms, tokens, output: collected, model });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setStream({ phase: "idle" });
        return;
      }
      setStream({
        phase: "error",
        status: null,
        reason: (err as Error).message ?? "network error",
      });
    } finally {
      abortRef.current = null;
    }
  }, [prompt, remaining]);

  if (isMobile) {
    return (
      <section
        data-section="demo"
        id="demo"
        style={{
          padding: "clamp(48px, 8vw, 96px) clamp(16px, 4vw, 64px)",
        }}
      >
        <SectionHeader
          index="05"
          kicker="LIVE DEMO"
          title="桌面端打开 · 亲手跑一次"
          sub="移动端只读。下面是其他访客最近 3 次跑出来的真实输出。"
        />
        <div style={{ marginTop: "32px" }}>
          {recent.length === 0 ? (
            <div className="font-mono" style={{ fontSize: "12px", opacity: 0.6 }}>
              还没人跑过 · be the first (desktop only)
            </div>
          ) : (
            recent.map((r, i) => (
              <div
                key={r.id}
                style={{
                  borderTop: i === 0 ? "none" : "1px solid rgba(250,247,242,0.18)",
                  padding: "16px 0",
                  fontSize: "13.5px",
                  lineHeight: 1.6,
                }}
              >
                <div className="font-mono" style={{ fontSize: "11px", opacity: 0.55 }}>
                  {r.ago} · {r.model}
                </div>
                <div style={{ marginTop: "6px", opacity: 0.85 }}>
                  <span style={{ color: "#b08be8", marginRight: "6px" }}>q.</span>
                  {r.promptPreview}
                </div>
                <div style={{ marginTop: "4px", opacity: 0.85 }}>
                  <span style={{ color: "#b08be8", marginRight: "6px" }}>a.</span>
                  {r.outputPreview}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    );
  }

  const elapsed =
    stream.phase === "running"
      ? ((now - stream.t0) / 1000).toFixed(1)
      : stream.phase === "done"
      ? (stream.ms / 1000).toFixed(1)
      : "0.0";
  const tokens =
    stream.phase === "running" || stream.phase === "done" ? stream.tokens : 0;
  const showOutput = stream.phase === "running" || stream.phase === "done";
  const output =
    stream.phase === "running" || stream.phase === "done" ? stream.output : "";
  const disabled =
    stream.phase === "running" || remaining === 0 || prompt.trim().length === 0;

  return (
    <section
      data-section="demo"
      id="demo"
      style={{
        padding: "clamp(48px, 8vw, 96px) clamp(16px, 4vw, 64px)",
      }}
    >
      <SectionHeader
        index="05"
        kicker="LIVE DEMO"
        title="亲手跑一次 copy-writer"
        sub="不是录屏，不是占位文。后端会真去 CometAPI 抢一个 token 名额，把首字流回来给你。匿名访客每 24 小时 3 次，全站合计 100 次。"
      />

      <div
        style={{
          marginTop: "48px",
          display: "grid",
          gap: "0",
          gridTemplateColumns: "1fr",
        }}
      >
        {/* input strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: "0",
            border: "1px solid #faf7f2",
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value.slice(0, PROMPT_MAX))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="例：给小红书写一条治愈系咖啡馆主题的标题"
            style={{
              fontFamily: "inherit",
              fontSize: "16px",
              padding: "20px 20px",
              background: "transparent",
              color: "#faf7f2",
              border: "none",
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={disabled}
            style={{
              fontFamily: "inherit",
              fontSize: "13px",
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              padding: "0 32px",
              border: "none",
              borderLeft: "1px solid #faf7f2",
              background: disabled ? "transparent" : "#b08be8",
              color: disabled ? "#faf7f2" : "#0a0a0a",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.4 : 1,
            }}
          >
            {stream.phase === "running" ? "running…" : "RUN ↵"}
          </button>
        </div>

        {/* preset row */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0",
            border: "1px solid #faf7f2",
            borderTop: "none",
          }}
        >
          {PRESETS.map((p, i) => (
            <button
              type="button"
              key={p.key}
              onClick={() => {
                setPrompt(p.text);
                inputRef.current?.focus();
              }}
              style={{
                fontFamily: "inherit",
                fontSize: "12.5px",
                padding: "12px 20px",
                background: "transparent",
                color: "#faf7f2",
                border: "none",
                borderLeft: i === 0 ? "none" : "1px solid rgba(250,247,242,0.22)",
                cursor: "pointer",
                flex: "1 1 auto",
                textAlign: "left",
                opacity: 0.8,
              }}
            >
              <span
                className="font-mono"
                style={{ color: "#b08be8", marginRight: "10px" }}
              >
                [{p.key}]
              </span>
              {p.text.length > 22 ? p.text.slice(0, 22) + "…" : p.text}
            </button>
          ))}
        </div>

        {/* meta strip */}
        <div
          className="font-mono"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "20px",
            padding: "12px 20px",
            border: "1px solid #faf7f2",
            borderTop: "none",
            fontSize: "11px",
            letterSpacing: "0.06em",
            color: "rgba(250,247,242,0.6)",
          }}
        >
          <span>tokens: {tokens}</span>
          <span>elapsed: {elapsed}s</span>
          {stream.phase === "done" && (
            <span>model: {stream.model || "—"}</span>
          )}
          <span style={{ marginLeft: "auto" }}>
            quota: {remaining ?? "—"} · reset in {formatReset(resetAt, now)}
          </span>
        </div>

        {/* output panel — paper-surface inversion to break the rhythm */}
        {showOutput && (
          <div
            data-surface="paper"
            style={{
              padding: "32px 24px",
              border: "1px solid #faf7f2",
              borderTop: "none",
            }}
            aria-live="polite"
          >
            <div
              className="font-mono"
              style={{
                fontSize: "10.5px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(10,10,10,0.55)",
                marginBottom: "16px",
              }}
            >
              output {stream.phase === "running" ? "(streaming)" : ""}
            </div>
            <div
              style={{
                fontSize: "16px",
                lineHeight: 1.75,
                whiteSpace: "pre-wrap",
                color: "#0a0a0a",
              }}
            >
              {output || "…"}
            </div>
          </div>
        )}

        {stream.phase === "error" && (
          <div
            role="alert"
            style={{
              padding: "20px",
              border: "1px solid #b08be8",
              borderTop: "none",
              fontSize: "13px",
              color: "#b08be8",
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            }}
          >
            ! upstream {stream.status ?? "?"} — {stream.reason || "unknown"}
          </div>
        )}
      </div>
    </section>
  );
}
