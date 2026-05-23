'use client';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Download,
  Copy,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from '@/lib/toast';

interface LightboxImage {
  url: string;
  alt?: string;
}

interface Props {
  images: LightboxImage[];
  index: number;
  onClose: () => void;
  onIndexChange?: (next: number) => void;
}

/* ── 工具：下载 / 复制 ── */
async function downloadImage(url: string) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    // 从 url 提取文件名
    let name = 'image';
    try {
      const u = new URL(url, window.location.href);
      const last = u.pathname.split('/').filter(Boolean).pop();
      if (last) name = decodeURIComponent(last);
    } catch {
      /* noop */
    }
    if (!/\.[a-z0-9]+$/i.test(name)) name += '.png';
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 2000);
    toast.success('图片已开始下载');
  } catch (e) {
    // fetch 失败时降级为直接 a[href] 触发
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = '';
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.info('已尝试在新标签下载');
    } catch {
      toast.error('下载失败：' + (e instanceof Error ? e.message : '未知错误'));
    }
  }
}

async function copyUrl(url: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast.success('已复制 URL');
  } catch {
    toast.error('复制失败');
  }
}

export default function ImageLightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const total = images.length;
  const safeIndex = Math.max(0, Math.min(total - 1, index));
  const current = images[safeIndex];

  const goPrev = useCallback(() => {
    if (safeIndex <= 0) return;
    onIndexChange?.(safeIndex - 1);
  }, [safeIndex, onIndexChange]);

  const goNext = useCallback(() => {
    if (safeIndex >= total - 1) return;
    onIndexChange?.(safeIndex + 1);
  }, [safeIndex, total, onIndexChange]);

  const onDownload = useCallback(() => {
    if (current?.url) downloadImage(current.url);
  }, [current]);

  const onCopy = useCallback(() => {
    if (current?.url) copyUrl(current.url);
  }, [current]);

  // 键盘
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        onDownload();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        onCopy();
        return;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, goPrev, goNext, onDownload, onCopy]);

  // body 滚动锁定
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!mounted || typeof document === 'undefined') return null;
  if (!current) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] bg-black/90 backdrop-blur-sm flex items-center justify-center animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
    >
      {/* 顶部信息条 */}
      <div
        className="absolute top-0 left-0 right-0 px-4 py-3 flex items-center justify-between text-white text-sm pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2.5 py-1 rounded-full bg-white/10 text-xs tabular-nums">
          {safeIndex + 1} / {total}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onDownload}
            title="下载（Ctrl/Cmd+S）"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-white/10 hover:bg-white/20 transition-colors"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">下载</span>
          </button>
          <button
            type="button"
            onClick={onCopy}
            title="复制 URL（Ctrl/Cmd+L）"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-white/10 hover:bg-white/20 transition-colors"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">复制 URL</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            title="关闭（Esc）"
            aria-label="关闭"
            className="inline-flex items-center justify-center w-8 h-8 rounded bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 左右切换 */}
      {total > 1 && safeIndex > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          aria-label="上一张"
          className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
      {total > 1 && safeIndex < total - 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          aria-label="下一张"
          className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      )}

      {/* 中央图片 */}
      <img
        src={current.url}
        alt={current.alt ?? ''}
        className="max-h-[90vh] max-w-[90vw] object-contain select-none"
        style={{ touchAction: 'pinch-zoom' }}
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
    </div>,
    document.body,
  );
}
