'use client';

/**
 * v0.17-SHARE S3 · 创建分享 modal
 * 任意图详情/素材库可挂这个组件, 传 assetId 弹出配置。
 */

import { useState } from "react";
import { X, Loader2, Copy, Check } from "lucide-react";
import { toast } from "@/lib/toast";

interface Props {
  assetId: string;
  assetUrl?: string;
  onClose: () => void;
}

type ViewMode = "once" | "unlimited" | "custom";

export default function ShareCreateModal({ assetId, assetUrl, onClose }: Props) {
  const [wmEnabled, setWmEnabled] = useState(false);
  const [wmText, setWmText] = useState("果冻的AI");
  const [wmPos, setWmPos] = useState("br");
  const [wmOpacity, setWmOpacity] = useState(0.5);

  const [viewMode, setViewMode] = useState<ViewMode>("unlimited");
  const [customViews, setCustomViews] = useState(5);

  const [perViewSeconds, setPerViewSeconds] = useState<number>(0); // 0 = 不限
  const [totalSeconds, setTotalSeconds] = useState<number>(0);     // 0 = 不限
  const [expiresInHours, setExpiresInHours] = useState<number>(0); // 0 = 不限
  const [password, setPassword] = useState("");
  const [disableDownload, setDisableDownload] = useState(false);

  const [busy, setBusy] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const maxViews = viewMode === "once" ? 1 : viewMode === "custom" ? customViews : null;
      const r = await fetch("/api/share/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId,
          watermark: { enabled: wmEnabled, text: wmText, position: wmPos, opacity: wmOpacity },
          maxViews,
          perViewSeconds: perViewSeconds || null,
          totalSeconds: totalSeconds || null,
          expiresInHours: expiresInHours || null,
          password: password || null,
          disableDownload,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      const fullUrl = `${window.location.origin}${j.shareUrl}`;
      setCreatedUrl(fullUrl);
      toast.success("分享链接已生成");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!createdUrl) return;
    try {
      await navigator.clipboard.writeText(createdUrl);
      setCopied(true);
      toast.success("已复制");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败");
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-base font-semibold">🔗 创建分享链接</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        {createdUrl ? (
          <div className="p-4 space-y-3">
            {assetUrl && <img src={assetUrl} alt="" className="w-full rounded-lg max-h-48 object-contain bg-slate-50 dark:bg-slate-950" />}
            <div className="text-sm text-emerald-600 dark:text-emerald-400">✓ 分享链接已生成</div>
            <div className="flex gap-2">
              <input readOnly value={createdUrl} className="input flex-1 text-xs font-mono" />
              <button onClick={copyLink} className="btn-primary text-xs inline-flex items-center gap-1">
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? "已复制" : "复制"}
              </button>
            </div>
            <a href={createdUrl} target="_blank" rel="noreferrer" className="block text-center text-xs text-brand-600 dark:text-brand-400 hover:underline">
              在新标签预览 →
            </a>
            <button onClick={onClose} className="w-full py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm">完成</button>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {assetUrl && <img src={assetUrl} alt="" className="w-full rounded-lg max-h-40 object-contain bg-slate-50 dark:bg-slate-950" />}

            {/* 浏览次数 */}
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">可浏览次数</label>
              <div className="mt-1 grid grid-cols-3 gap-1.5">
                {([["once","一次性"],["unlimited","永久"],["custom","自定义"]] as [ViewMode,string][]).map(([v, label]) => (
                  <button key={v} onClick={() => setViewMode(v)} className={`px-2 py-1.5 rounded-lg border text-xs ${viewMode === v ? "border-brand-400 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300" : "border-slate-200 dark:border-slate-700"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {viewMode === "custom" && (
                <input type="number" min={1} className="input mt-2 w-full text-sm" value={customViews} onChange={(e) => setCustomViews(Math.max(1, Number(e.target.value)))} placeholder="次数" />
              )}
            </div>

            {/* 时长控制 */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400">每次可看(秒, 0=不限)</label>
                <input type="number" min={0} className="input mt-1 w-full text-sm" value={perViewSeconds} onChange={(e) => setPerViewSeconds(Math.max(0, Number(e.target.value)))} />
              </div>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400">总时长(秒, 0=不限)</label>
                <input type="number" min={0} className="input mt-1 w-full text-sm" value={totalSeconds} onChange={(e) => setTotalSeconds(Math.max(0, Number(e.target.value)))} />
              </div>
            </div>

            {/* 绝对过期 */}
            <div>
              <label className="text-xs text-slate-600 dark:text-slate-400">多少小时后失效(0=不限)</label>
              <input type="number" min={0} className="input mt-1 w-full text-sm" value={expiresInHours} onChange={(e) => setExpiresInHours(Math.max(0, Number(e.target.value)))} />
            </div>

            {/* 水印 */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={wmEnabled} onChange={(e) => setWmEnabled(e.target.checked)} className="rounded" />
                添加水印
              </label>
              {wmEnabled && (
                <div className="mt-2 space-y-2 pl-1">
                  <input className="input w-full text-sm" value={wmText} onChange={(e) => setWmText(e.target.value)} placeholder="水印文字" />
                  <div className="grid grid-cols-2 gap-2">
                    <select className="input text-sm" value={wmPos} onChange={(e) => setWmPos(e.target.value)}>
                      <option value="br">右下</option><option value="bl">左下</option>
                      <option value="tr">右上</option><option value="tl">左上</option>
                      <option value="center">居中</option>
                    </select>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">透明度</span>
                      <input type="range" min={0.1} max={1} step={0.1} value={wmOpacity} onChange={(e) => setWmOpacity(Number(e.target.value))} className="flex-1" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 其它 */}
            <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400">访问密码(可空)</label>
                <input type="text" className="input mt-1 w-full text-sm" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="留空 = 无密码" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={disableDownload} onChange={(e) => setDisableDownload(e.target.checked)} className="rounded" />
                禁止下载(禁右键/拖拽)
              </label>
            </div>

            <button onClick={create} disabled={busy} className="btn-primary w-full inline-flex items-center justify-center gap-1">
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              生成分享链接
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
