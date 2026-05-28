'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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

/** 脱敏后的 key 字段元信息（v0.8 Batch 1 / B1.7） */
interface SecretMeta {
  isSet: boolean;
  length: number;
}

/** v0.11 B1 · API Key 池条目（GET 已脱敏，apiKey:'' + isSet/length）*/
interface PoolKey {
  id: string;
  provider: 'llm' | 'image';
  label: string;
  baseUrl: string;
  apiKey: string;       // 永远 ''
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
  apiKey: string;       // 用户编辑时输入新值；编辑模式下空字符串=保留原值
  model: string;
  active: boolean;
  priority: number;
  notes: string;
}

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

// v0.11 B15.2 · IMAGE 池占位备用 key 标签关键字（用于 UI 提示判定）
const B15_2_PLACEHOLDER_LABEL_HINT = 'v0.11 B15.2 占位';
const B15_2_PLACEHOLDER_API_KEY = 'PLACEHOLDER_REPLACE_BY_USER';

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

  // v0.14-z63: Zilliz / Embedding 配置
  type VectorMaskedSecret = { isSet: boolean; preview: string; length: number };
  type VectorConfig = {
    VECTOR_ENABLED: string;
    VECTOR_ZILLIZ_ENDPOINT: string;
    VECTOR_ZILLIZ_TOKEN: VectorMaskedSecret;
    EMBEDDING_BASE_URL: string;
    EMBEDDING_API_KEY: VectorMaskedSecret;
    EMBEDDING_MODEL: string;
  };
  const [vectorConfig, setVectorConfig] = useState<VectorConfig | null>(null);
  const [vectorStatus, setVectorStatus] = useState<{
    enabled: boolean;
    endpoint: string;
    history: { exists: boolean; rows: number };
    assets: { exists: boolean; rows: number };
    error?: string;
  } | null>(null);
  const [vectorEditing, setVectorEditing] = useState(false);
  const [vectorDraft, setVectorDraft] = useState({
    VECTOR_ENABLED: '0',
    VECTOR_ZILLIZ_ENDPOINT: '',
    VECTOR_ZILLIZ_TOKEN: '',
    EMBEDDING_BASE_URL: '',
    EMBEDDING_API_KEY: '',
    EMBEDDING_MODEL: '',
  });
  const [vectorBusy, setVectorBusy] = useState<'save' | 'embed-test' | 'backfill' | null>(null);
  const [embedTestResult, setEmbedTestResult] = useState<string>('');
  const [testing, setTesting] = useState<'llm' | 'image' | null>(null);

  // === v0.11 B1 · API Key 池 ===
  const [pool, setPool] = useState<PoolKey[]>([]);

  // v0.14-z41: 余额自动加载
  const [balanceMap, setBalanceMap] = useState<Record<string, {
    status: 'loading' | 'ok' | 'error';
    remainingUsd?: number;
    totalUsd?: number;
    plan?: string;
    error?: string;
    fetchedAt?: number;
  }>>({});
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolErr, setPoolErr] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState<DraftKey>(EMPTY_DRAFT);
  const [draftEditMode, setDraftEditMode] = useState(false); // false=新建 true=编辑
  const [keyBusy, setKeyBusy] = useState<string | null>(null); // 行上正在跑的操作 id
  const [draftSaving, setDraftSaving] = useState(false);

  // === v0.11 B15.6 · 市场平台编辑 ===
  const [platforms, setPlatforms] = useState<PlatformInfoLite[]>([]);
  const [platformsLoading, setPlatformsLoading] = useState(false);
  const [platformsErr, setPlatformsErr] = useState<string | null>(null);
  const [editingPlatform, setEditingPlatform] = useState<PlatformInfoLite | null>(null);

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
  useEffect(() => {
    void refreshPool();
  }, []);

  // v0.14-z63: 拉 vector 配置 + 状态
  async function refreshVector() {
    try {
      const [cfgRes, stRes] = await Promise.all([
        fetch('/api/vector/config', { cache: 'no-store' }),
        fetch('/api/vector/status', { cache: 'no-store' }),
      ]);
      const cfg = await cfgRes.json();
      const st = await stRes.json();
      if (cfg.ok) setVectorConfig(cfg.config);
      if (st.ok) setVectorStatus(st);
      else setVectorStatus({ enabled: false, endpoint: '', history: { exists: false, rows: 0 }, assets: { exists: false, rows: 0 }, error: st.error });
    } catch (e) {
      // ignore
    }
  }
  useEffect(() => {
    void refreshVector();
  }, []);

  async function saveVector() {
    setVectorBusy('save');
    try {
      const body: any = {
        VECTOR_ENABLED: vectorDraft.VECTOR_ENABLED,
        VECTOR_ZILLIZ_ENDPOINT: vectorDraft.VECTOR_ZILLIZ_ENDPOINT,
        EMBEDDING_BASE_URL: vectorDraft.EMBEDDING_BASE_URL,
        EMBEDDING_MODEL: vectorDraft.EMBEDDING_MODEL,
      };
      if (vectorDraft.VECTOR_ZILLIZ_TOKEN.trim()) body.VECTOR_ZILLIZ_TOKEN = vectorDraft.VECTOR_ZILLIZ_TOKEN;
      if (vectorDraft.EMBEDDING_API_KEY.trim()) body.EMBEDDING_API_KEY = vectorDraft.EMBEDDING_API_KEY;
      const r = await fetch('/api/vector/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || '失败');
      toast.success(`保存了 ${j.updated} 项配置`);
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
      const r = await fetch('/api/vector/embed-test', { method: 'POST' });
      const j = await r.json();
      if (!j.ok) {
        setEmbedTestResult('❌ ' + (j.error || '失败'));
        toast.error('embedding 测试失败');
      } else {
        setEmbedTestResult(`✓ 通 · 维度 ${j.dimension}`);
        toast.success(`embedding 测试通过：${j.dimension} 维`);
      }
    } catch (e) {
      setEmbedTestResult('❌ ' + (e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setVectorBusy(null);
    }
  }

  async function backfillVector() {
    if (!confirm('开始把 AIOutput + Asset 全量索引到 Zilliz？\n会消耗 LLM key embedding 额度（每条约 0.0001 USD）。')) return;
    setVectorBusy('backfill');
    try {
      const r = await fetch('/api/vector/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'all', batch: 50 }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || '失败');
      toast.success(`回填完成：history ${j.history.ok}/${j.history.processed}，assets ${j.assets.ok}/${j.assets.processed}`);
      await refreshVector();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setVectorBusy(null);
    }
  }

  // v0.14-z41: pool 变化时自动加载每条 active KEY 的余额（5min cached）
  useEffect(() => {
    const STALE_MS = 5 * 60 * 1000;
    const now = Date.now();
    for (const r of pool) {
      if (!r.id || !r.active) continue;
      const cur = balanceMap[r.id];
      if (cur && cur.fetchedAt && now - cur.fetchedAt < STALE_MS) continue;
      if (cur && cur.status === 'loading') continue;
      setBalanceMap((m) => ({ ...m, [r.id]: { status: 'loading' } }));
      fetch(`/api/settings/keys/${r.id}/quota`, { method: 'POST' })
        .then((res) => res.json())
        .then((j) => {
          if (j.ok && j.quota) {
            setBalanceMap((m) => ({
              ...m,
              [r.id]: {
                status: 'ok',
                remainingUsd: j.quota.remainingUsd,
                totalUsd: j.quota.totalUsd,
                plan: j.quota.plan,
                fetchedAt: Date.now(),
              },
            }));
          } else {
            setBalanceMap((m) => ({
              ...m,
              [r.id]: { status: 'error', error: j.error || '查询失败', fetchedAt: Date.now() },
            }));
          }
        })
        .catch((e) => {
          setBalanceMap((m) => ({
            ...m,
            [r.id]: { status: 'error', error: (e as Error).message, fetchedAt: Date.now() },
          }));
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool]);

  // v0.11 B15.6 · 拉 PlatformInfo 列表（用于「市场平台」卡片）
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
    void refreshPlatforms();
  }, []);

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
      apiKey: '', // 编辑时空 = 保留原值
      model: row.model,
      active: row.active,
      priority: row.priority,
      notes: row.notes ?? '',
    });
    setDraftEditMode(true);
    setDrawerOpen(true);
  }
  function closeDrawer() {
    setDrawerOpen(false);
  }

  async function saveDraft() {
    if (!draft.label.trim()) return toast.error('请填 label');
    if (!draft.baseUrl.trim()) return toast.error('请填 baseUrl');
    if (!draft.model.trim()) return toast.error('请填 model');
    if (!draftEditMode && !draft.apiKey.trim()) return toast.error('请填 apiKey');

    setDraftSaving(true);
    try {
      let res: Response;
      if (draftEditMode && draft.id) {
        // PUT：apiKey 留空表示保留原值
        const payload: Record<string, unknown> = {
          provider: draft.provider,
          label: draft.label,
          baseUrl: draft.baseUrl,
          model: draft.model,
          active: draft.active,
          priority: draft.priority,
          notes: draft.notes,
        };
        if (draft.apiKey.trim() !== '') payload.apiKey = draft.apiKey;
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
      toast.success(draftEditMode ? '已更新' : '已新增');
      closeDrawer();
      await refreshPool();
    } catch (e) {
      toast.error('保存失败：' + (e as Error).message);
    } finally {
      setDraftSaving(false);
    }
  }

  async function testKey(id: string) {
    setKeyBusy(id);
    try {
      const res = await fetch(`/api/settings/keys/${id}/test`, { method: 'POST' });
      const j = await res.json();
      if (j.ok) toast.success(j.message || '连通性 OK');
      else toast.error(j.error || '连通性失败');
      await refreshPool();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setKeyBusy(null);
    }
  }

  // v0.16: 查询某条 key 的余额 / 额度
  async function quotaKey(id: string, label: string) {
    setKeyBusy(id);
    try {
      const res = await fetch(`/api/settings/keys/${id}/quota`, { method: 'POST' });
      const j = await res.json();
      if (!j.ok) {
        toast.error(j.error || '额度查询失败');
        return;
      }
      const q = j.quota || {};
      const fmt = (n: number | undefined | null) =>
        typeof n === 'number' ? '$' + n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : '—';
      const lines: string[] = [];
      lines.push(`Key: ${label}`);
      if (q.plan) lines.push(`计划: ${q.plan}`);
      lines.push(`总额度: ${fmt(q.totalUsd)}`);
      lines.push(`已使用: ${fmt(q.usedUsd)}`);
      lines.push(`剩余: ${fmt(q.remainingUsd)}`);
      if (q.expired) lines.push('⚠️ 已过期');
      lines.push(`端点: ${q.endpoint}`);
      if (j.lastError) lines.push(`\n最近上游错误: ${j.lastError}`);
      const msg = lines.join('\n');
      // 同时弹 toast（短摘要）+ 控制台日志（完整 raw）
      const short =
        q.remainingUsd != null
          ? `剩余 ${fmt(q.remainingUsd)}` + (q.totalUsd ? ` / 总 ${fmt(q.totalUsd)}` : '')
          : (q.plan || '已查到');
      toast.success(`「${label}」额度: ${short}`);
      // eslint-disable-next-line no-console
      console.log('[quota]', label, q);
      // 浏览器原生确认框承载完整信息（不依赖额外 modal 组件）
      if (typeof window !== 'undefined') window.alert(msg);
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
      if (!res.ok || !j.ok) throw new Error(j.error || '失败');
      toast.success(`已置顶（priority=${j.priority}）`);
      await refreshPool();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setKeyBusy(null);
    }
  }
  async function deleteKey(id: string, label: string) {
    if (!confirm(`确认删除 key「${label}」？此操作不可恢复。`)) return;
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
      if (!res.ok || !j.ok) throw new Error(j.error || '失败');
      toast.success(row.active ? '已停用' : '已启用（错误计数已重置）');
      await refreshPool();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setKeyBusy(null);
    }
  }

  function maskUrl(u: string): string {
    if (!u) return '';
    return u.replace(/^https?:\/\/([^/]+).*$/, 'https://$1');
  }

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
    // v0.12 任务1：用户要求所有字段（含 KEY）明文显示，不再脱敏
    return (
      <Field label={label}>
        <input
          type="text"
          className="input font-mono text-xs"
          autoComplete="off"
          spellCheck={false}
          value={form[k]}
          onChange={(e) => up(k, e.target.value)}
          placeholder={fallbackEnv ? '已从 .env 读取（如需修改请在此填写）' : 'sk-...'}
        />
        {!form[k] && fallbackEnv && (
          <p className="text-xs text-slate-400 mt-1">.env 中已配置，留空则使用 .env。</p>
        )}
      </Field>
    );
  }


  /**
   * v0.14-z50: 判断一条 KEY 是否走 OpenAI 兼容协议
   * 启发式：baseUrl 路径含 /v1，或域名是已知 OpenAI 兼容中转站
   */
  function isOpenAICompat(row: PoolKey): boolean {
    const u = row.baseUrl?.toLowerCase() || '';
    if (!u) return false;
    if (u.includes('/v1')) return true;
    const host = (() => {
      try { return new URL(u).hostname; } catch { return ''; }
    })();
    if (!host) return false;
    const KNOWN = [
      'api.openai.com',
      'cometapi.com',
      'kie.ai',
      '4router.net',
      'do-ai.run',
      'inference.do-ai.run',
      'openrouter.ai',
      'groq.com',
      'deepseek.com',
      'siliconflow.cn',
      'aliyuncs.com', // 阿里云通义
      'volces.com',   // 火山引擎
      'moonshot.cn',
      'aliyun.com',
    ];
    return KNOWN.some((d) => host === d || host.endsWith('.' + d));
  }

  /**
   * v0.14-z50: 把 KEY 按"OpenAI 兼容"vs"自定义" 分组
   */
  function groupByCompat(items: PoolKey[]): { compat: PoolKey[]; other: PoolKey[] } {
    const compat: PoolKey[] = [];
    const other: PoolKey[] = [];
    for (const r of items) {
      if (isOpenAICompat(r)) compat.push(r);
      else other.push(r);
    }
    return { compat, other };
  }

    // === API Key 池小组件 ===
  function PoolTable({ provider }: { provider: 'llm' | 'image' }) {
    const rows = pool.filter((r) => r.provider === provider);
    return (
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>label</th>
              <th>baseUrl</th>
              <th>model</th>
              <th>apiKey（明文）</th>
              <th>priority</th>
              <th>状态</th>
              <th>统计</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-slate-400 py-6">
                  暂无 {provider === 'llm' ? 'LLM' : 'IMAGE'} key，
                  <button onClick={() => openCreate(provider)} className="text-brand-600 hover:underline">
                    新增第一条
                  </button>
                </td>
              </tr>
            )}
            {(() => {
              const grouped = groupByCompat(rows);
              return (
                <>
                  {grouped.compat.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={8} className="bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                          🔌 OpenAI 兼容协议（{grouped.compat.length}）
                        </td>
                      </tr>
                      {grouped.compat.map((r) => (
                        <tr key={r.id} className={r.active ? '' : 'opacity-60'}>
                <td>
                  <div className="font-medium">{r.label}</div>
                  {r.notes ? <div className="text-xs text-slate-400">{r.notes}</div> : null}
                </td>
                <td className="text-xs font-mono">{maskUrl(r.baseUrl)}</td>
                <td className="text-xs font-mono">{r.model}</td>
                <td className="text-xs font-mono break-all max-w-[280px]">{r.apiKey || '(空)'}</td>
                <td>{r.priority}</td>
                <td>
                  {r.active ? (
                    <span className="badge-green">active</span>
                  ) : (
                    <span className="badge-gray">disabled</span>
                  )}
                  {r.consecutiveErrors > 0 && (
                    <span className="badge-red ml-1">连错 {r.consecutiveErrors}</span>
                  )}
                  {r.lastError ? (
                    <div className="text-xs text-red-500 mt-1 max-w-[260px] truncate" title={r.lastError}>
                      {r.lastError}
                    </div>
                  ) : null}
                  {/* v0.14-z41 余额徽章 */}
                  {(() => {
                    const b = balanceMap[r.id];
                    if (!b) return null;
                    if (b.status === 'loading') {
                      return <div className="text-xs text-slate-400 mt-1">余额查询中...</div>;
                    }
                    if (b.status === 'error') {
                      return (
                        <div className="text-xs text-slate-400 mt-1" title={b.error}>
                          余额: 不可查
                        </div>
                      );
                    }
                    const r2 = b.remainingUsd;
                    const tone =
                      r2 == null ? 'badge-gray'
                      : r2 < 0 ? 'badge-red'
                      : r2 < 1 ? 'badge-yellow'
                      : 'badge-green';
                    const label =
                      r2 == null ? (b.plan || '账户活跃')
                      : r2 < 0 ? `透支 $${r2.toFixed(2)}`
                      : `剩余 $${r2.toFixed(2)}` + (b.totalUsd ? ` / $${b.totalUsd.toFixed(2)}` : '');
                    return (
                      <span className={`badge ${tone} mt-1 text-[10px]`} title={b.plan}>
                        {label}
                      </span>
                    );
                  })()}
                </td>
                <td className="text-xs text-slate-500">
                  {r.totalRequests} 次 / 错 {r.totalErrors}
                  {r.lastUsedAt ? (
                    <div className="text-xs text-slate-400">
                      最近：{new Date(r.lastUsedAt).toLocaleString('zh-CN', { hour12: false })}
                    </div>
                  ) : null}
                </td>
                <td className="text-right whitespace-nowrap">
                  <button
                    disabled={keyBusy === r.id}
                    onClick={() => openEdit(r)}
                    className="text-xs text-brand-600 hover:underline disabled:opacity-40 mr-2"
                  >
                    编辑
                  </button>
                  <button
                    disabled={keyBusy === r.id}
                    onClick={() => testKey(r.id)}
                    className="text-xs text-brand-600 hover:underline disabled:opacity-40 mr-2"
                  >
                    测试
                  </button>
                  <button
                    disabled={keyBusy === r.id}
                    onClick={() => quotaKey(r.id, r.label)}
                    className="text-xs text-emerald-600 hover:underline disabled:opacity-40 mr-2"
                    title="查询上游中转站余额"
                  >
                    额度
                  </button>
                  <button
                    disabled={keyBusy === r.id}
                    onClick={() => promoteKey(r.id)}
                    className="text-xs text-brand-600 hover:underline disabled:opacity-40 mr-2"
                  >
                    置顶
                  </button>
                  <button
                    disabled={keyBusy === r.id}
                    onClick={() => toggleActive(r)}
                    className="text-xs text-slate-600 hover:underline disabled:opacity-40 mr-2"
                  >
                    {r.active ? '停用' : '启用'}
                  </button>
                  <button
                    disabled={keyBusy === r.id}
                    onClick={() => deleteKey(r.id, r.label)}
                    className="text-xs text-red-600 hover:underline disabled:opacity-40"
                  >
                    删除
                  </button>
                </td>
              </tr>
                      ))}
                    </>
                  )}
                  {grouped.other.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={8} className="bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                          🏷️ 自定义中转站（{grouped.other.length}）
                        </td>
                      </tr>
                      {grouped.other.map((r) => (
                        <tr key={r.id} className={r.active ? '' : 'opacity-60'}>
                <td>
                  <div className="font-medium">{r.label}</div>
                  {r.notes ? <div className="text-xs text-slate-400">{r.notes}</div> : null}
                </td>
                <td className="text-xs font-mono">{maskUrl(r.baseUrl)}</td>
                <td className="text-xs font-mono">{r.model}</td>
                <td className="text-xs font-mono break-all max-w-[280px]">{r.apiKey || '(空)'}</td>
                <td>{r.priority}</td>
                <td>
                  {r.active ? (
                    <span className="badge-green">active</span>
                  ) : (
                    <span className="badge-gray">disabled</span>
                  )}
                  {r.consecutiveErrors > 0 && (
                    <span className="badge-red ml-1">连错 {r.consecutiveErrors}</span>
                  )}
                  {r.lastError ? (
                    <div className="text-xs text-red-500 mt-1 max-w-[260px] truncate" title={r.lastError}>
                      {r.lastError}
                    </div>
                  ) : null}
                  {/* v0.14-z41 余额徽章 */}
                  {(() => {
                    const b = balanceMap[r.id];
                    if (!b) return null;
                    if (b.status === 'loading') {
                      return <div className="text-xs text-slate-400 mt-1">余额查询中...</div>;
                    }
                    if (b.status === 'error') {
                      return (
                        <div className="text-xs text-slate-400 mt-1" title={b.error}>
                          余额: 不可查
                        </div>
                      );
                    }
                    const r2 = b.remainingUsd;
                    const tone =
                      r2 == null ? 'badge-gray'
                      : r2 < 0 ? 'badge-red'
                      : r2 < 1 ? 'badge-yellow'
                      : 'badge-green';
                    const label =
                      r2 == null ? (b.plan || '账户活跃')
                      : r2 < 0 ? `透支 $${r2.toFixed(2)}`
                      : `剩余 $${r2.toFixed(2)}` + (b.totalUsd ? ` / $${b.totalUsd.toFixed(2)}` : '');
                    return (
                      <span className={`badge ${tone} mt-1 text-[10px]`} title={b.plan}>
                        {label}
                      </span>
                    );
                  })()}
                </td>
                <td className="text-xs text-slate-500">
                  {r.totalRequests} 次 / 错 {r.totalErrors}
                  {r.lastUsedAt ? (
                    <div className="text-xs text-slate-400">
                      最近：{new Date(r.lastUsedAt).toLocaleString('zh-CN', { hour12: false })}
                    </div>
                  ) : null}
                </td>
                <td className="text-right whitespace-nowrap">
                  <button
                    disabled={keyBusy === r.id}
                    onClick={() => openEdit(r)}
                    className="text-xs text-brand-600 hover:underline disabled:opacity-40 mr-2"
                  >
                    编辑
                  </button>
                  <button
                    disabled={keyBusy === r.id}
                    onClick={() => testKey(r.id)}
                    className="text-xs text-brand-600 hover:underline disabled:opacity-40 mr-2"
                  >
                    测试
                  </button>
                  <button
                    disabled={keyBusy === r.id}
                    onClick={() => quotaKey(r.id, r.label)}
                    className="text-xs text-emerald-600 hover:underline disabled:opacity-40 mr-2"
                    title="查询上游中转站余额"
                  >
                    额度
                  </button>
                  <button
                    disabled={keyBusy === r.id}
                    onClick={() => promoteKey(r.id)}
                    className="text-xs text-brand-600 hover:underline disabled:opacity-40 mr-2"
                  >
                    置顶
                  </button>
                  <button
                    disabled={keyBusy === r.id}
                    onClick={() => toggleActive(r)}
                    className="text-xs text-slate-600 hover:underline disabled:opacity-40 mr-2"
                  >
                    {r.active ? '停用' : '启用'}
                  </button>
                  <button
                    disabled={keyBusy === r.id}
                    onClick={() => deleteKey(r.id, r.label)}
                    className="text-xs text-red-600 hover:underline disabled:opacity-40"
                  >
                    删除
                  </button>
                </td>
              </tr>
                      ))}
                    </>
                  )}
                </>
              );
            })()}
          </tbody>
        </table>
      </div>
    );
  }

  // v0.11 B15.2 · 是否检测到 IMAGE 池中存在「占位备用 KIE key」
  // 以 label 含特定关键字 + active=false 双条件判定，避免误伤用户自建行
  const b15_2_placeholderRow =
    pool.find(
      (r) =>
        r.provider === 'image' &&
        !r.active &&
        (r.label || '').includes(B15_2_PLACEHOLDER_LABEL_HINT),
    ) || null;

  return (
    <div className="space-y-6">
      {/* v0.11 B1 · API Keys 池（顶到顶部） */}
      <div className="card border-brand-200 dark:border-brand-800">
        <div className="card-header bg-brand-50/50 dark:bg-brand-900/20 flex-wrap gap-2">
          <h2 className="font-semibold flex items-center gap-2">
            <span>🔑</span>
            <span>API Keys 池</span>
            <span className="text-xs text-slate-400 font-normal">v0.11 B1</span>
          </h2>
          <div className="text-xs text-slate-500">
            按 priority 升序选取 active=true 的 key。失败连续 3 次自动停用，下次取下一条。
          </div>
        </div>
        <div className="card-body space-y-6">
          {poolErr && (
            <div className="text-sm text-red-600">{poolErr}</div>
          )}

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">LLM 文案 keys</h3>
              <button
                onClick={() => openCreate('llm')}
                className="btn-primary text-xs px-3 py-1.5"
              >
                新增 LLM key
              </button>
            </div>
            <PoolTable provider="llm" />
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">IMAGE 出图 keys</h3>
              <button
                onClick={() => openCreate('image')}
                className="btn-primary text-xs px-3 py-1.5"
              >
                新增 IMAGE key
              </button>
            </div>

            {/* v0.11 B15.2 · IMAGE 池占位备用 key 提示 */}
            {b15_2_placeholderRow && (
              <div
                data-b15-2-image-placeholder-hint=""
                className="mb-2 rounded border border-violet-200 dark:border-violet-700/40 bg-violet-50/40 dark:bg-violet-900/10 p-2.5 text-xs text-violet-800 dark:text-violet-200 leading-relaxed"
              >
                <div className="font-medium mb-1">💡 v0.11 B15.2：IMAGE 池有备用占位 key</div>
                <div>
                  系统已为你预留一条 KIE 备用 key（label「{b15_2_placeholderRow.label}」，
                  当前 <span className="font-mono">active=false</span>），未填实际值前不会被使用。
                  当主用 4router key 连续失败被自动停用后，系统会按 <span className="font-mono">priority</span> 升序回退到这一条。
                  点该行的「编辑」把 <span className="font-mono">apiKey</span> 替换成真实 KIE key、再点「启用」即可激活备用通道。
                </div>
              </div>
            )}

            <PoolTable provider="image" />
          </section>

          {poolLoading && (
            <div className="text-xs text-slate-400">刷新中…</div>
          )}
        </div>
      </div>

      {/* 新增 / 编辑抽屉 */}
      {drawerOpen && (

      
        <KeyDrawer
          draft={draft}
          editMode={draftEditMode}
          saving={draftSaving}
          onChange={setDraft}
          onClose={closeDrawer}
          onSave={saveDraft}
        />
      )}

      {/* v0.14-z63: Zilliz 向量数据库配置 + 状态 */}
      <section className="card-elevated p-4 sm:p-5">
        <header className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div>
            <h2 className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-2">
              <span>🧠</span>
              <span>向量数据库 (Zilliz)</span>
              {vectorStatus?.enabled ? (
                <span className="badge badge-green text-[10px]">已启用</span>
              ) : (
                <span className="badge badge-gray text-[10px]">未启用</span>
              )}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              语义检索 / 图片搜索 / 历史召回。配置 Zilliz Cloud 端点 + embedding 调用 key。
            </p>
          </div>
          {!vectorEditing && (
            <button
              type="button"
              onClick={() => {
                setVectorDraft({
                  VECTOR_ENABLED: vectorConfig?.VECTOR_ENABLED || '0',
                  VECTOR_ZILLIZ_ENDPOINT: vectorConfig?.VECTOR_ZILLIZ_ENDPOINT || '',
                  VECTOR_ZILLIZ_TOKEN: '',
                  EMBEDDING_BASE_URL: vectorConfig?.EMBEDDING_BASE_URL || '',
                  EMBEDDING_API_KEY: '',
                  EMBEDDING_MODEL: vectorConfig?.EMBEDDING_MODEL || '',
                });
                setVectorEditing(true);
              }}
              className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
            >
              编辑 →
            </button>
          )}
        </header>

        {vectorStatus && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3 text-xs">
            <div className="border border-slate-200 dark:border-slate-700 rounded-md p-2">
              <div className="text-slate-500 dark:text-slate-400">Endpoint</div>
              <div className="font-mono text-[10px] truncate text-slate-800 dark:text-slate-200" title={vectorStatus.endpoint}>
                {vectorStatus.endpoint || '(未配置)'}
              </div>
            </div>
            <div className="border border-slate-200 dark:border-slate-700 rounded-md p-2">
              <div className="text-slate-500 dark:text-slate-400">dao_history</div>
              <div className={vectorStatus.history.exists ? 'text-emerald-600 dark:text-emerald-400 font-mono' : 'text-slate-400 font-mono'}>
                {vectorStatus.history.exists ? `${vectorStatus.history.rows} 条` : '(不存在)'}
              </div>
            </div>
            <div className="border border-slate-200 dark:border-slate-700 rounded-md p-2">
              <div className="text-slate-500 dark:text-slate-400">dao_assets</div>
              <div className={vectorStatus.assets.exists ? 'text-emerald-600 dark:text-emerald-400 font-mono' : 'text-slate-400 font-mono'}>
                {vectorStatus.assets.exists ? `${vectorStatus.assets.rows} 条` : '(不存在)'}
              </div>
            </div>
          </div>
        )}
        {vectorStatus?.error && (
          <div className="text-xs text-red-500 mb-3 break-all">{vectorStatus.error}</div>
        )}

        {vectorEditing && (
          <div className="space-y-3 p-3 mb-3 rounded-lg bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400">启用</label>
                <select
                  className="input mt-1"
                  value={vectorDraft.VECTOR_ENABLED}
                  onChange={(e) => setVectorDraft({ ...vectorDraft, VECTOR_ENABLED: e.target.value })}
                >
                  <option value="1">启用</option>
                  <option value="0">停用</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400">Embedding Model</label>
                <input
                  className="input mt-1"
                  value={vectorDraft.EMBEDDING_MODEL}
                  onChange={(e) => setVectorDraft({ ...vectorDraft, EMBEDDING_MODEL: e.target.value })}
                  placeholder="text-embedding-3-small (1536 dim)"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400">Zilliz Endpoint</label>
              <input
                className="input mt-1 font-mono text-xs"
                value={vectorDraft.VECTOR_ZILLIZ_ENDPOINT}
                onChange={(e) => setVectorDraft({ ...vectorDraft, VECTOR_ZILLIZ_ENDPOINT: e.target.value })}
                placeholder="https://in01-xxxx.aws-xxx.vectordb.zillizcloud.com:19540"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400">
                Zilliz Token{vectorConfig?.VECTOR_ZILLIZ_TOKEN.isSet ? ` (已设置 · ${vectorConfig.VECTOR_ZILLIZ_TOKEN.preview} · 留空保留)` : ''}
              </label>
              <input
                type="password"
                className="input mt-1 font-mono text-xs"
                value={vectorDraft.VECTOR_ZILLIZ_TOKEN}
                onChange={(e) => setVectorDraft({ ...vectorDraft, VECTOR_ZILLIZ_TOKEN: e.target.value })}
                placeholder={vectorConfig?.VECTOR_ZILLIZ_TOKEN.isSet ? '留空保留原值' : 'API Key from zilliz cloud'}
              />
            </div>
            <hr className="border-slate-200 dark:border-slate-700" />
            <div className="text-xs text-slate-500 dark:text-slate-400">
              💡 Embedding 单独 key（可选）。不填 fallback 到 LLM key 池。<br />
              推荐：SiliconFlow（国内免费 BAAI/bge-m3） / OpenAI / 充值 cometapi。
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400">Embedding Base URL</label>
              <input
                className="input mt-1 font-mono text-xs"
                value={vectorDraft.EMBEDDING_BASE_URL}
                onChange={(e) => setVectorDraft({ ...vectorDraft, EMBEDDING_BASE_URL: e.target.value })}
                placeholder="例：https://api.siliconflow.cn/v1（可选 · 留空 fallback）"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400">
                Embedding API Key{vectorConfig?.EMBEDDING_API_KEY.isSet ? ` (已设置 · ${vectorConfig.EMBEDDING_API_KEY.preview} · 留空保留)` : ''}
              </label>
              <input
                type="password"
                className="input mt-1 font-mono text-xs"
                value={vectorDraft.EMBEDDING_API_KEY}
                onChange={(e) => setVectorDraft({ ...vectorDraft, EMBEDDING_API_KEY: e.target.value })}
                placeholder={vectorConfig?.EMBEDDING_API_KEY.isSet ? '留空保留原值' : 'sk-...（可选）'}
              />
            </div>
            <div className="flex gap-2 justify-end pt-2 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setVectorEditing(false)}
                className="btn-secondary text-xs"
                disabled={vectorBusy === 'save'}
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveVector}
                className="btn-primary text-xs"
                disabled={vectorBusy === 'save'}
              >
                {vectorBusy === 'save' ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center text-xs">
          <button
            type="button"
            onClick={testEmbedding}
            disabled={vectorBusy === 'embed-test' || !vectorStatus?.enabled}
            className="btn-secondary text-xs disabled:opacity-50"
          >
            {vectorBusy === 'embed-test' ? '测试中…' : '🧪 测试 embedding'}
          </button>
          <button
            type="button"
            onClick={backfillVector}
            disabled={vectorBusy === 'backfill' || !vectorStatus?.enabled}
            className="btn-secondary text-xs disabled:opacity-50"
          >
            {vectorBusy === 'backfill' ? '回填中…1-3 分钟' : '🔄 全量回填到 Zilliz'}
          </button>
          {embedTestResult && (
            <span className={embedTestResult.startsWith('✓') ? 'text-emerald-600' : 'text-red-500'}>
              {embedTestResult}
            </span>
          )}
        </div>
      </section>
      

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

      {/* v0.11 B15.6 · 市场平台编辑卡片（放在 IMAGE provider section 下方）*/}
      <div
        className="card border-violet-200 dark:border-violet-800"
        data-b15-6-market-platforms-card=""
      >
        <div className="card-header bg-violet-50/40 dark:bg-violet-900/20 flex-wrap gap-2">
          <h2 className="font-semibold flex items-center gap-2">
            <span>📊</span>
            <span>市场平台</span>
            <span className="text-xs text-slate-400 font-normal">v0.11 B15.6</span>
          </h2>
          <div className="text-xs text-slate-500">
            编辑 PlatformInfo（介绍 / 推荐 KPI / 推荐工作流）。写入 Setting 表 key
            <span className="font-mono"> market:platform:&lt;slug&gt;</span>。
          </div>
        </div>
        <div className="card-body space-y-2">
          {platformsErr && (
            <div className="text-sm text-red-600">{platformsErr}</div>
          )}
          {platformsLoading && (
            <div className="text-xs text-slate-400">刷新中…</div>
          )}
          {!platformsLoading && platforms.length === 0 && !platformsErr && (
            <div className="text-xs text-slate-400">
              暂无平台数据。请检查 entrypoint 是否已自动 seed 三平台。
            </div>
          )}
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {platforms.map((p) => (
              <div
                key={p.slug}
                className="flex items-center justify-between gap-3 py-2"
                data-b15-6-platform-row={p.slug}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span aria-hidden className="text-base">{p.icon}</span>
                  <span className="font-medium text-sm">{p.name}</span>
                  <span className="text-xs text-slate-400 font-mono">({p.slug})</span>
                  <span className="text-xs text-slate-500 truncate hidden sm:inline">
                    · {p.tagline}
                  </span>
                </div>
                <button
                  type="button"
                  className="text-xs text-brand-600 hover:underline shrink-0"
                  onClick={() => setEditingPlatform(p)}
                  data-b15-6-edit-button={p.slug}
                >
                  编辑
                </button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 pt-1 leading-relaxed">
            提示：保存后立即生效，dashboard 的 MarketTrendsCard 下次拉取会显示新值。
            entrypoint 自动 seed 检测到此 key 已存在会跳过覆盖（idempotent）。
          </p>
        </div>
      </div>

      {/* v0.11 B15.6 · Modal */}
      {editingPlatform && (
        <PlatformEditModal
          open={!!editingPlatform}
          slug={editingPlatform.slug as PlatformSlug}
          current={editingPlatform}
          onClose={() => setEditingPlatform(null)}
          onSaved={(next) => {
            setPlatforms((list) =>
              list.map((it) => (it.slug === next.slug ? next : it)),
            );
          }}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LLM */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">LLM 文案 API（兼容/Fallback）</h2>
            <button
              onClick={() => test('llm')}
              disabled={testing === 'llm'}
              className="text-sm text-brand-600 hover:underline disabled:opacity-50"
            >
              {testing === 'llm' ? '测试中...' : '测试连接'}
            </button>
          </div>
          <div className="card-body space-y-3">
            <p className="text-xs text-slate-500 leading-relaxed">
              v0.11 B1 起优先走「API Keys 池」。当池中无 active=true 的 LLM key 时，
              系统才会回退到这里的兼容字段（Setting 表）。两者并存，相互不冲突。
            </p>
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
            <h2 className="font-semibold">图片 API（兼容/Fallback）</h2>
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
              当上面"默认 adapter"未选 + API Keys 池无 IMAGE key 时，生图才会走这里的 OpenAI 兼容配置。<br/>
              选了 adapter 后，下面的字段中只有 <code className="text-xs">IMAGE_API_KEY</code> 仍会被 adapter 复用（且池优先）。
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
            说明：v0.11 B1 起 API Key 优先级 = ① API Keys 池 → ② 本页 Setting 兼容字段 → ③ .env 同名变量。
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

/** v0.11 B1 · 新增 / 编辑抽屉 */
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
  onChange: (d: DraftKey) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  function up<K extends keyof DraftKey>(k: K, v: DraftKey[K]) {
    onChange({ ...draft, [k]: v });
  }
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="ml-auto w-full max-w-[560px] h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col relative">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h3 className="font-semibold">{editMode ? '编辑 API Key' : '新增 API Key'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <Field label="provider">
            <select
              className="input"
              value={draft.provider}
              onChange={(e) => up('provider', (e.target.value === 'image' ? 'image' : 'llm') as 'llm' | 'image')}
            >
              <option value="llm">llm（文案）</option>
              <option value="image">image（出图）</option>
            </select>
          </Field>
          <Field label="label（自定义名字）">
            <input
              className="input"
              value={draft.label}
              onChange={(e) => up('label', e.target.value)}
              placeholder="例：DeepSeek 主用 / 4router 备用"
            />
          </Field>
          <Field label="baseUrl">
            <input
              className="input"
              value={draft.baseUrl}
              onChange={(e) => up('baseUrl', e.target.value)}
              placeholder="例：https://inference.do-ai.run/v1"
            />
          </Field>
          <Field label={editMode ? 'apiKey（留空保留原值）' : 'apiKey'}>
            <input
              type="password"
              className="input"
              autoComplete="new-password"
              value={draft.apiKey}
              onChange={(e) => up('apiKey', e.target.value)}
              placeholder={editMode ? '输入新 key（留空则不改）' : 'sk-...'}
            />
          </Field>
          <Field label="model">
            <input
              className="input"
              value={draft.model}
              onChange={(e) => up('model', e.target.value)}
              placeholder="例：deepseek-v4-pro / gpt-image-2"
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="priority（越小越优先）">
              <input
                type="number"
                className="input"
                value={draft.priority}
                onChange={(e) => up('priority', Number(e.target.value) || 0)}
              />
            </Field>
            <Field label="启用">
              <select
                className="input"
                value={draft.active ? '1' : '0'}
                onChange={(e) => up('active', e.target.value === '1')}
              >
                <option value="1">启用</option>
                <option value="0">停用</option>
              </select>
            </Field>
          </div>
          <Field label="备注（可选）">
            <textarea
              className="input"
              rows={2}
              value={draft.notes}
              onChange={(e) => up('notes', e.target.value)}
              placeholder="例：限速 60 RPM / 低价中转 / 仅备用"
            />
          </Field>
        </div>
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-sm" disabled={saving}>取消</button>
          <button onClick={onSave} className="btn-primary text-sm" disabled={saving}>
            {saving ? '保存中…' : (editMode ? '更新' : '新增')}
          </button>
        </div>
      </div>
    </div>
  );
}
