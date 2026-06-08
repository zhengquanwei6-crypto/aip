'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { CheckCircle2, Image as ImageIcon, KeyRound, Loader2, Save, Server, TestTube2 } from 'lucide-react';

import { useToast } from '@/components/m/Toast';

interface Form {
  LLM_API_BASE_URL: string;
  LLM_API_KEY: string;
  LLM_MODEL: string;
  IMAGE_API_BASE_URL: string;
  IMAGE_API_KEY: string;
  IMAGE_MODEL: string;
}

export default function MSettingsClient({
  initial,
  hasEnvLLM,
  hasEnvImg,
}: {
  initial: Form;
  hasEnvLLM: boolean;
  hasEnvImg: boolean;
}) {
  const toast = useToast();
  const [form, setForm] = useState<Form>(initial);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<'llm' | 'image' | null>(null);

  function up<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || '保存失败');
      toast.show('设置已保存，立即生效', 'success');
    } catch (error) {
      toast.show((error as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function test(target: 'llm' | 'image') {
    setTesting(target);
    try {
      const response = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      const data = await response.json();
      toast.show(
        data.ok ? data.message || '连接成功' : data.error || '连接失败',
        data.ok ? 'success' : 'error',
      );
    } catch (error) {
      toast.show((error as Error).message, 'error');
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="space-y-4">
      <section className="command-panel p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-cyan-200">Mobile Settings</div>
            <h1 className="mt-2 text-2xl font-semibold">移动设置</h1>
            <p className="mt-2 text-sm leading-5 text-slate-300">
              快速调整文案与图片模型连接。完整 API Key 池和平台配置仍在桌面设置页集中管理。
            </p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10">
            <Server className="h-5 w-5 text-cyan-100" />
          </div>
        </div>
      </section>

      <ApiSection
        title="文案模型"
        subtitle="LLM Base URL、Key 与默认模型"
        icon={<KeyRound className="h-4 w-4" />}
        onTest={() => test('llm')}
        testing={testing === 'llm'}
      >
        <Field label="API Base URL">
          <input
            className="m-input"
            value={form.LLM_API_BASE_URL}
            onChange={(event) => up('LLM_API_BASE_URL', event.target.value)}
            placeholder="https://api.openai.com/v1"
          />
        </Field>
        <Field label="API Key">
          <input
            type="password"
            className="m-input"
            value={form.LLM_API_KEY}
            onChange={(event) => up('LLM_API_KEY', event.target.value)}
            placeholder={hasEnvLLM ? '已从 .env 读取，留空则用 .env' : 'sk-...'}
          />
        </Field>
        <Field label="模型">
          <input
            className="m-input"
            value={form.LLM_MODEL}
            onChange={(event) => up('LLM_MODEL', event.target.value)}
          />
        </Field>
      </ApiSection>

      <ApiSection
        title="图片模型"
        subtitle="图片生成接口、Key 与默认模型"
        icon={<ImageIcon className="h-4 w-4" />}
        onTest={() => test('image')}
        testing={testing === 'image'}
      >
        <Field label="API Base URL">
          <input
            className="m-input"
            value={form.IMAGE_API_BASE_URL}
            onChange={(event) => up('IMAGE_API_BASE_URL', event.target.value)}
          />
        </Field>
        <Field label="API Key">
          <input
            type="password"
            className="m-input"
            value={form.IMAGE_API_KEY}
            onChange={(event) => up('IMAGE_API_KEY', event.target.value)}
            placeholder={hasEnvImg ? '已从 .env 读取' : 'sk-...'}
          />
        </Field>
        <Field label="模型">
          <input
            className="m-input"
            value={form.IMAGE_MODEL}
            onChange={(event) => up('IMAGE_MODEL', event.target.value)}
          />
        </Field>
      </ApiSection>

      <button type="button" onClick={save} disabled={saving} className="btn-primary h-12 w-full">
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        {saving ? '保存中' : '保存设置'}
      </button>

      <div className="surface flex items-start gap-3 p-3 text-xs text-slate-500 dark:text-slate-400">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
        <p>优先级：本页面填写高于 .env 文件。留空时将回退到服务器环境变量。</p>
      </div>
    </div>
  );
}

function ApiSection({
  title,
  subtitle,
  icon,
  testing,
  onTest,
  children,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  testing: boolean;
  onTest: () => void;
  children: ReactNode;
}) {
  return (
    <section className="surface p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">
            {icon}
          </span>
          <span className="min-w-0">
            <h2 className="font-semibold text-slate-950 dark:text-slate-50">{title}</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          </span>
        </div>
        <button type="button" onClick={onTest} disabled={testing} className="btn-secondary h-8 px-2.5 py-1 text-xs">
          {testing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <TestTube2 className="mr-1 h-3.5 w-3.5" />}
          测试
        </button>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
      {children}
    </label>
  );
}
