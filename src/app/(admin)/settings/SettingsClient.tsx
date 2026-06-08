'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowUp,
  CheckCircle2,
  CircleAlert,
  Database,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';

import { toast } from '@/lib/toast';
import PlatformEditModal, {
  type PlatformInfoLite,
  type PlatformSlug,
} from '@/components/market/PlatformEditModal';

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

interface SecretMeta {
  isSet: boolean;
  length: number;
}

interface PoolKey {
  id: string;
  provider: 'llm' | 'image';
  label: string;
  baseUrl: string;
  apiKey: string;
  isSet: boolean;
  length: number;
  model: string;
  active: boolean;
  priority: number;
  lastUsedAt: string | null;
  lastError: string | null;
  consecutiveErrors: number;
  totalRequests: number;
  totalErrors: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DraftKey {
  id?: string;
  provider: 'llm' | 'image';
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  active: boolean;
  priority: number;
  notes: string;
}

type VectorMaskedSecret = { isSet: boolean; preview: string; length: number };
type VectorConfig = {
  VECTOR_ENABLED: string;
  VECTOR_ZILLIZ_ENDPOINT: string;
  VECTOR_ZILLIZ_TOKEN: VectorMaskedSecret;
  EMBEDDING_BASE_URL: string;
  EMBEDDING_API_KEY: VectorMaskedSecret;
  EMBEDDING_MODEL: string;
};

type VectorStatus = {
  enabled: boolean;
  endpoint: string;
  history: { exists: boolean; rows: number };
  assets: { exists: boolean; rows: number };
  error?: string;
};

const EMPTY_DRAFT: DraftKey = {
  provider: 'llm',
  label: '',
  baseUrl: '',
  apiKey: '',
  model: '',
  active: true,
  priority: 0,
  notes: '',
};

export default function SettingsClient({
  initial,
  hasEnvLLMKey,
  hasEnvImageKey,
  adapters,
  secretMeta = {},
}: {
  initial: Form;
  hasEnvLLMKey: boolean;
  hasEnvImageKey: boolean;
  adapters: AdapterMeta[];
  secretMeta?: Record<string, SecretMeta>;
}) {
  const [form, setForm] = useState<Form>(initial);
  const [editingKey, setEditingKey] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<'llm' | 'image' | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [adapterList] = useState(adapters);

  const [pool, setPool] = useState<PoolKey[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolErr, setPoolErr] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState<DraftKey>(EMPTY_DRAFT);
  const [draftEditMode, setDraftEditMode] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [keyBusy, setKeyBusy] = useState<string | null>(null);

  const [vectorConfig, setVectorConfig] = useState<VectorConfig | null>(null);
  const [vectorStatus, setVectorStatus] = useState<VectorStatus | null>(null);
  const [vectorEditing, setVectorEditing] = useState(false);
  const [vectorBusy, setVectorBusy] = useState<'save' | 'embed-test' | 'backfill' | null>(null);
  const [embedTestResult, setEmbedTestResult] = useState('');
  const [vectorDraft, setVectorDraft] = useState({
    VECTOR_ENABLED: '0',
    VECTOR_ZILLIZ_ENDPOINT: '',
    VECTOR_ZILLIZ_TOKEN: '',
    EMBEDDING_BASE_URL: '',
    EMBEDDING_API_KEY: '',
    EMBEDDING_MODEL: '',
  });

  const [platforms, setPlatforms] = useState<PlatformInfoLite[]>([]);
  const [platformsLoading, setPlatformsLoading] = useState(false);
  const [platformsErr, setPlatformsErr] = useState<string | null>(null);
  const [editingPlatform, setEditingPlatform] = useState<PlatformInfoLite | null>(null);

  const groupedPool = useMemo(
    () => ({
      llm: pool.filter((row) => row.provider === 'llm'),
      image: pool.filter((row) => row.provider === 'image'),
    }),
    [pool],
  );

  const activeCount = pool.filter((row) => row.active).length;
  const errorCount = pool.filter((row) => row.lastError).length;

  async function refreshPool() {
    setPoolLoading(true);
    setPoolErr(null);
    try {
      const res = await fetch('/api/settings/keys', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '加载失败');
      setPool(j.items as PoolKey[]);
    } catch (e) {
      setPoolErr((e as Error).message);
    } finally {
      setPoolLoading(false);
    }
  }

  async function refreshVector() {
    try {
      const [cfgRes, stRes] = await Promise.all([
        fetch('/api/vector/config', { cache: 'no-store' }),
        fetch('/api/vector/status', { cache: 'no-store' }),
      ]);
      const cfg = await cfgRes.json();
      const st = await stRes.json();
      if (cfg.ok) {
        const next = cfg.config as VectorConfig;
        setVectorConfig(next);
        setVectorDraft({
          VECTOR_ENABLED: next.VECTOR_ENABLED || '0',
          VECTOR_ZILLIZ_ENDPOINT: next.VECTOR_ZILLIZ_ENDPOINT || '',
          VECTOR_ZILLIZ_TOKEN: '',
          EMBEDDING_BASE_URL: next.EMBEDDING_BASE_URL || '',
          EMBEDDING_API_KEY: '',
          EMBEDDING_MODEL: next.EMBEDDING_MODEL || '',
        });
      }
      if (st.ok) setVectorStatus(st as VectorStatus);
      else setVectorStatus({ enabled: false, endpoint: '', history: { exists: false, rows: 0 }, assets: { exists: false, rows: 0 }, error: st.error });
    } catch (e) {
      setVectorStatus({ enabled: false, endpoint: '', history: { exists: false, rows: 0 }, assets: { exists: false, rows: 0 }, error: (e as Error).message });
    }
  }

  async function refreshPlatforms() {
    setPlatformsLoading(true);
    setPlatformsErr(null);
    try {
      const res = await fetch('/api/market/platforms', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '加载失败');
      setPlatforms((j.platforms ?? []) as PlatformInfoLite[]);
    } catch (e) {
      setPlatformsErr((e as Error).message);
    } finally {
      setPlatformsLoading(false);
    }
  }

  useEffect(() => {
    void refreshPool();
    void refreshVector();
    void refreshPlatforms();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      void refreshVector();
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  function up<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
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
      toast.success('设置已保存');
      setEditingKey({});
      setForm((current) => ({ ...current, LLM_API_KEY: '', IMAGE_API_KEY: '' }));
    } catch (e) {
      toast.error(`保存失败：${(e as Error).message}`);
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

  async function seedAdapters() {
    setSeeding(true);
    try {
      const res = await fetch('/api/adapters/seed', { method: 'POST' });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '种入失败');
      toast.success(`已补齐适配器：新增 ${j.added}，跳过 ${j.skipped}`);
      window.setTimeout(() => window.location.reload(), 650);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSeeding(false);
    }
  }

  function openCreate(provider: 'llm' | 'image') {
    setDraft({ ...EMPTY_DRAFT, provider });
    setDraftEditMode(false);
    setDrawerOpen(true);
  }

  function openEdit(row: PoolKey) {
    setDraft({
      id: row.id,
      provider: row.provider,
      label: row.label,
      baseUrl: row.baseUrl,
      apiKey: '',
      model: row.model,
      active: row.active,
      priority: row.priority,
      notes: row.notes ?? '',
    });
    setDraftEditMode(true);
    setDrawerOpen(true);
  }

  async function saveDraft() {
    if (!draft.label.trim()) return toast.error('请填写名称');
    if (!draft.baseUrl.trim()) return toast.error('请填写 Base URL');
    if (!draft.model.trim()) return toast.error('请填写模型名');
    if (!draftEditMode && !draft.apiKey.trim()) return toast.error('请填写 API Key');

    setDraftSaving(true);
    try {
      let res: Response;
      if (draftEditMode && draft.id) {
        const payload: Record<string, unknown> = {
          provider: draft.provider,
          label: draft.label,
          baseUrl: draft.baseUrl,
          model: draft.model,
          active: draft.active,
          priority: draft.priority,
          notes: draft.notes,
        };
        if (draft.apiKey.trim()) payload.apiKey = draft.apiKey;
        res = await fetch(`/api/settings/keys/${draft.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/settings/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        });
      }
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '保存失败');
      toast.success(draftEditMode ? 'Key 已更新' : 'Key 已新增');
      setDrawerOpen(false);
      await refreshPool();
    } catch (e) {
      toast.error(`保存失败：${(e as Error).message}`);
    } finally {
      setDraftSaving(false);
    }
  }

  async function testKey(id: string) {
    setKeyBusy(id);
    try {
      const res = await fetch(`/api/settings/keys/${id}/test`, { method: 'POST' });
      const j = await res.json();
      if (j.ok) toast.success(j.message || '连通性正常');
      else toast.error(j.error || '连通性失败');
      await refreshPool();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setKeyBusy(null);
    }
  }

  async function quotaKey(id: string, label: string) {
    setKeyBusy(id);
    try {
      const res = await fetch(`/api/settings/keys/${id}/quota`, { method: 'POST' });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || '额度查询失败');
      const quota = j.quota || {};
      const msg = [
        `Key：${label}`,
        quota.plan ? `计划：${quota.plan}` : '',
        `总额度：${formatMoney(quota.totalUsd)}`,
        `已使用：${formatMoney(quota.usedUsd)}`,
        `剩余：${formatMoney(quota.remainingUsd)}`,
        quota.endpoint ? `端点：${quota.endpoint}` : '',
        j.lastError ? `最近错误：${j.lastError}` : '',
      ].filter(Boolean).join('\n');
      toast.success(`额度：${formatMoney(quota.remainingUsd)}`);
      window.alert(msg);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setKeyBusy(null);
    }
  }

  async function promoteKey(id: string) {
    setKeyBusy(id);
    try {
      const res = await fetch(`/api/settings/keys/${id}/promote`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '操作失败');
      toast.success('已置顶');
      await refreshPool();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setKeyBusy(null);
    }
  }

  async function deleteKey(id: string, label: string) {
    if (!window.confirm(`确认删除「${label}」？此操作不可恢复。`)) return;
    setKeyBusy(id);
    try {
      const res = await fetch(`/api/settings/keys/${id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '删除失败');
      toast.success('已删除');
      await refreshPool();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setKeyBusy(null);
    }
  }

  async function toggleActive(row: PoolKey) {
    setKeyBusy(row.id);
    try {
      const res = await fetch(`/api/settings/keys/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !row.active, resetErrors: !row.active }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '操作失败');
      toast.success(row.active ? '已停用' : '已启用');
      await refreshPool();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setKeyBusy(null);
    }
  }

  async function saveVector() {
    setVectorBusy('save');
    try {
      const body: Record<string, string> = {
        VECTOR_ENABLED: vectorDraft.VECTOR_ENABLED,
        VECTOR_ZILLIZ_ENDPOINT: vectorDraft.VECTOR_ZILLIZ_ENDPOINT,
        EMBEDDING_BASE_URL: vectorDraft.EMBEDDING_BASE_URL,
        EMBEDDING_MODEL: vectorDraft.EMBEDDING_MODEL,
      };
      if (vectorDraft.VECTOR_ZILLIZ_TOKEN.trim()) body.VECTOR_ZILLIZ_TOKEN = vectorDraft.VECTOR_ZILLIZ_TOKEN;
      if (vectorDraft.EMBEDDING_API_KEY.trim()) body.EMBEDDING_API_KEY = vectorDraft.EMBEDDING_API_KEY;
      const res = await fetch('/api/vector/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || '保存失败');
      toast.success(`向量配置已保存 ${j.updated} 项`);
      setVectorEditing(false);
      await refreshVector();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setVectorBusy(null);
    }
  }

  async function testEmbedding() {
    setVectorBusy('embed-test');
    setEmbedTestResult('');
    try {
      const res = await fetch('/api/vector/embed-test', { method: 'POST' });
      const j = await res.json();
      if (!j.ok) {
        setEmbedTestResult(j.error || '测试失败');
        toast.error('Embedding 测试失败');
      } else {
        setEmbedTestResult(`通过，维度 ${j.dimension}`);
        toast.success(`Embedding 测试通过：${j.dimension} 维`);
      }
    } catch (e) {
      setEmbedTestResult((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setVectorBusy(null);
    }
  }

  async function backfillVector() {
    if (!window.confirm('确认开始全量回填 AIOutput + Asset 到 Zilliz？这会消耗 embedding 额度。')) return;
    setVectorBusy('backfill');
    try {
      const res = await fetch('/api/vector/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'all', batch: 50 }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || '回填失败');
      toast.success(`回填完成：history ${j.history.ok}/${j.history.processed}，assets ${j.assets.ok}/${j.assets.processed}`);
      await refreshVector();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setVectorBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-5 lg:grid-cols-[1fr_0.86fr]">
        <div className="command-panel p-6">
          <div className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300">
            <Activity className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
            系统控制面板
          </div>
          <h2 className="mt-5 text-4xl font-semibold leading-none text-white sm:text-5xl">
            Key、模型、向量和平台配置集中管理。
          </h2>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <DarkMetric label="Key 总数" value={pool.length} />
            <DarkMetric label="启用" value={activeCount} />
            <DarkMetric label="异常" value={errorCount} />
            <DarkMetric label="Adapter" value={adapterList.length} />
          </div>
        </div>

        <div className="surface-elevated p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="page-kicker">快速状态</div>
              <h3 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">运行依赖</h3>
            </div>
            <button type="button" onClick={() => { void refreshPool(); void refreshVector(); void refreshPlatforms(); }} className="btn-secondary h-9 gap-2 text-xs">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              刷新
            </button>
          </div>
          <div className="mt-4 space-y-3">
            <StatusRow label="LLM Key 池" ok={groupedPool.llm.some((row) => row.active)} value={`${groupedPool.llm.filter((row) => row.active).length}/${groupedPool.llm.length}`} />
            <StatusRow label="图片 Key 池" ok={groupedPool.image.some((row) => row.active)} value={`${groupedPool.image.filter((row) => row.active).length}/${groupedPool.image.length}`} />
            <StatusRow label="向量检索" ok={Boolean(vectorStatus?.enabled)} value={vectorStatus?.enabled ? '已启用' : '未启用'} />
            <StatusRow label="默认 Adapter" ok={Boolean(form.IMAGE_DEFAULT_ADAPTER)} value={form.IMAGE_DEFAULT_ADAPTER || '走兼容链路'} />
          </div>
        </div>
      </section>

      <section className="surface overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="page-kicker">API Key 池</div>
            <h3 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">模型调用优先级</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => openCreate('llm')} className="btn-secondary h-9 gap-2 text-xs">
              <Plus className="h-3.5 w-3.5" aria-hidden />
              新增 LLM
            </button>
            <button type="button" onClick={() => openCreate('image')} className="btn-primary h-9 gap-2 text-xs">
              <Plus className="h-3.5 w-3.5" aria-hidden />
              新增图片 Key
            </button>
          </div>
        </div>
        {poolErr && <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">{poolErr}</div>}
        {poolLoading ? (
          <div className="flex min-h-[220px] items-center justify-center text-sm text-slate-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 加载 Key 池...
          </div>
        ) : (
          <div className="grid gap-px bg-slate-200 dark:bg-slate-800 lg:grid-cols-2">
            <PoolSection
              title="LLM 文案 Key"
              rows={groupedPool.llm}
              busyId={keyBusy}
              onEdit={openEdit}
              onTest={testKey}
              onQuota={quotaKey}
              onPromote={promoteKey}
              onToggle={toggleActive}
              onDelete={deleteKey}
            />
            <PoolSection
              title="图片生成 Key"
              rows={groupedPool.image}
              busyId={keyBusy}
              onEdit={openEdit}
              onTest={testKey}
              onQuota={quotaKey}
              onPromote={promoteKey}
              onToggle={toggleActive}
              onDelete={deleteKey}
            />
          </div>
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="surface p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="page-kicker">向量检索</div>
              <h3 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">Zilliz / Embedding</h3>
            </div>
            <button type="button" onClick={() => setVectorEditing((value) => !value)} className="btn-secondary h-9 gap-2 text-xs">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
              {vectorEditing ? '收起' : '编辑'}
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <StatusRow label="开关" ok={Boolean(vectorStatus?.enabled)} value={vectorStatus?.enabled ? '启用' : '关闭'} />
            <StatusRow label="Endpoint" ok={Boolean(vectorStatus?.endpoint)} value={vectorStatus?.endpoint || '未配置'} />
            <StatusRow label="History 索引" ok={Boolean(vectorStatus?.history.exists)} value={`${vectorStatus?.history.rows ?? 0} 行`} />
            <StatusRow label="Assets 索引" ok={Boolean(vectorStatus?.assets.exists)} value={`${vectorStatus?.assets.rows ?? 0} 行`} />
          </div>
          {vectorStatus?.error && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">{vectorStatus.error}</div>}

          {vectorEditing && (
            <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="field-grid">
                <Field label="启用向量检索">
                  <select className="input" value={vectorDraft.VECTOR_ENABLED} onChange={(e) => setVectorDraft({ ...vectorDraft, VECTOR_ENABLED: e.target.value })}>
                    <option value="0">关闭</option>
                    <option value="1">启用</option>
                  </select>
                </Field>
                <Field label="Embedding 模型">
                  <input className="input" value={vectorDraft.EMBEDDING_MODEL} onChange={(e) => setVectorDraft({ ...vectorDraft, EMBEDDING_MODEL: e.target.value })} placeholder="text-embedding-3-small" />
                </Field>
              </div>
              <Field label="Zilliz Endpoint">
                <input className="input font-mono text-xs" value={vectorDraft.VECTOR_ZILLIZ_ENDPOINT} onChange={(e) => setVectorDraft({ ...vectorDraft, VECTOR_ZILLIZ_ENDPOINT: e.target.value })} placeholder="https://..." />
              </Field>
              <Field label={`Zilliz Token${vectorConfig?.VECTOR_ZILLIZ_TOKEN.isSet ? `（已设置：${vectorConfig.VECTOR_ZILLIZ_TOKEN.preview}）` : ''}`}>
                <input type="password" className="input font-mono text-xs" value={vectorDraft.VECTOR_ZILLIZ_TOKEN} onChange={(e) => setVectorDraft({ ...vectorDraft, VECTOR_ZILLIZ_TOKEN: e.target.value })} placeholder="留空则保留原值" />
              </Field>
              <Field label="Embedding Base URL">
                <input className="input font-mono text-xs" value={vectorDraft.EMBEDDING_BASE_URL} onChange={(e) => setVectorDraft({ ...vectorDraft, EMBEDDING_BASE_URL: e.target.value })} placeholder="可留空，默认走 LLM Key 池" />
              </Field>
              <Field label={`Embedding API Key${vectorConfig?.EMBEDDING_API_KEY.isSet ? `（已设置：${vectorConfig.EMBEDDING_API_KEY.preview}）` : ''}`}>
                <input type="password" className="input font-mono text-xs" value={vectorDraft.EMBEDDING_API_KEY} onChange={(e) => setVectorDraft({ ...vectorDraft, EMBEDDING_API_KEY: e.target.value })} placeholder="可留空" />
              </Field>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setVectorEditing(false)} className="btn-secondary text-xs" disabled={vectorBusy === 'save'}>取消</button>
                <button type="button" onClick={saveVector} className="btn-primary gap-2 text-xs" disabled={vectorBusy === 'save'}>
                  {vectorBusy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  保存
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <button type="button" onClick={testEmbedding} disabled={vectorBusy === 'embed-test' || !vectorStatus?.enabled} className="btn-secondary h-9 gap-2 text-xs">
              {vectorBusy === 'embed-test' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
              测试 Embedding
            </button>
            <button type="button" onClick={backfillVector} disabled={vectorBusy === 'backfill' || !vectorStatus?.enabled} className="btn-secondary h-9 gap-2 text-xs">
              {vectorBusy === 'backfill' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              全量回填
            </button>
            {embedTestResult && <span className="text-xs text-slate-500">{embedTestResult}</span>}
          </div>
        </div>

        <div className="surface p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="page-kicker">图片适配器</div>
              <h3 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">默认生成链路</h3>
            </div>
            <Link href="/adapters" className="btn-secondary h-9 text-xs">管理</Link>
          </div>
          <div className="mt-4 space-y-3">
            {adapterList.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-800">
                暂无适配器。
                <button type="button" onClick={seedAdapters} disabled={seeding} className="ml-2 font-medium text-cyan-700 hover:underline dark:text-cyan-300">
                  {seeding ? '种入中...' : '一键种入内置预设'}
                </button>
              </div>
            ) : (
              <>
                <Field label="默认图片 Adapter">
                  <select className="input" value={form.IMAGE_DEFAULT_ADAPTER} onChange={(e) => up('IMAGE_DEFAULT_ADAPTER', e.target.value)}>
                    <option value="">不使用 adapter，走兼容默认链路</option>
                    {adapterList.filter((adapter) => adapter.enabled).map((adapter) => (
                      <option key={adapter.slug} value={adapter.slug}>
                        {adapter.name} · {adapter.type === 'sync' ? '同步' : '异步轮询'}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid gap-2 sm:grid-cols-2">
                  {adapterList.slice(0, 6).map((adapter) => (
                    <div key={adapter.slug} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-800 dark:text-slate-100">{adapter.name}</span>
                        <span className={adapter.enabled ? 'badge-green' : 'badge-gray'}>{adapter.enabled ? '启用' : '停用'}</span>
                      </div>
                      <div className="mt-1 text-slate-500">{adapter.slug} · {adapter.type}</div>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={seedAdapters} disabled={seeding} className="text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-300">
                  {seeding ? '检查中...' : '检查并补齐内置预设'}
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <ConfigCard title="LLM 兼容配置" onTest={() => test('llm')} testing={testing === 'llm'}>
          <p className="text-xs leading-6 text-slate-500">
            当 API Key 池中没有可用 LLM Key 时，系统会回退到这里的兼容字段。
          </p>
          <Field label="API Base URL">
            <input className="input" value={form.LLM_API_BASE_URL} onChange={(e) => up('LLM_API_BASE_URL', e.target.value)} placeholder="https://api.openai.com/v1" />
          </Field>
          {renderSecretField('LLM_API_KEY', 'API Key', hasEnvLLMKey)}
          <Field label="模型名称">
            <input className="input" value={form.LLM_MODEL} onChange={(e) => up('LLM_MODEL', e.target.value)} placeholder="gpt-4o-mini" />
          </Field>
        </ConfigCard>

        <ConfigCard title="图片兼容配置" onTest={() => test('image')} testing={testing === 'image'}>
          <p className="text-xs leading-6 text-slate-500">
            当未选择 adapter 且图片 Key 池没有可用 Key 时，系统会回退到这里。
          </p>
          <Field label="API Base URL">
            <input className="input" value={form.IMAGE_API_BASE_URL} onChange={(e) => up('IMAGE_API_BASE_URL', e.target.value)} placeholder="https://api.openai.com/v1" />
          </Field>
          {renderSecretField('IMAGE_API_KEY', 'API Key', hasEnvImageKey)}
          <Field label="模型名称">
            <input className="input" value={form.IMAGE_MODEL} onChange={(e) => up('IMAGE_MODEL', e.target.value)} placeholder="gpt-image-2" />
          </Field>
        </ConfigCard>
      </section>

      <section className="surface p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="page-kicker">市场平台</div>
            <h3 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">平台信息</h3>
          </div>
          <button type="button" onClick={refreshPlatforms} disabled={platformsLoading} className="btn-secondary h-9 gap-2 text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${platformsLoading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
        {platformsErr && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{platformsErr}</div>}
        <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
          {platforms.map((platform) => (
            <div key={platform.slug} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span aria-hidden>{platform.icon}</span>
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{platform.name}</span>
                  <span className="font-mono text-xs text-slate-400">{platform.slug}</span>
                </div>
                <div className="mt-1 truncate text-xs text-slate-500">{platform.tagline}</div>
              </div>
              <button type="button" onClick={() => setEditingPlatform(platform)} className="btn-secondary h-8 shrink-0 text-xs">
                编辑
              </button>
            </div>
          ))}
          {!platformsLoading && platforms.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-500">暂无平台数据。</div>
          )}
        </div>
      </section>

      <section className="surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-6 text-slate-500">
            保存会写入数据库 Setting 表。API Key 池优先级高于本页兼容字段。
          </p>
          <button type="button" onClick={save} disabled={saving} className="btn-primary gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存设置
          </button>
        </div>
      </section>

      {drawerOpen && (
        <KeyDrawer
          draft={draft}
          editMode={draftEditMode}
          saving={draftSaving}
          onChange={setDraft}
          onClose={() => setDrawerOpen(false)}
          onSave={saveDraft}
        />
      )}

      {editingPlatform && (
        <PlatformEditModal
          open={Boolean(editingPlatform)}
          slug={editingPlatform.slug as PlatformSlug}
          current={editingPlatform}
          onClose={() => setEditingPlatform(null)}
          onSaved={(next) => {
            setPlatforms((list) => list.map((item) => (item.slug === next.slug ? next : item)));
          }}
        />
      )}
    </div>
  );

  function renderSecretField(key: 'LLM_API_KEY' | 'IMAGE_API_KEY', label: string, envSet: boolean) {
    const meta = secretMeta[key];
    const editing = Boolean(editingKey[key]);
    if (!editing) {
      return (
        <Field label={label}>
          <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600 dark:text-slate-300">
              {meta?.isSet ? `数据库已设置，长度 ${meta.length}` : envSet ? '环境变量已设置' : '未设置'}
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingKey((current) => ({ ...current, [key]: true }));
                setForm((current) => ({ ...current, [key]: '' }));
              }}
              className="btn-secondary h-8 text-xs"
            >
              更新密钥
            </button>
          </div>
        </Field>
      );
    }
    return (
      <Field label={label}>
        <div className="flex gap-2">
          <input
            type="password"
            className="input"
            autoComplete="new-password"
            value={form[key]}
            onChange={(e) => up(key, e.target.value)}
            placeholder="输入新密钥"
          />
          <button
            type="button"
            onClick={() => {
              setEditingKey((current) => ({ ...current, [key]: false }));
              setForm((current) => ({ ...current, [key]: '' }));
            }}
            className="btn-secondary shrink-0 text-xs"
          >
            取消
          </button>
        </div>
      </Field>
    );
  }
}

function PoolSection({
  title,
  rows,
  busyId,
  onEdit,
  onTest,
  onQuota,
  onPromote,
  onToggle,
  onDelete,
}: {
  title: string;
  rows: PoolKey[];
  busyId: string | null;
  onEdit: (row: PoolKey) => void;
  onTest: (id: string) => void;
  onQuota: (id: string, label: string) => void;
  onPromote: (id: string) => void;
  onToggle: (row: PoolKey) => void;
  onDelete: (id: string, label: string) => void;
}) {
  return (
    <div className="bg-white p-4 dark:bg-slate-950">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-slate-950 dark:text-white">{title}</h4>
        <span className="text-xs text-slate-400">{rows.length} 条</span>
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{row.label}</span>
                  <span className={row.active ? 'badge-green' : 'badge-gray'}>{row.active ? '启用' : '停用'}</span>
                  {row.lastError && <span className="badge-yellow">有错误</span>}
                </div>
                <div className="mt-1 truncate font-mono text-xs text-slate-500">{maskUrl(row.baseUrl)} · {row.model}</div>
                <div className="mt-1 text-xs text-slate-400">优先级 {row.priority} · 请求 {row.totalRequests} · 错误 {row.totalErrors}</div>
                {row.lastError && <div className="mt-2 line-clamp-2 text-xs text-amber-700 dark:text-amber-300">{row.lastError}</div>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <SmallButton onClick={() => onEdit(row)} label="编辑" />
                <SmallButton onClick={() => onTest(row.id)} label={busyId === row.id ? '测试中' : '测试'} disabled={busyId === row.id} />
                <SmallButton onClick={() => onQuota(row.id, row.label)} label="额度" disabled={busyId === row.id} />
                <SmallButton onClick={() => onPromote(row.id)} label="置顶" icon={<ArrowUp className="h-3 w-3" />} disabled={busyId === row.id} />
                <SmallButton onClick={() => onToggle(row)} label={row.active ? '停用' : '启用'} disabled={busyId === row.id} />
                <button type="button" onClick={() => onDelete(row.id, row.label)} disabled={busyId === row.id} className="inline-flex h-8 items-center justify-center rounded-md border border-red-200 px-2 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950">
                  <Trash2 className="h-3 w-3" aria-hidden />
                </button>
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-800">
            暂无 Key。
          </div>
        )}
      </div>
    </div>
  );
}

function KeyDrawer({
  draft,
  editMode,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  draft: DraftKey;
  editMode: boolean;
  saving: boolean;
  onChange: (draft: DraftKey) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  function up<K extends keyof DraftKey>(key: K, value: DraftKey[K]) {
    onChange({ ...draft, [key]: value });
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto flex h-full w-full max-w-[560px] flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <div className="page-kicker">{editMode ? '编辑 Key' : '新增 Key'}</div>
            <h3 className="mt-1 font-semibold text-slate-950 dark:text-white">{editMode ? '更新 API Key' : '新增 API Key'}</h3>
          </div>
          <button type="button" onClick={onClose} className="tap-target-sm inline-flex w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="关闭">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          <Field label="类型">
            <select className="input" value={draft.provider} onChange={(e) => up('provider', e.target.value === 'image' ? 'image' : 'llm')}>
              <option value="llm">LLM 文案</option>
              <option value="image">图片生成</option>
            </select>
          </Field>
          <Field label="名称">
            <input className="input" value={draft.label} onChange={(e) => up('label', e.target.value)} placeholder="例如：主用 / 备用 / 低价中转" />
          </Field>
          <Field label="Base URL">
            <input className="input font-mono text-xs" value={draft.baseUrl} onChange={(e) => up('baseUrl', e.target.value)} placeholder="https://api.example.com/v1" />
          </Field>
          <Field label={editMode ? 'API Key（留空保留原值）' : 'API Key'}>
            <input type="password" className="input font-mono text-xs" autoComplete="new-password" value={draft.apiKey} onChange={(e) => up('apiKey', e.target.value)} placeholder="sk-..." />
          </Field>
          <Field label="模型">
            <input className="input" value={draft.model} onChange={(e) => up('model', e.target.value)} placeholder="gpt-4o-mini / gpt-image-2" />
          </Field>
          <div className="field-grid">
            <Field label="优先级">
              <input type="number" className="input" value={draft.priority} onChange={(e) => up('priority', Number(e.target.value) || 0)} />
            </Field>
            <Field label="状态">
              <select className="input" value={draft.active ? '1' : '0'} onChange={(e) => up('active', e.target.value === '1')}>
                <option value="1">启用</option>
                <option value="0">停用</option>
              </select>
            </Field>
          </div>
          <Field label="备注">
            <textarea className="input" rows={3} value={draft.notes} onChange={(e) => up('notes', e.target.value)} placeholder="额度、用途或限制说明" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
          <button type="button" onClick={onClose} className="btn-secondary text-sm" disabled={saving}>取消</button>
          <button type="button" onClick={onSave} className="btn-primary gap-2 text-sm" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {editMode ? '更新' : '新增'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfigCard({ title, children, onTest, testing }: { title: string; children: ReactNode; onTest: () => void; testing: boolean }) {
  return (
    <div className="surface p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-cyan-600" aria-hidden />
          <h3 className="text-lg font-semibold text-slate-950 dark:text-white">{title}</h3>
        </div>
        <button type="button" onClick={onTest} disabled={testing} className="btn-secondary h-9 gap-2 text-xs">
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
          测试
        </button>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function DarkMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.06] p-3">
      <div className="text-2xl font-semibold tabular-nums text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{label}</div>
    </div>
  );
}

function StatusRow({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</div>
        <div className="mt-0.5 truncate text-xs text-slate-500">{value}</div>
      </div>
      {ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <CircleAlert className="h-4 w-4 shrink-0 text-amber-500" />}
    </div>
  );
}

function SmallButton({ label, onClick, disabled, icon }: { label: string; onClick: () => void; disabled?: boolean; icon?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900">
      {icon}
      {label}
    </button>
  );
}

function maskUrl(url: string): string {
  if (!url) return '';
  return url.replace(/^https?:\/\/([^/]+).*$/, 'https://$1');
}

function formatMoney(value: number | undefined | null) {
  if (typeof value !== 'number') return '-';
  return `$${value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`;
}
