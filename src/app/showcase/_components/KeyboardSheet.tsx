"use client";

import { useEffect, useState } from "react";

/**
 * showcase v4 · KeyboardSheet
 *
 * `?` 触发的快捷键面板。固定列出当前页所有 active 快捷键，4-6 行小表，
 * 不动画、不阻塞系统级组合（cmd/ctrl + L/F/R/W/T/N）。
 *
 * 实现：
 *   - document keydown 监听 `?` (Shift+/)：打开/关闭。Esc 关闭。
 *   - 系统组合（含 metaKey 或 ctrlKey）一律放行，绝不 preventDefault。
 *   - 焦点在 input/textarea/contenteditable 时不响应 `?`，避免抢输入。
 *
 * Validates: Requirements 9.2, 9.5
 */

const SHORTCUTS: ReadonlyArray<{ key: string; desc: string }> = [
  { key: "?", desc: "打开 / 关闭这张快捷键面板" },
  { key: "/", desc: "聚焦跳转输入框：agent slug / 段号 / commit sha 前缀" },
  { key: "g 1-5", desc: "跳到第 N 段（先按 g，再按数字 1-5）" },
  { key: "1 / 2 / 3 / 4", desc: "把对应 preset 写入 LiveDemo 输入框" },
  { key: "r", desc: "焦点在 demo 输入框时，重跑当前 prompt" },
  { key: "Esc", desc: "关闭面板 / 取消跳转" },
];

function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  return false;
}

export default function KeyboardSheet() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // never consume system shortcuts (Req 9.5 / Property 9)
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape" && open) {
        setOpen(false);
        return;
      }
      if (e.key === "?") {
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="kbd-sheet-heading"
      style={{
        position: "fixed",
        right: "24px",
        bottom: "24px",
        zIndex: 60,
        background: "#faf7f2",
        color: "#0a0a0a",
        border: "1px solid #0a0a0a",
        padding: "12px 16px",
        maxWidth: "min(360px, calc(100vw - 32px))",
        fontSize: "12.5px",
        lineHeight: 1.6,
        boxShadow: "4px 4px 0 0 rgba(10,10,10,0.12)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "8px",
        }}
      >
        <h3
          id="kbd-sheet-heading"
          style={{
            fontSize: "13px",
            fontWeight: 500,
            margin: 0,
          }}
        >
          快捷键
        </h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="关闭快捷键面板"
          style={{
            fontFamily: "inherit",
            fontSize: "12px",
            border: "none",
            background: "transparent",
            color: "#0a0a0a",
            cursor: "pointer",
            opacity: 0.6,
            padding: 0,
          }}
        >
          esc
        </button>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.key}>
              <td
                className="font-mono"
                style={{
                  padding: "3px 8px 3px 0",
                  whiteSpace: "nowrap",
                  verticalAlign: "top",
                  width: "1%",
                }}
              >
                {s.key}
              </td>
              <td style={{ padding: "3px 0", verticalAlign: "top" }}>
                {s.desc}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
