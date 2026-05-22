'use client';

import { useState } from 'react';

interface Form {
  LLM_API_BASE_URL: string;
  LLM_API_KEY: string;
  LLM_MODEL: string;
  IMAGE_API_BASE_URL: string;
  IMAGE_API_KEY: string;
  IMAGE_MODEL: string;
}

export default function SettingsClient({
  initial,
  hasEnvLLMKey,
  hasEnvImageKey,
}: {
  initial: Form;
  hasEnvLLMKey: boolean;
  hasEnvImageKey: boolean;
}) {
  const [form, setForm] = useState<Form>(initial);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState<'llm' | 'image' | null>(null);
  const [testResult, setTestResult] = useState<{
    target: 'llm' | 'image';
    ok: boolean;
    msg: string;
  } | null>(null);

  function up<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setSaving(true);
    setSavedMsg(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '保存失败');
      setSavedMsg('已保存。配置会立即生效，无需重启。');
    } catch (e) {
      setSavedMsg('保存失败：' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function test(target: 'llm' | 'image') {
    setTesting(target);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      const j = await res.json();
      setTestResult({
        target,
        ok: !!j.ok,
        msg: j.ok ? j.message || '连接成功' : j.error || '连接失败',
      });
    } catch (e) {
      setTestResult({ target, ok: false, msg: (e as Error).message });
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* LLM */}
      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">LLM 文案 API</h2>
          <button
            onClick={() => test('llm')}
            disabled={testing === 'llm'}
            className="text-sm text-brand-600 hover:underline"
          >
            {testing === 'llm' ? '测试中...' : '测试连接'}
          </button>
        </div>
        <div className="card-body space-y-3">
          <Field label="API Base URL">
            <input
              className="input"
              value={form.LLM_API_BASE_URL}
              onChange={(e) => up('LLM_API_BASE_URL', e.target.value)}
              placeholder="例：https://api.openai.com/v1"
            />
          </Field>
          <Field label="API Key">
            <input
              type="password"
              className="input"
              value={form.LLM_API_KEY}
              onChange={(e) => up('LLM_API_KEY', e.target.value)}
              placeholder={hasEnvLLMKey ? '已从 .env 读取（如需修改请在此填写）' : 'sk-...'}
            />
            {hasEnvLLMKey && !form.LLM_API_KEY && (
              <p className="text-xs text-slate-400 mt-1">
                .env 中已配置，留空则使用 .env。在此填写则覆盖。
              </p>
            )}
          </Field>
          <Field label="模型名称">
            <input
              className="input"
              value={form.LLM_MODEL}
              onChange={(e) => up('LLM_MODEL', e.target.value)}
              placeholder="例：gpt-4o-mini"
            />
          </Field>
          {testResult?.target === 'llm' && (
            <div
              className={`text-sm rounded p-2 border ${
                testResult.ok
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  : 'text-red-700 bg-red-50 border-red-200'
              }`}
            >
              {testResult.msg}
            </div>
          )}
        </div>
      </div>

      {/* Image */}
      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">图片生成 API（GPT IMG 2）</h2>
          <button
            onClick={() => test('image')}
            disabled={testing === 'image'}
            className="text-sm text-brand-600 hover:underline"
          >
            {testing === 'image' ? '测试中...' : '测试连接'}
          </button>
        </div>
        <div className="card-body space-y-3">
          <Field label="API Base URL">
            <input
              className="input"
              value={form.IMAGE_API_BASE_URL}
              onChange={(e) => up('IMAGE_API_BASE_URL', e.target.value)}
              placeholder="例：https://api.openai.com/v1"
            />
          </Field>
          <Field label="API Key">
            <input
              type="password"
              className="input"
              value={form.IMAGE_API_KEY}
              onChange={(e) => up('IMAGE_API_KEY', e.target.value)}
              placeholder={hasEnvImageKey ? '已从 .env 读取（如需修改请在此填写）' : 'sk-...'}
            />
            {hasEnvImageKey && !form.IMAGE_API_KEY && (
              <p className="text-xs text-slate-400 mt-1">
                .env 中已配置，留空则使用 .env。在此填写则覆盖。
              </p>
            )}
          </Field>
          <Field label="模型名称">
            <input
              className="input"
              value={form.IMAGE_MODEL}
              onChange={(e) => up('IMAGE_MODEL', e.target.value)}
              placeholder="例：gpt-img-2"
            />
          </Field>
          {testResult?.target === 'image' && (
            <div
              className={`text-sm rounded p-2 border ${
                testResult.ok
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  : 'text-red-700 bg-red-50 border-red-200'
              }`}
            >
              {testResult.msg}
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-2 card">
        <div className="card-body flex items-center justify-between flex-wrap gap-3">
          <div className="text-xs text-slate-500 leading-relaxed">
            说明：API Key 优先读取数据库（本页面填写）的值，若为空则回退到 .env。
            数据库中的 Key 仅写入本机 SQLite，不会上传到任何第三方服务。
          </div>
          <div className="flex items-center gap-3">
            {savedMsg && (
              <span
                className={
                  savedMsg.startsWith('保存失败')
                    ? 'text-sm text-red-600'
                    : 'text-sm text-emerald-600'
                }
              >
                {savedMsg}
              </span>
            )}
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? '保存中...' : '保存设置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
