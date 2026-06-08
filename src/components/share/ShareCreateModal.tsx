'use client';

import { useRef, useState } from 'react';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import { Check, Copy, ExternalLink, Loader2, LockKeyhole, Move, ShieldCheck, X } from 'lucide-react';

import { toast } from '@/lib/toast';

interface Props {
  assetId: string;
  assetUrl?: string;
  onClose: () => void;
}

type ViewMode = 'once' | 'unlimited' | 'custom';
type WatermarkMode = 'tiled' | 'corner';

export default function ShareCreateModal({ assetId, assetUrl, onClose }: Props) {
  const [wmEnabled, setWmEnabled] = useState(true);
  const [wmMode, setWmMode] = useState<WatermarkMode>('tiled');
  const [wmText, setWmText] = useState('AIP 预览样稿');
  const [wmPos, setWmPos] = useState('br');
  const [wmOpacity, setWmOpacity] = useState(0.22);
  const [clientLabel, setClientLabel] = useState('');
  const [useCustomPos, setUseCustomPos] = useState(false);
  const [offsetXPct, setOffsetXPct] = useState(0.5);
  const [offsetYPct, setOffsetYPct] = useState(0.5);
  const [fontScale, setFontScale] = useState(0.05);
  const [tileAngle, setTileAngle] = useState(-30);
  const [tileDensity, setTileDensity] = useState(0.26);
  const [viewMode, setViewMode] = useState<ViewMode>('unlimited');
  const [customViews, setCustomViews] = useState(5);
  const [perViewSeconds, setPerViewSeconds] = useState<number>(0);
  const [totalSeconds, setTotalSeconds] = useState<number>(0);
  const [expiresInHours, setExpiresInHours] = useState<number>(0);
  const [password, setPassword] = useState('');
  const [disableDownload, setDisableDownload] = useState(true);
  const [busy, setBusy] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  async function create() {
    setBusy(true);
    try {
      const maxViews = viewMode === 'once' ? 1 : viewMode === 'custom' ? customViews : null;
      const r = await fetch('/api/share/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId,
          watermark: {
            enabled: wmEnabled,
            text: wmText,
            position: wmPos,
            opacity: wmOpacity,
            mode: wmMode,
            ...(wmMode === 'corner' && useCustomPos ? { offsetXPct, offsetYPct } : {}),
            fontScale,
            ...(wmMode === 'tiled' ? { tileAngle, tileDensity } : {}),
          },
          clientLabel: clientLabel || null,
          maxViews,
          perViewSeconds: perViewSeconds || null,
          totalSeconds: totalSeconds || null,
          expiresInHours: expiresInHours || null,
          password: password || null,
          disableDownload,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || '创建分享失败');
      const fullUrl =
        typeof j.absoluteShareUrl === 'string'
          ? j.absoluteShareUrl
          : new URL(j.shareUrl || `/s/${j.shareId}`, window.location.origin).toString();
      setCreatedUrl(fullUrl);
      toast.success('分享链接已生成');
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
      toast.success('链接已复制');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('复制失败');
    }
  }

  function handlePointer(e: PointerEvent<HTMLDivElement>) {
    if (wmMode !== 'corner' || !useCustomPos || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setOffsetXPct(Math.max(0, Math.min(1, x)));
    setOffsetYPct(Math.max(0, Math.min(1, y)));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-md" onClick={onClose}>
      <div className="command-glass reveal-up max-h-[92vh] w-full max-w-4xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="studio-shell flex items-center justify-between border-b border-white/10 p-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-semibold text-cyan-200">
              <span className="pulse-dot" aria-hidden />
              分享配置
            </div>
            <h3 className="mt-2 text-lg font-black text-white">创建客户预览链接</h3>
          </div>
          <button type="button" onClick={onClose} className="tap-target-sm inline-flex w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white" aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        {createdUrl ? (
          <div className="grid gap-4 p-4 md:grid-cols-[0.85fr_1.15fr]">
            {assetUrl && (
              <div className="command-rail rounded-lg border border-slate-200 bg-slate-950 p-3 dark:border-slate-800">
                <img src={assetUrl} alt="" className="max-h-72 w-full object-contain" />
              </div>
            )}
            <div className="flex flex-col justify-center">
              <div className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="h-4 w-4" aria-hidden />
                分享链接已生成
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                链接已写入分享管理，可立即发给客户预览。后续浏览次数、过期状态和撤销操作都在分享管理页集中处理。
              </p>
              <div className="mt-4 flex gap-2">
                <input readOnly value={createdUrl} className="input command-input flex-1 font-mono text-xs" />
                <button type="button" onClick={copyLink} className="btn-primary gap-1.5 text-xs transition hover:-translate-y-0.5">
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? '已复制' : '复制'}
                </button>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <a href={createdUrl} target="_blank" rel="noreferrer" className="btn-secondary gap-2 transition hover:-translate-y-0.5">
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  打开预览
                </a>
                <a href="/share" className="btn-secondary gap-2 transition hover:-translate-y-0.5">
                  <ShieldCheck className="h-4 w-4" aria-hidden />
                  分享管理
                </a>
              </div>
              <button type="button" onClick={onClose} className="btn-primary mt-3 w-full transition hover:-translate-y-0.5">
                完成
              </button>
            </div>
          </div>
        ) : (
          <div className="grid max-h-[calc(92vh-73px)] gap-0 overflow-y-auto md:grid-cols-[0.94fr_1.06fr]">
            <div className="border-b border-slate-200 p-4 dark:border-slate-800 md:border-b-0 md:border-r">
              {assetUrl ? (
                <div
                  ref={previewRef}
                  onPointerDown={(e) => {
                    if (wmMode === 'corner' && useCustomPos) {
                      dragging.current = true;
                      e.currentTarget.setPointerCapture?.(e.pointerId);
                      handlePointer(e);
                    }
                  }}
                  onPointerMove={(e) => {
                    if (dragging.current) handlePointer(e);
                  }}
                  onPointerUp={() => {
                    dragging.current = false;
                  }}
                  className={`command-rail relative overflow-hidden rounded-lg border border-slate-200 bg-slate-950 dark:border-slate-800 ${
                    wmMode === 'corner' && useCustomPos ? 'cursor-crosshair' : ''
                  }`}
                >
                  <img src={assetUrl} alt="" className="max-h-[520px] w-full object-contain" draggable={false} />
                  {wmEnabled && wmText && wmMode === 'tiled' && (
                    <div className="pointer-events-none absolute inset-0 select-none overflow-hidden">
                      <div
                        className="absolute"
                        style={{
                          top: '-30%',
                          left: '-30%',
                          width: '160%',
                          height: '160%',
                          transform: `rotate(${tileAngle}deg)`,
                        }}
                      >
                        {Array.from({ length: Math.round(1 / Math.max(0.12, tileDensity)) + 6 }).map((_, i) => (
                          <div
                            key={i}
                            className="whitespace-nowrap font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]"
                            style={{
                              opacity: Math.min(1, wmOpacity * 2.2),
                              fontSize: `${Math.max(9, fontScale * 220)}px`,
                              lineHeight: `${Math.max(1.6, tileDensity * 9)}em`,
                            }}
                          >
                            {`${wmText}　${clientLabel || '预览样稿'}　${wmText}　${clientLabel || '预览样稿'}`}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {wmEnabled && wmText && wmMode === 'corner' && (
                    <span
                      className="pointer-events-none absolute select-none whitespace-nowrap px-1 py-0.5 font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]"
                      style={{
                        opacity: Math.min(1, wmOpacity * 1.6),
                        fontSize: `${Math.max(10, fontScale * 220)}px`,
                        ...(useCustomPos
                          ? { left: `${offsetXPct * 100}%`, top: `${offsetYPct * 100}%`, transform: 'translate(-50%, -50%)' }
                          : watermarkStyle(wmPos)),
                      }}
                    >
                      {wmText}
                    </span>
                  )}
                  <span className="absolute left-2 top-2 rounded-md bg-black/55 px-2 py-1 text-[10px] text-white">预览</span>
                  {wmMode === 'corner' && useCustomPos && (
                    <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-slate-950/100 px-2 py-1 text-[10px] text-white">
                      <Move size={10} /> 可定位
                    </span>
                  )}
                </div>
              ) : (
                <div className="command-empty flex min-h-[360px] items-center justify-center border-dashed">
                  暂无预览图
                </div>
              )}
            </div>

            <div className="space-y-4 p-4">
              <Panel title="访问控制">
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    ['once', '仅一次'],
                    ['unlimited', '不限次'],
                    ['custom', '自定义'],
                  ] as [ViewMode, string][]).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setViewMode(value)}
                      className={viewMode === value ? 'rounded-lg border border-slate-950 bg-slate-950 px-2 py-2 text-xs font-medium text-white dark:border-white dark:bg-white dark:text-slate-950' : 'rounded-lg border border-slate-200 px-2 py-2 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900'}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {viewMode === 'custom' && (
                  <input type="number" min={1} className="input command-input mt-2" value={customViews} onChange={(e) => setCustomViews(Math.max(1, Number(e.target.value)))} />
                )}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <NumberField label="单次秒数" value={perViewSeconds} onChange={setPerViewSeconds} />
                  <NumberField label="总秒数" value={totalSeconds} onChange={setTotalSeconds} />
                  <NumberField label="过期小时" value={expiresInHours} onChange={setExpiresInHours} />
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">访问密码</span>
                    <input className="input command-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="可留空" />
                  </label>
                </div>
              </Panel>

              <Panel title="水印保护">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <LockKeyhole className="h-4 w-4 text-cyan-600" aria-hidden />
                    预览水印
                  </span>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-500">
                    <input type="checkbox" checked={wmEnabled} onChange={(e) => setWmEnabled(e.target.checked)} />
                    启用
                  </label>
                </div>
                {wmEnabled && (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-1.5">
                      <ModeButton active={wmMode === 'tiled'} onClick={() => setWmMode('tiled')} title="满铺" />
                      <ModeButton active={wmMode === 'corner'} onClick={() => setWmMode('corner')} title="角标" />
                    </div>
                    <input className="input command-input" value={wmText} onChange={(e) => setWmText(e.target.value)} placeholder="水印文字" />
                    <input className="input command-input" value={clientLabel} onChange={(e) => setClientLabel(e.target.value)} placeholder="客户备注，可留空" />
                    <RangeField label="字号" min={0.025} max={0.16} step={0.005} value={fontScale} onChange={setFontScale} suffix={`${Math.round(fontScale * 100)}%`} />
                    <RangeField label="浓度" min={0.08} max={0.5} step={0.02} value={wmOpacity} onChange={setWmOpacity} suffix={`${Math.round(wmOpacity * 100)}%`} />
                    {wmMode === 'corner' ? (
                      <div className="space-y-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                        <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                          <input type="checkbox" checked={useCustomPos} onChange={(e) => setUseCustomPos(e.target.checked)} />
                          自定义坐标
                        </label>
                        {!useCustomPos ? (
                          <select className="input command-input" value={wmPos} onChange={(e) => setWmPos(e.target.value)}>
                            <option value="br">右下</option>
                            <option value="bl">左下</option>
                            <option value="tr">右上</option>
                            <option value="tl">左上</option>
                            <option value="center">居中</option>
                          </select>
                        ) : (
                          <>
                            <RangeField label="X" min={0} max={1} step={0.01} value={offsetXPct} onChange={setOffsetXPct} suffix={`${Math.round(offsetXPct * 100)}%`} />
                            <RangeField label="Y" min={0} max={1} step={0.01} value={offsetYPct} onChange={setOffsetYPct} suffix={`${Math.round(offsetYPct * 100)}%`} />
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                        <RangeField label="角度" min={-90} max={90} step={5} value={tileAngle} onChange={setTileAngle} suffix={`${tileAngle}°`} />
                        <RangeField label="间距" min={0.12} max={0.6} step={0.02} value={tileDensity} onChange={setTileDensity} suffix={tileDensity <= 0.2 ? '密' : tileDensity >= 0.45 ? '疏' : '中'} />
                      </div>
                    )}
                  </div>
                )}
              </Panel>

              <Panel title="交付限制">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input type="checkbox" checked={disableDownload} onChange={(e) => setDisableDownload(e.target.checked)} />
                  禁止下载和右键保存
                </label>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {summaryChips({
                    viewMode,
                    customViews,
                    perViewSeconds,
                    totalSeconds,
                    expiresInHours,
                    wmEnabled,
                    wmMode,
                    password,
                    disableDownload,
                  }).map((chip) => (
                    <span key={chip} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {chip}
                    </span>
                  ))}
                </div>
              </Panel>

              <button type="button" onClick={create} disabled={busy} className="btn-primary w-full gap-2 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-cyan-900/20">
                {busy ? <Loader2 size={15} className="animate-spin" /> : null}
                生成分享链接
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="studio-card p-3">
      <h4 className="text-sm font-semibold text-slate-950 dark:text-white">{title}</h4>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <input type="number" min={0} className="input command-input" value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value)))} />
    </label>
  );
}

function RangeField({
  label,
  min,
  max,
  step,
  value,
  onChange,
  suffix,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  suffix: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-xs text-slate-500">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1" />
      <span className="w-12 shrink-0 text-right text-[10px] font-mono text-slate-400">{suffix}</span>
    </div>
  );
}

function ModeButton({ active, onClick, title }: { active: boolean; onClick: () => void; title: string }) {
  return (
    <button type="button" onClick={onClick} className={active ? 'rounded-lg border border-slate-950 bg-slate-950 px-2 py-2 text-xs font-medium text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-950' : 'rounded-lg border border-slate-200 px-2 py-2 text-xs text-slate-600 transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-50 hover:text-slate-950 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900'}>
      {title}
    </button>
  );
}

function watermarkStyle(pos: string): CSSProperties {
  switch (pos) {
    case 'tl':
      return { top: 8, left: 8 };
    case 'tr':
      return { top: 8, right: 8 };
    case 'bl':
      return { bottom: 8, left: 8 };
    case 'center':
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    case 'br':
    default:
      return { bottom: 8, right: 8 };
  }
}

function summaryChips(cfg: {
  viewMode: ViewMode;
  customViews: number;
  perViewSeconds: number;
  totalSeconds: number;
  expiresInHours: number;
  wmEnabled: boolean;
  wmMode: WatermarkMode;
  password: string;
  disableDownload: boolean;
}): string[] {
  const chips: string[] = [];
  chips.push(cfg.viewMode === 'once' ? '仅看一次' : cfg.viewMode === 'custom' ? `${cfg.customViews} 次` : '不限次数');
  if (cfg.perViewSeconds > 0) chips.push(`单次 ${cfg.perViewSeconds}s`);
  if (cfg.totalSeconds > 0) chips.push(`总计 ${cfg.totalSeconds}s`);
  if (cfg.expiresInHours > 0) chips.push(`${cfg.expiresInHours}h 后失效`);
  if (cfg.wmEnabled) chips.push(cfg.wmMode === 'tiled' ? '满铺水印' : '角标水印');
  if (cfg.password) chips.push('需要密码');
  if (cfg.disableDownload) chips.push('禁下载');
  return chips;
}
