'use client';

import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Command, Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';

export default function AuthClient({ mode }: { mode: 'login' | 'register' }) {
  const search = useSearchParams();
  const next = search.get('next') || '/dashboard';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLogin = mode === 'login';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError('请输入用户名和密码。');
      return;
    }
    if (!isLogin) {
      if (password.length < 6) {
        setError('密码至少需要 6 位。');
        return;
      }
      if (password !== confirm) {
        setError('两次输入的密码不一致。');
        return;
      }
    }

    setLoading(true);
    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const j = await r.json();
      if (!j.ok) {
        setError(j.error || (isLogin ? '登录失败。' : '注册失败。'));
        setLoading(false);
        return;
      }
      window.location.href = next;
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(6,182,212,.22),transparent_34%),linear-gradient(90deg,rgba(255,255,255,.055)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,.04)_1px,transparent_1px)] bg-[size:auto,32px_32px,32px_32px]" />
      <header className="relative z-10 border-b border-white/10 bg-slate-950/100 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1160px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="group flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-950 transition-transform group-hover:scale-105">
              <Command className="h-5 w-5" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold leading-4">AIP 创作指挥舱</span>
              <span className="block text-xs text-slate-500">Design AI Ops</span>
            </span>
          </Link>
          <Link href="/" className="text-sm font-medium text-slate-400 hover:text-white">
            返回首页
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid min-h-[calc(100vh-64px)] max-w-[1160px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-10">
        <section className="command-panel flex flex-col justify-between p-6 sm:p-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300">
              <LockKeyhole className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
              内部团队入口
            </div>
            <h1 className="mt-6 text-5xl font-semibold leading-none text-white sm:text-6xl">
              {isLogin ? '登录指挥舱' : '创建操作账号'}
            </h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-slate-300">
              {isLogin
                ? '进入统一的创作、资产、协作和系统配置工作台。'
                : '为团队成员创建新的操作账号，共用当前工作台数据。'}
            </p>
          </div>
          <div className="mt-10 grid grid-cols-3 gap-3 text-xs text-slate-300">
            <div className="rounded-lg border border-white/10 bg-white/[0.05] p-3">创作工具</div>
            <div className="rounded-lg border border-white/10 bg-white/[0.05] p-3">资产库</div>
            <div className="rounded-lg border border-white/10 bg-white/[0.05] p-3">Key 池</div>
          </div>
        </section>

        <section className="studio-card flex items-center p-5 sm:p-8">
          <div className="w-full">
            <div className="mb-6">
              <div className="page-kicker">{isLogin ? '登录' : '注册'}</div>
              <h2 className="mt-2 text-2xl font-semibold leading-tight">
                {isLogin ? '输入工作台凭据' : '新建操作员'}
              </h2>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <FieldLabel label="用户名">
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={isLogin ? '请输入用户名' : '3-32 个字符'}
                  disabled={loading}
                  className="input command-input h-11"
                />
              </FieldLabel>

              <FieldLabel label="密码">
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isLogin ? '请输入密码' : '至少 6 位'}
                    disabled={loading}
                    className="input command-input h-11 pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((value) => !value)}
                    className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-cyan-50 hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-white"
                    aria-label={showPass ? '隐藏密码' : '显示密码'}
                    tabIndex={-1}
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </FieldLabel>

              {!isLogin && (
                <FieldLabel label="确认密码">
                  <input
                    type={showPass ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="再次输入密码"
                    disabled={loading}
                    className="input command-input h-11"
                  />
                </FieldLabel>
              )}

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-primary h-11 w-full gap-2 transition hover:-translate-y-0.5">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {isLogin ? '登录中...' : '创建中...'}
                  </>
                ) : (
                  <>
                    {isLogin ? '进入工作台' : '注册并进入'}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden />
              {isLogin ? (
                <>
                  需要账号？{' '}
                  <Link
                    href={`/register${next !== '/dashboard' ? `?next=${encodeURIComponent(next)}` : ''}`}
                    className="font-medium text-slate-950 hover:underline"
                  >
                    去注册
                  </Link>
                </>
              ) : (
                <>
                  已有账号？{' '}
                  <Link
                    href={`/login${next !== '/dashboard' ? `?next=${encodeURIComponent(next)}` : ''}`}
                    className="font-medium text-slate-950 hover:underline"
                  >
                    去登录
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
    </label>
  );
}
