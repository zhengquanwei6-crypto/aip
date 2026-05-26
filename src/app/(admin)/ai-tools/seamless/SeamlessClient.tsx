// v0.13 mobile m7: seamless responsive verify
// v0.13 mobile m5: tap-target-sm injected
'use client';

/**
 * v0.13 B4 · AI 无缝纹理工具 UI
 *
 * 流程：
 *   1) 上传源图（多文件支持，但本页一次只处理一张以便实时预览）
 *   2) 调 /api/ai-tools/seamless · POST file + featherPercent
 *   3) 返回 originalAsset + seamlessAsset 两条 url
 *   4) 渲染两个 2×2 平铺预览（CSS background-repeat: repeat）
 *   5) 提供下载按钮 + 复制 /i/<id> 短链
 */

import { useState } from 'react';
import {
  Upload,
  Wand2,
  Loader2,
  Copy,
  Check,
  Download,
  ArrowRight,
  AlertCircle,
  Sliders,
} from 'lucide-react';
import clsx from 'clsx';

interface AssetEcho {
  id: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
  featherPx?: number;
  featherPercent?: number;
}

export default function SeamlessClient() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [feather, setFeather] = useState(5);
  const [original, setOriginal] = useState<AssetEcho | null>(null);
  const [seamless, setSeamless] = useState<AssetEcho | null>(null);
  const [previewSize, setPreviewSize] = useState(180); // 单格预览 px
  const [copied, setCopied] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');

  // get window.origin once
  if (typeof window !== 'undefined' && origin === '') {
    setOrigin(window.location.origin);
  }

  async function processFile(file: File) {
    setBusy(true);
    setErr(null);
    setSeamless(null);
    setOriginal(null);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('featherPercent', String(feather));

    try {
      const r = await fetch('/api/ai-tools/seamless', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setErr('处理失败：' + (j.error || `HTTP ${r.status}`));
      } else {
        setOriginal(j.original);
        setSeamless(j.seamless);
      }
    } catch (e) {
      setErr('网络错误：' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reprocessWithFeather() {
    if (!original) return;
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.append('sourceAssetId', original.id);
    fd.append('featherPercent', String(feather));
    try {
      const r = await fetch('/api/ai-tools/seamless', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setErr('重新处理失败：' + (j.error || `HTTP ${r.status}`));
      } else {
        setSeamless(j.seamless);
      }
    } catch (e) {
      setErr('网络错误：' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch (e) {
      setErr('复制失败：' + (e as Error).message);
    }
  }

  function shortLink(id: string): string {
    if (!origin) return `/i/${id}`;
    return `${origin}/i/${id}`;
  }

  return (
    <div className="space-y-4 px-4 sm:px-6 py-3 sm:py-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-2">
        <Wand2 size={20} className="text-brand-600 dark:text-brand-400" aria-hidden="true" />
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-50">
          AI 无缝纹理
        </h1>
        <span className="text-xs text-slate-400 dark:text-slate-500 ml-2">
          瓷砖 / 布料 / 大理石等纹理图 → 四周无缝可平铺
        </span>
      </div>

      {/* 上传 + 参数区 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-5 text-center">
          <Upload
            size={26}
            className="mx-auto mb-2 text-slate-400"
            aria-hidden="true"
          />
          <p className="text-sm text-slate-700 dark:text-slate-200 mb-1">
            上传一张图片 · 支持 PNG / JPG / WebP / GIF
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            建议尺寸 ≥ 512×512 · 体积无上限（仅受 VPS 磁盘约束）
          </p>
          <label
            data-v013-b4-seamless-upload
            className={clsx(
              'inline-flex items-center gap-2 px-4 py-2 rounded-md text-white text-sm font-medium cursor-pointer transition-colors',
              busy
                ? 'bg-slate-400'
                : 'bg-brand-600 hover:bg-brand-700',
            )}
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <Upload size={14} aria-hidden="true" />
            )}
            {busy ? '处理中…' : '选择图片'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void processFile(f);
                e.currentTarget.value = '';
              }}
            />
          </label>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
          <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300 font-medium">
            <Sliders size={12} aria-hidden="true" />
            羽化强度（{feather}%）
          </label>
          <input
            type="range"
            min={0}
            max={20}
            step={0.5}
            value={feather}
            onChange={(e) => setFeather(Number(e.target.value))}
            disabled={busy}
            className="w-full"
          />
          <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
            数值小 = 中心改动少，但接缝可能可见；
            数值大 = 接缝过渡柔，但中心被改动多。
            <strong>规则纹理（瓷砖/布料）建议 3-8%</strong>。
          </p>
          {original && (
            <button
              type="button"
              onClick={() => void reprocessWithFeather()}
              disabled={busy}
              className="w-full tap-target-sm inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-50 transition-colors"
            >
              {busy ? (
                <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              ) : (
                <Wand2 size={12} aria-hidden="true" />
              )}
              用此羽化值重新处理
            </button>
          )}
        </div>
      </div>

      {/* 错误 */}
      {err && (
        <div className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 p-2 text-xs text-red-800 dark:text-red-100 flex items-start gap-2">
          <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span className="break-all">{err}</span>
        </div>
      )}

      {/* 预览对比 */}
      {original && seamless && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              对比预览（2×2 平铺）
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>预览单格</span>
              <input
                type="range"
                min={120}
                max={320}
                step={20}
                value={previewSize}
                onChange={(e) => setPreviewSize(Number(e.target.value))}
                className="w-24"
              />
              <span>{previewSize}px</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* 原图平铺（接缝可见） */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                <span>原图（无处理 · 平铺接缝可见）</span>
                <span className="text-[10px] text-slate-400">
                  {original.width}×{original.height}
                </span>
              </div>
              <div
                data-v013-b4-preview-original
                style={{
                  backgroundImage: `url("${original.url}")`,
                  backgroundRepeat: 'repeat',
                  backgroundSize: `${previewSize}px ${previewSize}px`,
                  height: previewSize * 2,
                }}
                className="rounded border border-slate-200 dark:border-slate-800"
              />
              <ToolRow
                kind="原图"
                url={original.url}
                shortLinkValue={shortLink(original.id)}
                onCopy={() => void copy(shortLink(original.id), 'orig')}
                copied={copied === 'orig'}
              />
            </div>

            {/* 无缝结果平铺 */}
            <div className="rounded-lg border-2 border-brand-300 dark:border-brand-700 bg-white dark:bg-slate-900 p-3 ring-1 ring-brand-100 dark:ring-brand-900/40">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                <span>
                  <span className="text-brand-600 dark:text-brand-400">无缝结果</span>
                  · 羽化 {seamless.featherPercent ?? feather}% / {seamless.featherPx}px
                </span>
                <span className="text-[10px] text-slate-400">
                  {seamless.width}×{seamless.height}
                </span>
              </div>
              <div
                data-v013-b4-preview-seamless
                style={{
                  backgroundImage: `url("${seamless.url}")`,
                  backgroundRepeat: 'repeat',
                  backgroundSize: `${previewSize}px ${previewSize}px`,
                  height: previewSize * 2,
                }}
                className="rounded border border-slate-200 dark:border-slate-800"
              />
              <ToolRow
                kind="无缝"
                url={seamless.url}
                shortLinkValue={shortLink(seamless.id)}
                onCopy={() => void copy(shortLink(seamless.id), 'seam')}
                copied={copied === 'seam'}
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed text-center">
            提示：左侧每个色块衔接处能看到明显接缝；右侧应该看不到边界 →
            如果右侧仍可见接缝，把上方"羽化强度"调大一点（建议 5-10%）后点「用此羽化值重新处理」。
          </p>
        </div>
      )}
    </div>
  );
}

function ToolRow(props: {
  kind: string;
  url: string;
  shortLinkValue: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <input
        readOnly
        value={props.shortLinkValue}
        onFocus={(e) => e.currentTarget.select()}
        className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-[10px] font-mono text-slate-700 dark:text-slate-300"
      />
      <button
        type="button"
        onClick={props.onCopy}
        className="tap-target-sm inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 p-1.5 text-slate-600 dark:text-slate-300 transition-colors"
        title="复制短链"
      >
        {props.copied ? (
          <Check size={12} className="text-emerald-600" aria-hidden="true" />
        ) : (
          <Copy size={12} aria-hidden="true" />
        )}
      </button>
      <a
        href={props.url}
        download
        className="tap-target-sm inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 p-1.5 text-slate-600 dark:text-slate-300 transition-colors"
        title="下载"
      >
        <Download size={12} aria-hidden="true" />
      </a>
    </div>
  );
}
