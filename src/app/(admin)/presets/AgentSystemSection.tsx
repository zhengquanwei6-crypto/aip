'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Bot, Pencil, RotateCcw, GitCompare, ExternalLink, Check } from 'lucide-react';
import { toast } from '@/lib/toast';

/**
 * v0.12 B2 · /presets?tab=agent · 真编辑器（替换 v0.11 B5 占位）
 *
 * 8 个 agent（来自 src/lib/agent-types.ts AGENTS）的 systemPrompt 编辑器：
 *   - 内置 systemPrompt（fallback）显示左栏 + 「写一条覆盖」按钮
 *   - 已有覆盖时显示「编辑」「清空回退」按钮 + 双栏 diff（左：内置 / 右：自定义）
 *   - 公共契约 Setting key：`prompt:agent:<slug>:system`（B15.5 docs 已写明）
 *   - API：POST /api/prompts/agent:<slug>:system  写覆盖（PromptTemplate 形状）
 *          DELETE /api/prompts/agent:<slug>:system  清空回退
 *   - 写入立即生效（chat route 每次请求都重新读 Setting）
 *
 * data-v012-b2-agent-editor marker：push.sh / walk grep 用
 */

export interface AgentRow {
  slug: string;
  name: string;
  description: string;
  icon: string;
  /** 内置 systemPrompt（来自 AGENTS 数组，fallback） */
  builtin: string;
  /** 已有覆盖时的自定义 system；null 表示用内置 */
  custom: string | null;
}

interface EditingState {
  slug: string;
  draft: string;
}

const AGENT_KEY_RE = /^[a-z][a-z0-9-]*$/;

/** Setting `prompt:agent:<slug>:system` 对应的 /api/prompts key（无 prompt: 前缀） */
function settingKeyFor(slug: string): string {
  return `agent:${slug}:system`;
}

function lineDiff(currentText: string, defaultText: string): {
  current: { line: string; changed: boolean }[];
  defaultLines: { line: string; changed: boolean }[];
} {
  const a = (currentText || '').split('\n');
  const b = (defaultText || '').split('\n');
  const max = Math.max(a.length, b.length);
  const current: { line: string; changed: boolean }[] = [];
  const defaultLines: { line: string; changed: boolean }[] = [];
  for (let i = 0; i < max; i++) {
    const ai = a[i] ?? '';
    const bi = b[i] ?? '';
    const changed = ai !== bi;
    current.push({ line: ai, changed });
    defaultLines.push({ line: bi, changed });
  }
  return { current, defaultLines };
}

export default function AgentSystemSection({ initial }: { initial: AgentRow[] }) {
  const [rows, setRows] = useState<AgentRow[]>(initial);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [saving, setSaving] = useState(false);

  const editingRow = useMemo(
    () => (editing ? rows.find((r) => r.slug === editing.slug) ?? null : null),
    [editing, rows],
  );

  const customCount = rows.filter((r) => r.custom !== null).length;

  function startEdit(row: AgentRow) {
    setEditing({
      slug: row.slug,
      draft: row.custom ?? row.builtin,
    });
  }

  async function save() {
    if (!editing) return;
    if (!AGENT_KEY_RE.test(editing.slug)) {
      toast.error('slug 不合法');
      return;
    }
    const draft = editing.draft.trim();
    if (!draft) {
      toast.error('systemPrompt 不能为空（如需回退到内置，请用「清空回退」）');
      return;
    }
    if (draft.length > 8000) {
      toast.error('systemPrompt 超过 8000 字限制');
      return;
    }
    const row = rows.find((r) => r.slug === editing.slug);
    if (!row) {
      toast.error('agent 不存在');
      return;
    }
    setSaving(true);
    try {
      // /api/prompts/[key] 校验 key ^[a-z0-9:_-]+$，并要求 PromptTemplate 形状
      // （含 name/description/system/user/vars[]）。我们 user/vars 留空字符串/空数组即可。
      const res = await fetch(
        `/api/prompts/${encodeURIComponent(settingKeyFor(row.slug))}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `${row.name} system prompt`,
            description: `Agent System Prompt 覆盖 · v0.12 B2 · slug=${row.slug}`,
            system: draft,
            user: '',
            vars: [],
          }),
        },
      );
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '保存失败');
      setRows((arr) =>
        arr.map((r) => (r.slug === row.slug ? { ...r, custom: draft } : r)),
      );
      setEditing(null);
      toast.success(`已为 ${row.name} 写一条覆盖（立即生效）`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function clearOverride(row: AgentRow) {
    if (!window.confirm(`清空 ${row.name} 的自定义覆盖，回退到内置 systemPrompt？`)) return;
    try {
      const res = await fetch(
        `/api/prompts/${encodeURIComponent(settingKeyFor(row.slug))}`,
        { method: 'DELETE' },
      );
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '清空失败');
      setRows((arr) =>
        arr.map((r) => (r.slug === row.slug ? { ...r, custom: null } : r)),
      );
      if (editing && editing.slug === row.slug) {
        setEditing(null);
      }
      toast.success(`已清空 ${row.name} 覆盖，已回退到内置`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4" data-v012-b2-agent-editor>
      <div className="card">
        <div className="card-body">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 inline-flex items-center justify-center">
              <Bot size={18} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold text-slate-800 dark:text-slate-100">
                Agent System Prompt 编辑器 · v0.12 B2
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                给 8 个内置 agent 各写一条 systemPrompt 覆盖（写入 Setting{' '}
                <code className="font-mono px-1 rounded bg-slate-100 dark:bg-slate-800">prompt:agent:&lt;slug&gt;:system</code>），
                调用立即生效，无需重启。删了覆盖自动回退到 <code className="font-mono px-1 rounded bg-slate-100 dark:bg-slate-800">src/lib/agent-types.ts</code> 内置版。{' '}
                <Link
                  href="/docs/05-agents"
                  className="text-brand-600 dark:text-brand-300 hover:underline inline-flex items-center gap-0.5"
                >
                  详见 docs/05 §自定义 prompt 模板
                  <ExternalLink size={11} aria-hidden="true" />
                </Link>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                当前自定义覆盖：
                <span className="font-semibold text-slate-700 dark:text-slate-200 ml-1">
                  {customCount} / {rows.length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const isCustom = row.custom !== null;
          const preview = (row.custom ?? row.builtin).split('\n').slice(0, 4).join('\n');
          return (
            <div
              key={row.slug}
              className="card"
              data-v012-b2-agent-row
              data-agent-slug={row.slug}
            >
              <div className="card-body">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xl" aria-hidden="true">{row.icon}</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {row.name}
                      </span>
                      <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-200">
                        {row.slug}
                      </span>
                      {isCustom ? (
                        <span className="badge-blue inline-flex items-center gap-1">
                          <Check size={11} aria-hidden="true" />
                          自定义覆盖
                        </span>
                      ) : (
                        <span className="badge-gray">内置</span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {row.description}
                    </div>
                    <pre className="mt-2 text-[11px] font-mono text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded p-2 whitespace-pre-wrap break-words leading-relaxed line-clamp-4">
                      {preview}
                      {(row.custom ?? row.builtin).split('\n').length > 4 ? '\n…' : ''}
                    </pre>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    {isCustom ? (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="btn-secondary text-xs px-2.5 py-1 inline-flex items-center gap-1"
                        >
                          <Pencil size={12} aria-hidden="true" />
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => clearOverride(row)}
                          className="text-xs px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1"
                          title="清空自定义覆盖，回退到内置"
                        >
                          <RotateCcw size={12} aria-hidden="true" />
                          清空回退
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(row)}
                        className="btn-primary text-xs px-2.5 py-1 inline-flex items-center gap-1"
                      >
                        <Pencil size={12} aria-hidden="true" />
                        写一条覆盖
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editing && editingRow && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !saving && setEditing(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-lg p-5 space-y-3 max-h-[92vh] overflow-y-auto w-full max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-semibold text-lg">
                {editingRow.custom !== null ? '编辑覆盖' : '写一条覆盖'} · {editingRow.name}{' '}
                <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded ml-1 text-slate-700 dark:text-slate-200">
                  {editingRow.slug}
                </span>
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                <GitCompare size={11} aria-hidden="true" />
                双栏 diff（左：内置 fallback / 右：你的覆盖；黄色行 = 不同）
              </span>
            </div>

            <div>
              <label className="label text-xs">
                你的 systemPrompt 覆盖 ·{' '}
                <code className="font-mono px-1 rounded bg-slate-100 dark:bg-slate-800">
                  prompt:agent:{editingRow.slug}:system
                </code>
              </label>
              <textarea
                className="input font-mono text-xs min-h-[280px]"
                value={editing.draft}
                onChange={(e) => setEditing({ ...editing, draft: e.target.value })}
                placeholder="把内置 systemPrompt 复制下来再改，或者完全重写一段。≤ 8000 字"
                disabled={saving}
              />
              <div className="text-[10px] text-slate-500 mt-1">
                字数：{editing.draft.length} / 8000 · 写入立即生效（chat 调用时每次重新读 Setting）
              </div>
            </div>

            <DiffPanel current={editing.draft} builtin={editingRow.builtin} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="btn-secondary"
                disabled={saving}
              >
                取消
              </button>
              <button
                type="button"
                onClick={save}
                className="btn-primary inline-flex items-center justify-center gap-1"
                disabled={saving}
              >
                {saving ? '保存中…' : '保存覆盖'}
              </button>
            </div>

            {editingRow.custom !== null && (
              <div className="border-t border-slate-200 dark:border-slate-700 pt-3 -mx-1 px-1">
                <button
                  type="button"
                  onClick={() => clearOverride(editingRow)}
                  className="text-xs px-2.5 py-1 rounded border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 inline-flex items-center gap-1"
                  disabled={saving}
                >
                  <RotateCcw size={12} aria-hidden="true" />
                  清空覆盖（回退到内置）
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DiffPanel({ current, builtin }: { current: string; builtin: string }) {
  const diff = useMemo(() => lineDiff(current, builtin), [current, builtin]);
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-md p-3 space-y-2">
      <div className="text-xs text-slate-500 dark:text-slate-400">
        对比基准：
        <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded ml-1">
          内置 systemPrompt（src/lib/agent-types.ts）
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] text-slate-500 mb-0.5">内置（fallback）</div>
          <pre className="text-[11px] font-mono bg-slate-50 dark:bg-slate-800 rounded p-2 whitespace-pre-wrap break-words leading-relaxed max-h-[260px] overflow-auto">
            {diff.defaultLines.map((r, i) => (
              <div key={i} className={r.changed ? 'bg-yellow-100 dark:bg-yellow-900/30' : ''}>
                {r.line || ' '}
              </div>
            ))}
          </pre>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 mb-0.5">你的覆盖（draft）</div>
          <pre className="text-[11px] font-mono bg-slate-50 dark:bg-slate-800 rounded p-2 whitespace-pre-wrap break-words leading-relaxed max-h-[260px] overflow-auto">
            {diff.current.map((r, i) => (
              <div key={i} className={r.changed ? 'bg-yellow-100 dark:bg-yellow-900/30' : ''}>
                {r.line || ' '}
              </div>
            ))}
          </pre>
        </div>
      </div>
    </div>
  );
}
