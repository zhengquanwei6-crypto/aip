'use client';

/**
 * v0.16-H1.3 · /style-genome
 *
 * 功能:
 *   - 选 ≥3 张作品 → 一键计算风格基因
 *   - 当前风格画像可视化 (色板 + 玫瑰图 + 留白率)
 *   - 历史演化曲线 (过去 6 次重算的色板对比)
 *   - 月度自动重算说明 + 手动触发按钮
 */

import { useState } from 'react';
import { Loader2, Sparkles, RefreshCw, Check, X } from 'lucide-react';
import { toast } from '@/lib/toast';

interface AssetRow {
  id: string;
  url: string;
  prompt: string | null;
  type: string;
  platform: string | null;
  createdAt: string;
}

interface Genome {
  primaryPalette: string[];
  secondaryPalette: string[];
  compositionBias: Record<string, number>;
  whitespaceRatio: number;
  saturationProfile: string;
  warmthBias: string;
  sampleCount: number;
  computedAt: string;
}

interface HistoryItem {
  key: string;
  computedAt: string;
  genome: Genome;
}

interface Props {
  assets: AssetRow[];
  initialGenome: Genome | null;
  initialHistory: HistoryItem[];
}

export default function StyleGenomeClient({ assets, initialGenome, initialHistory }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [genome, setGenome] = useState<Genome | null>(initialGenome);
  const [history, setHistory] = useState(initialHistory);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function compute() {
    if (selected.size < 3) {
      toast.error('至少选 3 张图');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/style-genome/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetIds: Array.from(selected), save: true }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || '失败');
      setGenome(j.genome);
      // 重新拉历史
      const hr = await fetch('/api/style-genome/current').then((x) => x.json());
      toast.success(`基因已生成 (${j.genome.sampleCount} 张样本)`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function recompute() {
    if (!confirm('重新计算会从过去 30 天的 like + fav 标记数据中提取，确认？')) return;
    setBusy(true);
    try {
      const r = await fetch('/api/style-genome/recompute', { method: 'POST' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || '失败');
      setGenome(j.genome);
      toast.success(`已重算 (来源: liked=${j.sources.liked}, fav=${j.sources.fav})`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-3 sm:p-4 space-y-4">
      <header className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={20} className="text-brand-600 dark:text-brand-400" />
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            🧬 风格基因 · Style Genome
          </h1>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          算出"你是谁"的视觉风格 (色板 + 构图 + 留白 + 饱和)，自动注入到生图调用让 AI 更懂你。
        </p>
      </header>

      {/* 当前基因 */}
      {genome ? (
        <GenomeCard genome={genome} />
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-700 dark:text-amber-300">
          还没有生成风格基因 → 在下方选 ≥3 张你最满意的作品，点"计算基因"
        </div>
      )}

      {/* 演化曲线 */}
      {history.length > 1 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-semibold mb-3 text-slate-800 dark:text-slate-100">📈 演化曲线 (最近 {history.length} 次)</h3>
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.key} className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 font-mono w-32 shrink-0">
                  {new Date(h.computedAt).toLocaleDateString('zh-CN')}
                </span>
                <div className="flex gap-1">
                  {h.genome.primaryPalette.map((c, i) => (
                    <div
                      key={i}
                      className="w-6 h-6 rounded border border-slate-200 dark:border-slate-700"
                      style={{ background: c }}
                      title={c}
                    />
                  ))}
                </div>
                <span className="text-slate-500 ml-2">
                  {h.genome.saturationProfile} · {h.genome.warmthBias}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 选图区 */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            选作品（已选 <span className="text-brand-600 font-mono">{selected.size}</span>，至少 3 张）
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setSelected(new Set())}
              disabled={selected.size === 0 || busy}
              className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            >清空</button>
            <button
              onClick={compute}
              disabled={selected.size < 3 || busy}
              className="btn-primary text-xs inline-flex items-center gap-1"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              计算基因
            </button>
            <button
              onClick={recompute}
              disabled={busy}
              className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 inline-flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-800"
              title="从过去 30 天 like + fav 标记自动重算"
            >
              <RefreshCw size={12} />
              月度重算
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {assets.length === 0 && (
            <div className="col-span-full text-xs text-slate-400 text-center py-8">
              没有可选作品 (Asset 表空)
            </div>
          )}
          {assets.map((a) => {
            const checked = selected.has(a.id);
            return (
              <button
                key={a.id}
                onClick={() => toggle(a.id)}
                disabled={busy}
                className={`relative aspect-square rounded border-2 overflow-hidden transition-all ${
                  checked
                    ? 'border-brand-500 ring-2 ring-brand-200 dark:ring-brand-900'
                    : 'border-slate-200 dark:border-slate-700 hover:border-brand-300'
                }`}
              >
                <img src={a.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                {checked && (
                  <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center">
                    <Check size={12} className="text-white" />
                  </div>
                )}
                {a.platform && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1 py-0.5 truncate">
                    {a.platform}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GenomeCard({ genome }: { genome: Genome }) {
  const compEntries = Object.entries(genome.compositionBias).sort((a, b) => b[1] - a[1]);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          🧬 当前风格画像
        </h3>
        <span className="text-[10px] text-slate-400 font-mono">
          {genome.sampleCount} 张样本 · {new Date(genome.computedAt).toLocaleString('zh-CN', { hour12: false })}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 色板 */}
        <div>
          <h4 className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">主色板</h4>
          <div className="flex gap-1 mb-3">
            {genome.primaryPalette.map((c, i) => (
              <div key={i} className="flex-1">
                <div
                  className="aspect-square rounded border border-slate-200 dark:border-slate-700"
                  style={{ background: c }}
                />
                <div className="text-[10px] text-center font-mono text-slate-500 mt-1">{c}</div>
              </div>
            ))}
          </div>
          <h4 className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2 mt-3">副色板</h4>
          <div className="flex gap-1">
            {genome.secondaryPalette.map((c, i) => (
              <div key={i} className="flex-1">
                <div
                  className="aspect-square rounded border border-slate-200 dark:border-slate-700"
                  style={{ background: c }}
                />
                <div className="text-[10px] text-center font-mono text-slate-500 mt-1">{c}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 属性 */}
        <div className="space-y-3">
          <Stat label="饱和度档位" value={genome.saturationProfile} />
          <Stat label="冷暖倾向" value={genome.warmthBias} />
          <Stat label="留白率" value={`${(genome.whitespaceRatio * 100).toFixed(1)}%`} />
          <div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-1.5">构图分布</div>
            {compEntries.map(([type, p]) => (
              <div key={type} className="flex items-center gap-2 mb-1">
                <span className="w-14 text-xs text-slate-700 dark:text-slate-300">{type}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-brand-400 to-brand-600"
                    style={{ width: `${(p * 100).toFixed(1)}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-slate-500 w-10 text-right">
                  {(p * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
        ✨ 此基因已自动注入到 publish-director / prompt-gen 的 LLM prompt 末尾，作为软提示引导 AI 出图风格。
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
      <span className="text-xs text-slate-600 dark:text-slate-400">{label}</span>
      <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{value}</span>
    </div>
  );
}
