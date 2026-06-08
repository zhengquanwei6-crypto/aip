'use client';

import type { FormEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Eye,
  Loader2,
  Lock,
  ShieldCheck,
  Timer,
  X,
  ZoomIn,
} from 'lucide-react';

interface Settings {
  watermark: { enabled: boolean; text: string; position: string; opacity: number; mode?: string };
  perViewSeconds: number | null;
  totalSeconds: number | null;
  consumedSeconds: number;
  disableDownload: boolean;
  clientLabel: string | null;
  shareId: string;
  remainingViews: number | null;
  willExpireAfter: boolean;
}

type Phase = 'loading' | 'password' | 'viewing' | 'expired' | 'error';

export default function ShareViewClient({ shareId }: { shareId: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [reason, setReason] = useState('');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [password, setPassword] = useState('');
  const [perViewLeft, setPerViewLeft] = useState<number | null>(null);
  const [perViewTotal, setPerViewTotal] = useState<number | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [nowStr, setNowStr] = useState('');

  const register = useCallback(
    async (pw?: string) => {
      setPhase('loading');
      setReason('');
      setImgLoaded(false);
      try {
        const response = await fetch(`/api/share/${shareId}/view`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pw }),
        });
        const data = await response.json();
        if (response.status === 401 && data.needPassword) {
          setPhase('password');
          return;
        }
        if (!data.ok) {
          setReason(data.error || '无法访问这条分享链接');
          setPhase('error');
          return;
        }
        if (data.expired) {
          setReason(data.message || '分享链接已失效');
          setPhase('expired');
          return;
        }

        const nextSettings = data.settings as Settings;
        setSettings(nextSettings);
        setPerViewLeft(nextSettings.perViewSeconds);
        setPerViewTotal(nextSettings.perViewSeconds);
        setPhase('viewing');
      } catch (error) {
        setReason((error as Error).message);
        setPhase('error');
      }
    },
    [shareId],
  );

  useEffect(() => {
    void register();
  }, [register]);

  useEffect(() => {
    if (phase !== 'viewing') return;
    const update = () => {
      const date = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      setNowStr(
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`,
      );
    };
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'viewing' || !settings || settings.totalSeconds === null) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/share/${shareId}/tick`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seconds: 5 }),
        });
        const data = await response.json();
        if (data.expired) {
          setReason(reasonText(data.reason));
          setPhase('expired');
        }
      } catch {
        /* heartbeat is best-effort */
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [phase, settings, shareId]);

  useEffect(() => {
    if (phase !== 'viewing' || perViewTotal === null) return;
    const timer = window.setInterval(() => {
      setPerViewLeft((value) => {
        if (value === null) return null;
        if (value <= 1) {
          setReason('本次查看时间已结束。刷新后可重新查看，但会消耗一次访问次数。');
          setPhase('expired');
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase, perViewTotal]);

  useEffect(() => {
    if (!settings?.disableDownload) return;
    const prevent = (event: Event) => event.preventDefault();
    document.addEventListener('contextmenu', prevent);
    document.addEventListener('dragstart', prevent);
    return () => {
      document.removeEventListener('contextmenu', prevent);
      document.removeEventListener('dragstart', prevent);
    };
  }, [settings]);

  const progress = useMemo(() => {
    if (perViewLeft === null || perViewTotal === null || perViewTotal <= 0) return null;
    return Math.max(0, Math.min(100, (perViewLeft / perViewTotal) * 100));
  }, [perViewLeft, perViewTotal]);

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void register(password);
  }

  const trace = settings
    ? `${settings.clientLabel ? `${settings.clientLabel} / ` : ''}${nowStr} / ${settings.shareId}`
    : '';

  return (
    <div className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,.07)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,.05)_1px,transparent_1px),radial-gradient(circle_at_16%_10%,rgba(6,182,212,.22),transparent_32%),radial-gradient(circle_at_82%_14%,rgba(168,85,247,.18),transparent_28%)] bg-[size:44px_44px,44px_44px,auto,auto]" />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />

      <header className="relative z-10 flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10">
            <ShieldCheck className="h-4 w-4 text-cyan-200" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">AIP 客户预览</div>
            <div className="truncate text-xs text-slate-400">受控查看 / 动态水印 / 访问追踪</div>
          </div>
        </div>

        {phase === 'viewing' && settings && (
          <div className="hidden items-center gap-2 text-xs sm:flex">
            {settings.remainingViews !== null && (
              <StatusBadge icon={<Eye className="h-3.5 w-3.5" />}>剩余 {settings.remainingViews} 次</StatusBadge>
            )}
            {settings.watermark.enabled && <StatusBadge icon={<ShieldCheck className="h-3.5 w-3.5" />}>水印</StatusBadge>}
            {settings.disableDownload && <StatusBadge icon={<Ban className="h-3.5 w-3.5" />}>禁下载</StatusBadge>}
          </div>
        )}
      </header>

      <main className="relative z-10 flex min-h-[calc(100vh-66px)] items-center justify-center p-4 sm:p-6">
        {phase === 'loading' && (
          <StatePanel>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-200" />
            <h1 className="mt-4 text-lg font-semibold">正在打开分享</h1>
            <p className="mt-2 text-sm text-slate-400">正在校验链接状态、访问次数和查看权限。</p>
          </StatePanel>
        )}

        {phase === 'password' && (
          <StatePanel>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-300/10">
              <Lock className="h-5 w-5 text-cyan-200" aria-hidden />
            </div>
            <h1 className="mt-4 text-lg font-semibold">受保护的分享</h1>
            <p className="mt-2 text-sm text-slate-400">输入创建者提供的访问密码后继续查看。</p>
            <form onSubmit={submitPassword} className="mt-5 space-y-3">
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="输入访问密码"
                className="h-11 w-full rounded-lg border border-white/10 bg-white/10 px-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-cyan-300"
                autoFocus
              />
              <button type="submit" className="h-11 w-full rounded-lg bg-white text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-100">
                进入查看
              </button>
            </form>
          </StatePanel>
        )}

        {(phase === 'expired' || phase === 'error') && (
          <StatePanel>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-amber-300/30 bg-amber-300/10">
              <AlertTriangle className="h-5 w-5 text-amber-200" aria-hidden />
            </div>
            <h1 className="mt-4 text-lg font-semibold">{phase === 'expired' ? '分享已失效' : '无法访问'}</h1>
            <p className="mt-2 text-sm text-slate-400">{reason}</p>
          </StatePanel>
        )}

        {phase === 'viewing' && settings && (
          <section className="w-full max-w-6xl">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-cyan-200">Client review link</div>
                <h1 className="mt-1 text-xl font-semibold sm:text-2xl">图片审阅台</h1>
              </div>
              <div className="flex flex-wrap gap-2 text-xs sm:hidden">
                {settings.remainingViews !== null && <StatusBadge icon={<Eye className="h-3.5 w-3.5" />}>剩余 {settings.remainingViews} 次</StatusBadge>}
                {settings.disableDownload && <StatusBadge icon={<Ban className="h-3.5 w-3.5" />}>禁下载</StatusBadge>}
              </div>
            </div>

            {progress !== null && (
              <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.04] p-3">
                <div className="mb-2 flex items-center justify-between text-xs text-slate-300">
                  <span className="inline-flex items-center gap-1.5">
                    <Timer className="h-3.5 w-3.5 text-amber-200" aria-hidden />
                    本次查看剩余
                  </span>
                  <span className="font-mono tabular-nums text-amber-200">{perViewLeft}s</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-300 to-cyan-200 transition-[width] duration-1000 ease-linear"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="relative overflow-hidden rounded-lg border border-white/10 bg-slate-900 shadow-2xl shadow-black/40">
              {!imgLoaded && (
                <div className="absolute inset-0 flex min-h-[340px] items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-cyan-200" />
                </div>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/share/${shareId}/image`}
                alt="分享图片"
                onLoad={() => setImgLoaded(true)}
                onError={() => {
                  setReason('图片资源无法加载，请回到分享管理重新生成链接或检查素材是否仍在资产库中。');
                  setPhase('error');
                }}
                onClick={() => {
                  if (!settings.disableDownload) setZoomed(true);
                }}
                className={
                  'max-h-[72vh] w-full select-none object-contain transition-opacity duration-500 ' +
                  (imgLoaded ? 'opacity-100' : 'opacity-0') +
                  (settings.disableDownload ? '' : ' cursor-zoom-in')
                }
                draggable={false}
                style={settings.disableDownload ? { pointerEvents: 'none' as const } : undefined}
              />
              {imgLoaded && settings.watermark.enabled && (
                <DynamicWatermark text={settings.watermark?.text || 'AIP 预览样稿'} trace={trace} />
              )}
              {imgLoaded && !settings.disableDownload && (
                <button
                  type="button"
                  onClick={() => setZoomed(true)}
                  className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-lg border border-white/20 bg-slate-950/75 px-3 py-2 text-xs text-white backdrop-blur transition-colors hover:bg-slate-900"
                >
                  <ZoomIn className="h-3.5 w-3.5" aria-hidden />
                  放大查看
                </button>
              )}
            </div>

            <div className="mt-4 grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
              <InfoStrip label="水印策略" value={settings.watermark.enabled ? '已启用动态溯源' : '未启用'} />
              <InfoStrip label="下载策略" value={settings.disableDownload ? '已禁用右键和拖拽' : '允许放大查看'} />
              <InfoStrip label="总时长" value={settings.totalSeconds === null ? '不限' : `${settings.consumedSeconds}/${settings.totalSeconds} 秒`} />
            </div>
          </section>
        )}
      </main>

      {zoomed && settings && !settings.disableDownload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4" onClick={() => setZoomed(false)}>
          <button
            type="button"
            onClick={() => setZoomed(false)}
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="关闭"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          <div className="relative max-h-full max-w-full" onClick={(event) => event.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/share/${shareId}/image`}
              alt="分享图片放大预览"
              className="max-h-[92vh] max-w-full object-contain"
              draggable={false}
            />
            {settings.watermark.enabled && <DynamicWatermark text={settings.watermark?.text || 'AIP 预览样稿'} trace={trace} />}
          </div>
        </div>
      )}
    </div>
  );
}

function StatePanel({ children }: { children: ReactNode }) {
  return (
    <div className="w-full max-w-sm rounded-lg border border-white/10 bg-white/[0.06] p-6 text-center shadow-2xl shadow-black/30 backdrop-blur">
      {children}
    </div>
  );
}

function StatusBadge({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/10 px-2.5 py-1 text-slate-200">
      {icon}
      {children}
    </span>
  );
}

function InfoStrip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
      <div className="text-slate-500">{label}</div>
      <div className="mt-1 text-slate-200">{value}</div>
    </div>
  );
}

function DynamicWatermark({ text, trace }: { text: string; trace: string }) {
  const line = `${text} 仅供预览 禁止商用 ${trace}`;
  return (
    <div className="pointer-events-none absolute inset-0 select-none overflow-hidden" aria-hidden style={{ mixBlendMode: 'overlay' }}>
      <div
        className="absolute"
        style={{
          top: '-24%',
          left: '-24%',
          width: '148%',
          height: '148%',
          transform: 'rotate(-28deg)',
        }}
      >
        {Array.from({ length: 16 }).map((_, index) => (
          <div
            key={index}
            className="whitespace-nowrap font-medium text-white/25"
            style={{ fontSize: 'clamp(10px, 1.5vw, 18px)', lineHeight: '3em' }}
          >
            {`${line}     ${line}     ${line}`}
          </div>
        ))}
      </div>
    </div>
  );
}

function reasonText(code?: string): string {
  switch (code) {
    case 'revoked':
      return '该分享链接已被创建者撤销。';
    case 'max_views':
      return '该分享链接的可浏览次数已用尽。';
    case 'expired':
      return '该分享链接已过期。';
    case 'total_time':
      return '总浏览时长已用尽。';
    default:
      return '链接已失效。';
  }
}
