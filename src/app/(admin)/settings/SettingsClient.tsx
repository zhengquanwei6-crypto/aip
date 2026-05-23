'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from '@/lib/toast';

interface Form {
  LLM_API_BASE_URL: string;
  LLM_API_KEY: string;
  LLM_MODEL: string;
  IMAGE_API_BASE_URL: string;
  IMAGE_API_KEY: string;
  IMAGE_MODEL: string;
  IMAGE_DEFAULT_ADAPTER: string;
}

interface AdapterMeta {
  slug: string;
  name: string;
  type: string;
  enabled: boolean;
}

/** 脱敏后的 key 字段元信息（v0.8 Batch 1 / B1.7） */
interface SecretMeta {
  isSet: boolean;
  length: number;
}

export default function SettingsClient({
  initial,
  hasEnvLLMKey,
  hasEnvImageKey,
  adapters,
  // 服务端从 GET /api/settings 读取的 KEY 字段元信息
  // 形态：{ LLM_API_KEY: { isSet, length }, IMAGE_API_KEY: { isSet, length } }
  secretMeta = {},
}: {
  initial: Form;
  hasEnvLLMKey: boolean;
  hasEnvImageKey: boolean;
  adapters: AdapterMeta[];
  secretMeta?: Record<string, SecretMeta>;
}) {
  const [form, setForm] = useState<Form>(initial);
  // 用户是否进入"编辑该 KEY"模式（点击进入后才会发送新值）
  const [editingKey, setEditingKey] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [adapterList, setAdapterList] = useState(adapters);
  const [testing, setTesting] = useState<'llm' | 'image' | null>(null);

  function up<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function startEditKey(k: 'LLM_API_KEY' | 'IMAGE_API_KEY') {
    setEditingKey((m) => ({ ...m, [k]: true }));
    // 进入编辑后清空展示，避免发送占位符
    setForm((f) => ({ ...f, [k]: '' }));
  }

  function cancelEditKey(k: 'LLM_API_KEY' | 'IMAGE_API_KEY') {
    setEditingKey((m) => ({ ...m, [k]: false }));
    setForm((f) => ({ ...f, [k]: '' }));
  }

  async function save() {
    setSaving(true);
    try {
      // 构造提交体：未进入编辑态的 KEY 字段不发送，避免误清空
      const body: Partial<Form> = {
        LLM_API_BASE_URL: form.LLM_API_BASE_URL,
        LLM_MODEL: form.LLM_MODEL,
        IMAGE_API_BASE_URL: form.IMAGE_API_BASE_URL,
        IMAGE_MODEL: form.IMAGE_MODEL,
        IMAGE_DEFAULT_ADAPTER: form.IMAGE_DEFAULT_ADAPTER,
      };
      if (editingKey.LLM_API_KEY) body.LLM_API_KEY = form.LLM_API_KEY;
      if (editingKey.IMAGE_API_KEY) body.IMAGE_API_KEY = form.IMAGE_API_KEY;

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '保存失败');
      toast.success('已保存。配置会立即生效，无需重启。');
      // 保存成功后退出编辑态
      setEditingKey({});
      setForm((f) => ({ ...f, LLM_API_KEY: '', IMAGE_API_KEY: '' }));
    } catch (e) {
      toast.error('保存失败：' + (e as Error).message);
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
      if (j.ok) toast.success(j.message || '连接成功');
      else toast.error(j.error || '连接失败');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(null);
    }
  }

  async function seedPresets() {
    setSeeding(true);
    try {
      const r = await fetch('/api/adapters/seed', { method: 'POST' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || '种入失败');
      toast.success(`种入完成：新增 ${j.added}，已存在 ${j.skipped}`);
      // 刷新 adapter 列表
      const r2 = await fetch('/api/adapters');
      const j2 = await r2.json();
      if (j2.ok) {
        setAdapterList(
          j2.adapters.map((a: any) => ({
            slug: a.slug,
            name: a.name,
            type: a.flow.type,
            enabled: a.enabled,
          })),
        );
      }
    } catch (e) {
      toast.error('失败：' + (e as Error).message);
    } finally {
      setSeeding(false);
    }
  }

  function renderKeyField(
    k: 'LLM_API_KEY' | 'IMAGE_API_KEY',
    label: string,
    fallbackEnv: boolean,
  ) {
    const meta = secretMeta[k];
    const isEditing = !!editingKey[k];
    if (!isEditing && meta?.isSet) {
      return (
        <Field label={label}>
          <div className="flex items-center gap-2">
            <input
              type="text"
              className="input flex-1 cursor-pointer"
              readOnly
              value={`••••••••（已配置 ${meta.length} 字节）`}
              onClick={() => startEditKey(k)}
            />
            <button
              type="button"
              onClick={() => startEditKey(k)}
              className="btn-secondary text-xs px-3 py-1.5 shrink-0"
            >
              修改
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            出于安全，明文不再回显。点击"修改"输入新值，否则保留原值。
          </p>
        </Field>
      );
    }
    return (
      <Field label={label}>
        <input
          type="password"
          className="input"
          autoComplete="new-password"
          value={form[k]}
          onChange={(e) => up(k, e.target.value)}
          placeholder={
            meta?.isSet
              ? '输入新 key（留空则取消修改）'
              : fallbackEnv
                ? '已从 .env 读取（如需修改请在此填写）'
                : 'sk-...'
          }
        />
        {meta?.isSet && (
          <button
            type="button"
            onClick={() => cancelEditKey(k)}
            className="text-xs text-slate-400 hover:text-slate-600 mt-1"
          >
            取消修改（保留原值）
          </button>
        )}
        {!meta?.isSet && fallbackEnv && !form[k] && (
          <p className="text-xs text-slate-400 mt-1">.env 中已配置，留空则使用 .env。</p>
        )}
      </Field>
    );
  }

  return (
    <div className="space-y-6">
      {/* ① 默认图片 adapter（关键链路开关）*/}
      <div className="card border-brand-200 dark:border-brand-800">
        <div className="card-header bg-brand-50/50 dark:bg-brand-900/20">
          <h2 className="font-semibold flex items-center gap-2">
            <span>🔗</span>
            <span>默认图片 adapter</span>
          </h2>
          <Link href="/adapters" className="text-sm text-brand-600 hover:underline">管理 adapters →</Link>
        </div>
        <div className="card-body space-y-3">
          {adapterList.length === 0 ? (
            <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              暂无 adapter。<button onClick={seedPresets} disabled={seeding} className="text-brand-600 hover:underline disabled:opacity-50">
                {seeding ? '种入中…' : '一键种入 5 个内置预设'}
              </button>
            </div>
          ) : (
            <Field label="选择默认 adapter（生图链路会优先走这个）">
              <select
                className="input"
                value={form.IMAGE_DEFAULT_ADAPTER}
                onChange={(e) => up('IMAGE_DEFAULT_ADAPTER', e.target.value)}
              >
                <option value="">— 不使用 adapter（走 OpenAI 兼容默认）—</option>
                {adapterList.filter((a) => a.enabled).map((a) => (
                  <option key={a.slug} value={a.slug}>
                    {a.name} · {a.type === 'sync' ? '同步' : '异步轮询'}
                  </option>
                ))}
                {adapterList.some((a) => !a.enabled) && (
                  <optgroup label="（已停用）">
                    {adapterList.filter((a) => !a.enabled).map((a) => (
                      <option key={a.slug} value={a.slug} disabled>{a.name}（已停用）</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </Field>
          )}
          {adapterList.length > 0 && (
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <button onClick={seedPresets} disabled={seeding} className="text-xs text-slate-500 hover:text-brand-600 hover:underline">
                {seeding ? '检查中…' : '检查并补齐内置预设'}
              </button>
              <span className="text-xs text-slate-400">·</span>
              <Link href="/adapters" className="text-xs text-slate-500 hover:text-brand-600 hover:underline">新建自定义 adapter</Link>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LLM */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">LLM 文案 API</h2>
            <button
              onClick={() => test('llm')}
              disabled={testing === 'llm'}
              className="text-sm text-brand-600 hover:underline disabled:opacity-50"
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
            {renderKeyField('LLM_API_KEY', 'API Key', hasEnvLLMKey)}
            <Field label="模型名称">
              <input
                className="input"
                value={form.LLM_MODEL}
                onChange={(e) => up('LLM_MODEL', e.target.value)}
                placeholder="例：gpt-4o-mini"
              />
            </Field>
          </div>
        </div>

        {/* Image API（兼容旧路径）*/}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">图片 API（fallback）</h2>
            <button
              onClick={() => test('image')}
              disabled={testing === 'image'}
              className="text-sm text-brand-600 hover:underline disabled:opacity-50"
            >
              {testing === 'image' ? '测试中...' : '测试连接'}
            </button>
          </div>
          <div className="card-body space-y-3">
            <p className="text-xs text-slate-500 leading-relaxed">
              当上面"默认 adapter"未选时，生图会走这里的 OpenAI 兼容配置。<br/>
              选了 adapter 后，下面的字段中只有 <code className="text-xs">IMAGE_API_KEY</code> 仍会被 adapter 复用。
            </p>
            <Field label="API Base URL">
              <input
                className="input"
                value={form.IMAGE_API_BASE_URL}
                onChange={(e) => up('IMAGE_API_BASE_URL', e.target.value)}
                placeholder="例：https://api.openai.com/v1"
              />
            </Field>
            {renderKeyField('IMAGE_API_KEY', 'API Key（adapter 也用这个 key）', hasEnvImageKey)}
            <Field label="模型名称（仅 fallback 用）">
              <input
                className="input"
                value={form.IMAGE_MODEL}
                onChange={(e) => up('IMAGE_MODEL', e.target.value)}
                placeholder="例：gpt-img-2"
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body flex items-center justify-between flex-wrap gap-3">
          <div className="text-xs text-slate-500 leading-relaxed">
            说明：API Key 优先读取数据库（本页面填写）的值，若为空则回退到 .env。
            数据库中的 Key 仅写入本机 SQLite。GET 接口已脱敏，不再回传明文。
          </div>
          <div className="flex items-center gap-3">
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
