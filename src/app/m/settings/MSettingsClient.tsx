'use client';

import { useState } from 'react';
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

  function up<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '保存失败');
      toast.show('已保存，立即生效', 'success');
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function test(target: 'llm' | 'image') {
    setTesting(target);
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      const j = await res.json();
      toast.show(
        j.ok ? j.message || '连接成功' : j.error || '连接失败',
        j.ok ? 'success' : 'error',
      );
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* LLM */}
      <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">LLM 文案 API</h3>
          <button
            onClick={() => test('llm')}
            disabled={testing === 'llm'}
            className="text-xs text-brand-600 px-2 py-1 active:bg-brand-50 rounded"
          >
            {testing === 'llm' ? '测试中...' : '测试连接'}
          </button>
        </div>
        <Field label="API Base URL">
          <input
            className="m-input"
            value={form.LLM_API_BASE_URL}
            onChange={(e) => up('LLM_API_BASE_URL', e.target.value)}
            placeholder="https://api.openai.com/v1"
          />
        </Field>
        <Field label="API Key">
          <input
            type="password"
            className="m-input"
            value={form.LLM_API_KEY}
            onChange={(e) => up('LLM_API_KEY', e.target.value)}
            placeholder={hasEnvLLM ? '已从 .env 读取，留空则用 .env' : 'sk-...'}
          />
        </Field>
        <Field label="模型">
          <input
            className="m-input"
            value={form.LLM_MODEL}
            onChange={(e) => up('LLM_MODEL', e.target.value)}
          />
        </Field>
      </div>

      {/* 图片 */}
      <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">图片 API（GPT IMG 2）</h3>
          <button
            onClick={() => test('image')}
            disabled={testing === 'image'}
            className="text-xs text-brand-600 px-2 py-1 active:bg-brand-50 rounded"
          >
            {testing === 'image' ? '测试中...' : '测试连接'}
          </button>
        </div>
        <Field label="API Base URL">
          <input
            className="m-input"
            value={form.IMAGE_API_BASE_URL}
            onChange={(e) => up('IMAGE_API_BASE_URL', e.target.value)}
          />
        </Field>
        <Field label="API Key">
          <input
            type="password"
            className="m-input"
            value={form.IMAGE_API_KEY}
            onChange={(e) => up('IMAGE_API_KEY', e.target.value)}
            placeholder={hasEnvImg ? '已从 .env 读取' : 'sk-...'}
          />
        </Field>
        <Field label="模型">
          <input
            className="m-input"
            value={form.IMAGE_MODEL}
            onChange={(e) => up('IMAGE_MODEL', e.target.value)}
          />
        </Field>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full rounded-lg bg-brand-600 text-white font-medium py-3 disabled:opacity-60 active:bg-brand-700"
      >
        {saving ? '保存中...' : '💾 保存设置'}
      </button>

      <p className="text-xs text-slate-400 text-center leading-relaxed">
        优先级：本页面填写 &gt; .env 文件
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
