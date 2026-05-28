/**
 * v0.15 · ImageEditTool · 4 个 AI 工具的统一客户端组件
 *
 * 通用流程：
 *   1. 上传图片（或粘贴 URL）→ 拿到 dataURL
 *   2. 可选：填写一段补充指令（如"把背景换成米白"/"放大 2 倍" 等）
 *   3. 调用 /api/ai-tools/<slug> 走 i2i 走通用 image-runner
 *   4. 显示结果 + 下载
 */
'use client';

import { useState, useRef } from 'react';
import { Loader2, Upload, Download, X, Wand2 } from 'lucide-react';
import { toast } from '@/lib/toast';

export interface ImageEditToolProps {
  slug: 'upscale' | 'erase' | 'recolor' | 'retouch';
  title: string;
  description: string;
  promptHint: string;
  promptPlaceholder: string;
  /** 是否需要可选的指令输入（erase/recolor 必填） */
  requireInstruction?: boolean;
}

export default function ImageEditTool({
  slug,
  title,
  description,
  promptHint,
  promptPlaceholder,
  requireInstruction,
}: ImageEditToolProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sourceDataUrl, setSourceDataUrl] = useState<string>('');
  const [sourceFileName, setSourceFileName] = useState<string>('');
  const [instruction, setInstruction] = useState<string>('');
  // v0.14-z48: size + quality 选择
  const [size, setSize] = useState<string>('1024x1024');
  const [quality, setQuality] = useState<string>('high');
  const [loading, setLoading] = useState<boolean>(false);
  const [resultUrl, setResultUrl] = useState<string>('');
  const [error, setError] = useState<string>('');

  function pickFile() {
    fileInputRef.current?.click();
  }

  async function handleFile(file: File) {
    if (file.size > 20 * 1024 * 1024) {
      toast.error('图片需小于 20MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSourceDataUrl(String(reader.result));
      setSourceFileName(file.name);
      setResultUrl('');
      setError('');
    };
    reader.readAsDataURL(file);
  }

  async function run() {
    if (!sourceDataUrl) {
      toast.error('请先上传图片');
      return;
    }
    if (requireInstruction && !instruction.trim()) {
      toast.error('请填写指令');
      return;
    }
    setLoading(true);
    setError('');
    setResultUrl('');
    try {
      const res = await fetch(`/api/ai-tools/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceDataUrl,
          instruction: instruction.trim(),
          size,
          quality,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setResultUrl(j.url);
      toast.success('生成完成');
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setSourceDataUrl('');
    setSourceFileName('');
    setInstruction('');
    setSize('1024x1024');
    setQuality('high');
    setResultUrl('');
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <header className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <h1 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-2">
          <Wand2 size={16} className="text-brand-600" aria-hidden="true" />
          {title}
        </h1>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 输入区 */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-400 font-mono">
            input
          </div>
          {sourceDataUrl ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sourceDataUrl}
                alt="原图"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700"
              />
              <button
                type="button"
                onClick={reset}
                className="absolute top-2 right-2 inline-flex items-center justify-center w-7 h-7 rounded-full bg-black/60 text-white hover:bg-black/80"
                aria-label="清除"
              >
                <X size={14} aria-hidden="true" />
              </button>
              <div className="mt-1 text-[11px] text-slate-500 truncate">
                {sourceFileName}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={pickFile}
              className="w-full aspect-[4/3] rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-brand-400 hover:bg-brand-50/40 dark:hover:bg-brand-900/10 flex flex-col items-center justify-center gap-2 text-slate-500"
            >
              <Upload size={24} aria-hidden="true" />
              <span className="text-sm">点击上传或拖拽图片</span>
              <span className="text-[11px] text-slate-400">支持 JPG / PNG / WebP，≤ 20MB</span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />

          <div>
            <label className="block text-[11px] uppercase tracking-wide text-slate-400 font-mono mb-1">
              指令 {requireInstruction ? <span className="text-red-500">*</span> : '(可选)'}
            </label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={promptPlaceholder}
              rows={3}
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent text-sm px-2.5 py-1.5"
            />
            <p className="mt-1 text-[11px] text-slate-400">{promptHint}</p>
          </div>

          {/* v0.14-z48: 分辨率 + 质量 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-slate-400 font-mono mb-1">
                分辨率
              </label>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent text-sm px-2.5 py-1.5"
              >
                <option value="1024x1024">1024×1024 · 方</option>
                <option value="1024x1536">1024×1536 · 竖</option>
                <option value="1536x1024">1536×1024 · 横</option>
                <option value="2048x2048">2048×2048 · 高清方</option>
                <option value="2048x3072">2048×3072 · 高清竖</option>
                <option value="3072x2048">3072×2048 · 高清横</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-slate-400 font-mono mb-1">
                质量
              </label>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent text-sm px-2.5 py-1.5"
              >
                <option value="low">低 · 快</option>
                <option value="medium">中</option>
                <option value="high">高</option>
                <option value="auto">auto · 模型自选</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={run}
            disabled={loading || !sourceDataUrl}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 px-4 py-2 text-sm text-white font-medium"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                处理中…通常 30-60 秒
              </>
            ) : (
              <>
                <Wand2 size={14} aria-hidden="true" />
                开始处理
              </>
            )}
          </button>
        </div>

        {/* 输出区 */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-400 font-mono">
            output
          </div>
          {resultUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resultUrl}
                alt="结果"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700"
              />
              <a
                href={resultUrl}
                download={`${slug}-${Date.now()}.png`}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 px-3 py-1.5 text-xs"
              >
                <Download size={12} aria-hidden="true" />
                下载结果
              </a>
            </>
          ) : (
            <div className="aspect-[4/3] rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-slate-400 text-sm">
              {loading ? (
                <Loader2 size={24} className="animate-spin" aria-hidden="true" />
              ) : (
                <span>结果会在这里展示</span>
              )}
            </div>
          )}
          {error && (
            <div className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-2">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
