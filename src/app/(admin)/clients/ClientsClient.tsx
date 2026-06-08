'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckSquare, Send, Trash2, UserPlus } from 'lucide-react';
import { CATEGORIES } from '@/lib/constants';
import { toast } from '@/lib/toast';
import ListShell, { bulkSerial } from '@/components/ListShell';

interface ClientItem {
  id: string;
  nickname: string;
  platform: string;
  category: string;
  tags: string;
  status: string;
  totalOrders: number;
  totalRevenue: number;
  lastContact: string | null;
  noteCount: number;
  createdAt: string;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  lead: { label: '潜在', cls: 'badge-gray' },
  negotiating: { label: '咨询中', cls: 'badge-yellow' },
  customer: { label: '已成交', cls: 'badge-green' },
  lost: { label: '流失', cls: 'badge-red' },
};

const STATUS_FILTER_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'lead', label: '潜在' },
  { value: 'negotiating', label: '咨询中' },
  { value: 'customer', label: '已成交' },
  { value: 'lost', label: '流失' },
];

const PLATFORM_FILTER_OPTIONS = [
  { value: '', label: '全部平台' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'xianyu', label: '闲鱼' },
  { value: 'other', label: '其他' },
];

export default function ClientsClient({ initial }: { initial: ClientItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({
    nickname: '',
    platform: 'xiaohongshu',
    category: '',
    tags: '',
    status: 'lead',
  });

  async function add() {
    if (!draft.nickname.trim()) return;
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      toast.error(j.error || '添加失败');
      return;
    }
    setShowAdd(false);
    setDraft({ ...draft, nickname: '', tags: '' });
    toast.success('已新增客户');
    router.refresh();
  }

  async function patchStatus(id: string, status: string) {
    const res = await fetch(`/api/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) throw new Error(j.error || '保存失败');
    return j.client as ClientItem;
  }

  function makeBulkStatus(target: string, label: string, icon: React.ReactNode) {
    return {
      key: `status:${target}`,
      label,
      icon,
      run: async (ids: string[]) => {
        const r = await bulkSerial(ids, async (id) => {
          await patchStatus(id, target);
          setItems((arr) =>
            arr.map((x) => (x.id === id ? { ...x, status: target } : x)),
          );
        });
        if (r.failed.length === 0) {
          return { ok: true, message: `已批量改为「${label.replace('改为', '')}」` };
        }
        return {
          ok: false,
          message: `部分失败：成功 ${r.ok} / 失败 ${r.failed.length}`,
        };
      },
    };
  }

  const customerCount = items.filter((item) => item.status === 'customer').length;
  const negotiatingCount = items.filter((item) => item.status === 'negotiating').length;
  const totalRevenue = items.reduce((sum, item) => sum + item.totalRevenue, 0);

  return (
    <>
      <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ClientSignal label="客户总数" value={items.length} note="全部线索和成交客户" />
        <ClientSignal label="咨询中" value={negotiatingCount} note="需要继续推进" />
        <ClientSignal label="已成交" value={customerCount} note="可复盘收入与素材" />
        <ClientSignal label="总成交" value={`¥${Math.round(totalRevenue)}`} note="收入闭环回流" />
      </section>

      <ListShell<ClientItem>
        items={items}
        getId={(c) => c.id}
        storageKey="list:clients"
        title={<span className="text-slate-700 dark:text-slate-200">客户档案</span>}
        toolbar={
          <button
            onClick={() => setShowAdd(true)}
            className="btn-primary h-9 gap-2 text-sm"
          >
            <UserPlus className="h-4 w-4" aria-hidden />
            新增客户
          </button>
        }
        searchPlaceholder="搜索昵称 / 标签 / 类目"
        searchKeys={['nickname', 'tags', 'category']}
        filters={[
          {
            key: 'status',
            label: '状态',
            options: STATUS_FILTER_OPTIONS,
            predicate: (c, v) => c.status === v,
          },
          {
            key: 'platform',
            label: '平台',
            options: PLATFORM_FILTER_OPTIONS,
            predicate: (c, v) => c.platform === v,
          },
        ]}
        viewModes={['table', 'card']}
        pageSize={50}
        emptyState="暂无客户。点击右上角「新增客户」开始记录。"
        onToastSuccess={(m) => toast.success(m)}
        onToastError={(m) => toast.error(m)}
        bulk={[
          makeBulkStatus('customer', '改为已成交', <CheckSquare size={14} />),
          makeBulkStatus('negotiating', '改为咨询中', <Send size={14} />),
          {
            key: 'delete',
            label: '批量删除',
            icon: <Trash2 size={14} />,
            destructive: true,
            confirmText:
              '确认删除已选客户档案及其全部跟进记录？此操作不可撤销。',
            run: async (ids: string[]) => {
              const r = await bulkSerial(ids, async (id) => {
                const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' });
                const j = await res.json().catch(() => ({}));
                if (!res.ok || !j.ok) throw new Error(j.error || `删除 ${id} 失败`);
              });
              const failedIds = new Set(r.failed.map((f) => f.id));
              setItems((arr) =>
                arr.filter((x) => !ids.includes(x.id) || failedIds.has(x.id)),
              );
              if (r.failed.length === 0) {
                return { ok: true, message: `已删除 ${r.ok} 条客户档案` };
              }
              return {
                ok: false,
                message: `部分失败：成功 ${r.ok} / 失败 ${r.failed.length}`,
              };
            },
          },
        ]}
        tableColumns={[
          {
            key: 'nickname',
            label: '客户',
            render: (c) => (
              <div>
                <Link
                  href={`/clients/${c.id}`}
                  className="font-medium text-slate-800 dark:text-slate-100 hover:text-brand-600"
                >
                  {c.nickname}
                </Link>
                {c.tags && (
                  <div className="text-xs text-slate-400 mt-0.5">
                    {c.tags
                      .split(',')
                      .filter(Boolean)
                      .map((t) => '#' + t)
                      .join(' ')}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'platform',
            label: '平台',
            width: '80px',
            render: (c) => (
              <span
                className={
                  c.platform === 'xiaohongshu'
                    ? 'badge-red'
                    : c.platform === 'xianyu'
                      ? 'badge-yellow'
                      : 'badge-gray'
                }
              >
                {c.platform === 'xiaohongshu'
                  ? '小红书'
                  : c.platform === 'xianyu'
                    ? '闲鱼'
                    : '其他'}
              </span>
            ),
          },
          {
            key: 'category',
            label: '类目',
            width: '96px',
            render: (c) => c.category || '-',
          },
          {
            key: 'status',
            label: '状态',
            width: '80px',
            render: (c) => (
              <span className={STATUS_LABEL[c.status]?.cls ?? 'badge-gray'}>
                {STATUS_LABEL[c.status]?.label ?? c.status}
              </span>
            ),
          },
          {
            key: 'orders',
            label: '订单',
            width: '60px',
            render: (c) => c.totalOrders,
          },
          {
            key: 'revenue',
            label: '总成交',
            width: '96px',
            className: 'font-mono',
            render: (c) => `¥${Math.round(c.totalRevenue)}`,
          },
          {
            key: 'lastContact',
            label: '上次接触',
            width: '112px',
            className: 'text-xs text-slate-500',
            render: (c) =>
              c.lastContact
                ? new Date(c.lastContact).toLocaleDateString('zh-CN')
                : '-',
          },
          {
            key: 'op',
            label: '',
            width: '64px',
            render: (c) => (
              <Link
                href={`/clients/${c.id}`}
                className="text-xs text-brand-600 hover:underline"
              >
                详情 →
              </Link>
            ),
          },
        ]}
        renderCard={(c) => (
          <div className="command-glass detail-lift">
            <div className="p-4 sm:p-5">
              <div className="flex items-center gap-2 flex-wrap pl-8">
                <Link
                  href={`/clients/${c.id}`}
                  className="font-bold text-slate-900 hover:text-cyan-700 dark:text-slate-100 dark:hover:text-cyan-300"
                >
                  {c.nickname}
                </Link>
                <span
                  className={
                    c.platform === 'xiaohongshu'
                      ? 'badge-red'
                      : c.platform === 'xianyu'
                        ? 'badge-yellow'
                        : 'badge-gray'
                  }
                >
                  {c.platform === 'xiaohongshu'
                    ? '小红书'
                    : c.platform === 'xianyu'
                      ? '闲鱼'
                      : '其他'}
                </span>
                <span className={STATUS_LABEL[c.status]?.cls ?? 'badge-gray'}>
                  {STATUS_LABEL[c.status]?.label ?? c.status}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                <div className="rounded-lg border border-slate-200 bg-white/70 p-2 dark:border-slate-800 dark:bg-slate-950/60">
                  <div className="text-slate-400">订单</div>
                  <div className="mt-1 font-mono text-base font-bold text-slate-900 dark:text-white">{c.totalOrders}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white/70 p-2 dark:border-slate-800 dark:bg-slate-950/60">
                  <div className="text-slate-400">成交</div>
                  <div className="mt-1 font-mono text-base font-bold text-slate-900 dark:text-white">¥{Math.round(c.totalRevenue)}</div>
                </div>
              </div>
              <div className="text-xs text-slate-500 mt-2">
                {c.category || '未分类'} · 订单 {c.totalOrders} · ¥
                {Math.round(c.totalRevenue)}
              </div>
              {c.tags && (
                <div className="text-xs text-slate-400 mt-1">
                  {c.tags
                    .split(',')
                    .filter(Boolean)
                    .map((t) => '#' + t)
                    .join(' ')}
                </div>
              )}
              <div className="text-xs text-slate-400 mt-1">
                上次接触：
                {c.lastContact
                  ? new Date(c.lastContact).toLocaleDateString('zh-CN')
                  : '-'}
              </div>
              <div className="mt-2">
                <Link
                  href={`/clients/${c.id}`}
                  className="action-link bg-cyan-50 text-cyan-700 hover:bg-cyan-100 dark:bg-cyan-950/30 dark:text-cyan-300"
                >
                  进入客户档案 <ArrowRight className="h-3 w-3" aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        )}
      />

      {/* 新增客户弹窗 */}
      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={() => setShowAdd(false)}
        >
          <div
            className="command-glass w-full max-w-md space-y-3 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                <UserPlus className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <div className="page-kicker">Client Intake</div>
                <h3 className="font-bold text-slate-950 dark:text-white">新增客户</h3>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                className="input"
                placeholder="昵称"
                value={draft.nickname}
                onChange={(e) =>
                  setDraft({ ...draft, nickname: e.target.value })
                }
                autoFocus
              />
              <select
                className="input"
                value={draft.platform}
                onChange={(e) =>
                  setDraft({ ...draft, platform: e.target.value })
                }
              >
                <option value="xiaohongshu">小红书</option>
                <option value="xianyu">闲鱼</option>
                <option value="other">其他</option>
              </select>
              <select
                className="input"
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value })
                }
              >
                <option value="">类目（可选）</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
              >
                <option value="lead">潜在</option>
                <option value="negotiating">咨询中</option>
                <option value="customer">已成交</option>
                <option value="lost">流失</option>
              </select>
            </div>
            <input
              className="input"
              placeholder="标签（逗号分隔）"
              value={draft.tags}
              onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => setShowAdd(false)}
                className="btn-secondary"
              >
                取消
              </button>
              <button onClick={add} className="btn-primary">
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ClientSignal({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note: string;
}) {
  return (
    <div className="command-stat-card">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</div>
        <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.75)]" aria-hidden />
      </div>
      <div className="mt-3 text-2xl font-black tabular-nums text-slate-950 dark:text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{note}</div>
    </div>
  );
}
