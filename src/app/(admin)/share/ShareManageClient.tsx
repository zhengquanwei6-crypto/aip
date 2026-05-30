'use client';

/**
 * v0.17-SHARE S3 · /share 管理页 · 我创建的全部分享链接 + 状态 + 吊销
 */

import { useEffect, useState } from "react";
import { Loader2, Link2, Copy, Ban, Trash2, Eye, Clock, ExternalLink } from "lucide-react";
import { toast } from "@/lib/toast";

interface ShareItem {
  shareId: string;
  assetId: string;
  assetUrl: string;
  watermark: { enabled: boolean };
  maxViews: number | null;
  viewCount: number;
  perViewSeconds: number | null;
  totalSeconds: number | null;
  consumedSeconds: number;
  expiresAt: string | null;
  hasPassword: boolean;
  disableDownload: boolean;
  revoked: boolean;
  status: string;
  createdAt: string;
  lastViewedAt: string | null;
  viewCountLog: number;
}

const STATUS_LABEL: Record<string, string> = {
  ok: "有效",
  revoked: "已撤销",
  max_views: "次数用尽",
  expired: "已过期",
  total_time: "时长用尽",
};
const STATUS_COLOR: Record<string, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  revoked: "text-slate-400",
  max_views: "text-amber-600 dark:text-amber-400",
  expired: "text-red-500",
  total_time: "text-amber-600 dark:text-amber-400",
};

export default function ShareManageClient() {
  const [links, setLinks] = useState<ShareItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    try {
      const j = await fetch("/api/share/manage").then((r) => r.json());
      if (j.ok) setLinks(j.links);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  async function revoke(id: string, revoked: boolean) {
    try {
      await fetch(`/api/share/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revoked }),
      });
      toast.success(revoked ? "已撤销" : "已恢复");
      reload();
    } catch (e) { toast.error((e as Error).message); }
  }
  async function del(id: string) {
    if (!confirm("删除该分享链接？")) return;
    try {
      await fetch(`/api/share/${id}`, { method: "DELETE" });
      toast.success("已删除");
      reload();
    } catch (e) { toast.error((e as Error).message); }
  }
  function copy(id: string) {
    navigator.clipboard.writeText(`${window.location.origin}/s/${id}`);
    toast.success("已复制链接");
  }

  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-4 space-y-4">
      <header className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center gap-2">
          <Link2 size={20} className="text-brand-600 dark:text-brand-400" />
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">🔗 我的分享</h1>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          管理已创建的图片分享链接，查看访问统计，随时撤销。在素材库选图点"分享"创建新链接。
        </p>
      </header>

      {loading && <div className="text-center py-12 text-slate-400"><Loader2 className="animate-spin inline mr-2" />加载中…</div>}

      {!loading && links.length === 0 && (
        <div className="text-center py-16 text-sm text-slate-400">
          还没有分享链接 → 去 <a href="/workspace?tab=assets" className="text-brand-600 hover:underline">素材库</a> 选图创建
        </div>
      )}

      {!loading && links.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {links.map((l) => (
            <div key={l.shareId} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="aspect-video bg-slate-100 dark:bg-slate-950 relative">
                <img src={l.assetUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                <span className={`absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded-full bg-white/90 dark:bg-slate-900/90 ${STATUS_COLOR[l.status]}`}>
                  {STATUS_LABEL[l.status]}
                </span>
              </div>
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-2 text-[10px] text-slate-500 flex-wrap">
                  <span className="inline-flex items-center gap-0.5"><Eye size={10} />{l.viewCount}{l.maxViews !== null ? `/${l.maxViews}` : ""} 次</span>
                  {l.perViewSeconds && <span className="inline-flex items-center gap-0.5"><Clock size={10} />每次 {l.perViewSeconds}s</span>}
                  {l.totalSeconds && <span>总 {l.consumedSeconds}/{l.totalSeconds}s</span>}
                  {l.watermark.enabled && <span>💧水印</span>}
                  {l.hasPassword && <span>🔒密码</span>}
                  {l.disableDownload && <span>🚫下载</span>}
                </div>
                {l.expiresAt && (
                  <div className="text-[10px] text-slate-400">
                    {new Date(l.expiresAt).getTime() > Date.now() ? `${new Date(l.expiresAt).toLocaleString("zh-CN", { hour12: false })} 失效` : "已过期"}
                  </div>
                )}
                <div className="flex items-center gap-1 pt-1">
                  <button onClick={() => copy(l.shareId)} className="text-[11px] inline-flex items-center gap-0.5 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
                    <Copy size={11} /> 复制
                  </button>
                  <a href={`/s/${l.shareId}`} target="_blank" rel="noreferrer" className="text-[11px] inline-flex items-center gap-0.5 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
                    <ExternalLink size={11} /> 预览
                  </a>
                  {!l.revoked ? (
                    <button onClick={() => revoke(l.shareId, true)} className="text-[11px] inline-flex items-center gap-0.5 px-2 py-1 rounded border border-amber-200 dark:border-amber-800 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20">
                      <Ban size={11} /> 撤销
                    </button>
                  ) : (
                    <button onClick={() => revoke(l.shareId, false)} className="text-[11px] px-2 py-1 rounded border border-emerald-200 text-emerald-600">恢复</button>
                  )}
                  <button onClick={() => del(l.shareId)} className="ml-auto text-slate-400 hover:text-red-500">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
