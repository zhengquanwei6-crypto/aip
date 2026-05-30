'use client';

/**
 * v0.17-SHARE S2 · /s/[shareId] 公开访问页 (无需登录, 不在 admin layout)
 *
 * 流程: 注册访问(校验密码/判失效) → 渲染图 → perViewSeconds 倒计时 →
 *        每 5s heartbeat 累加 totalSeconds → 任一失效则遮罩。
 */

import { useState, useEffect, useRef, useCallback } from "react";

interface Settings {
  watermark: { enabled: boolean; text: string; position: string; opacity: number };
  perViewSeconds: number | null;
  totalSeconds: number | null;
  consumedSeconds: number;
  disableDownload: boolean;
  remainingViews: number | null;
  willExpireAfter: boolean;
}

export default function ShareViewClient({ shareId }: { shareId: string }) {
  const [phase, setPhase] = useState<"loading" | "password" | "viewing" | "expired" | "error">("loading");
  const [reason, setReason] = useState<string>("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [password, setPassword] = useState("");
  const [perViewLeft, setPerViewLeft] = useState<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const perViewRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const register = useCallback(async (pw?: string) => {
    setPhase("loading");
    try {
      const r = await fetch(`/api/share/${shareId}/view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const j = await r.json();
      if (r.status === 401 && j.needPassword) {
        setPhase("password");
        return;
      }
      if (!j.ok) {
        setReason(j.error || "无法访问");
        setPhase("error");
        return;
      }
      if (j.expired) {
        setReason(j.message || "链接已失效");
        setPhase("expired");
        return;
      }
      setSettings(j.settings);
      setPhase("viewing");
      if (j.settings.perViewSeconds) setPerViewLeft(j.settings.perViewSeconds);
    } catch (e) {
      setReason((e as Error).message);
      setPhase("error");
    }
  }, [shareId]);

  useEffect(() => { register(); }, [register]);

  // 总时长 heartbeat (每 5s)
  useEffect(() => {
    if (phase !== "viewing" || !settings) return;
    if (settings.totalSeconds === null) return;
    tickRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/share/${shareId}/tick`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seconds: 5 }),
        });
        const j = await r.json();
        if (j.expired) {
          setReason("总浏览时长已用尽");
          setPhase("expired");
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [phase, settings, shareId]);

  // 每次浏览倒计时
  useEffect(() => {
    if (phase !== "viewing" || perViewLeft === null) return;
    if (perViewLeft <= 0) {
      setReason("本次浏览时间已结束（刷新可重新计时，但会消耗一次浏览次数）");
      setPhase("expired");
      return;
    }
    perViewRef.current = setInterval(() => {
      setPerViewLeft((v) => (v === null ? null : v - 1));
    }, 1000);
    return () => { if (perViewRef.current) clearInterval(perViewRef.current); };
  }, [phase, perViewLeft]);

  // 禁止下载: 阻止右键 + 拖拽
  useEffect(() => {
    if (!settings?.disableDownload) return;
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener("contextmenu", prevent);
    document.addEventListener("dragstart", prevent);
    return () => {
      document.removeEventListener("contextmenu", prevent);
      document.removeEventListener("dragstart", prevent);
    };
  }, [settings]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
      {phase === "loading" && <div className="text-slate-400">加载中…</div>}

      {phase === "password" && (
        <div className="w-full max-w-sm bg-slate-900 rounded-2xl p-6 border border-slate-800">
          <h1 className="text-lg font-semibold mb-1">🔒 受保护的分享</h1>
          <p className="text-xs text-slate-400 mb-4">请输入访问密码</p>
          <input
            type="password"
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 mb-3 outline-none focus:border-purple-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") register(password); }}
            placeholder="密码"
            autoFocus
          />
          <button
            onClick={() => register(password)}
            className="w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-500 transition-colors text-sm font-medium"
          >
            进入
          </button>
        </div>
      )}

      {(phase === "expired" || phase === "error") && (
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">{phase === "expired" ? "⏳" : "⚠️"}</div>
          <h1 className="text-xl font-semibold mb-2">
            {phase === "expired" ? "链接已失效" : "无法访问"}
          </h1>
          <p className="text-sm text-slate-400">{reason}</p>
          <p className="text-xs text-slate-600 mt-6">果冻的AI · GUODONG</p>
        </div>
      )}

      {phase === "viewing" && settings && (
        <div className="w-full max-w-3xl">
          {/* 顶部状态条 */}
          <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
            <span>果冻的AI · 专属分享</span>
            <div className="flex gap-3">
              {settings.remainingViews !== null && (
                <span>剩余 {settings.remainingViews} 次</span>
              )}
              {perViewLeft !== null && (
                <span className="text-amber-400">本次 {perViewLeft}s</span>
              )}
            </div>
          </div>

          {/* 图片 */}
          <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/share/${shareId}/image`}
              alt="分享图片"
              className="w-full select-none"
              draggable={false}
              style={settings.disableDownload ? { pointerEvents: "none" as const } : undefined}
            />
          </div>

          <p className="text-center text-xs text-slate-600 mt-4">
            {settings.disableDownload ? "该图片受保护，禁止下载" : "由果冻的AI生成与分享"}
          </p>
        </div>
      )}
    </div>
  );
}
