'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { parseTable, suggestMapping } from '@/lib/csv';

const DB_FIELDS = [
  { value: '', label: '不导入' },
  { value: 'date', label: '日期 *' },
  { value: 'platform', label: '平台' },
  { value: 'title', label: '标题' },
  { value: 'category', label: '类目' },
  { value: 'impressions', label: '曝光' },
  { value: 'clicks', label: '点击' },
  { value: 'likes', label: '点赞' },
  { value: 'favorites', label: '收藏' },
  { value: 'comments', label: '评论' },
  { value: 'messages', label: '私信' },
  { value: 'views', label: '闲鱼浏览' },
  { value: 'consultations', label: '咨询' },
  { value: 'orders', label: '成交' },
  { value: 'revenue', label: '成交金额' },
  { value: 'averageOrderValue', label: '客单价' },
  { value: 'subscriptionLeads', label: '包月线索' },
  { value: 'notes', label: '备注' },
];

const SAMPLE = `日期\t平台\t标题\t类目\t曝光\t私信\t咨询\t成交\t金额
2026-05-15\t小红书\t奶茶店开业菜单升级案例\t菜单\t12000\t35\t8\t2\t598
2026-05-15\t闲鱼\tlogo设计 标准款 199元起\tLogo\t2400\t12\t5\t1\t299
2026-05-16\t小红书\t电商主图避坑指南\t电商主图\t8000\t22\t6\t1\t199`;

export default function ImportClient() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<{
    headers: string[];
    rows: any[];
  } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    success: number;
    total: number;
    errors: { line: number; reason: string }[];
  } | null>(null);

  function parseNow() {
    if (!text.trim()) return;
    const r = parseTable(text);
    if (r.headers.length === 0) {
      alert('解析失败：请确认数据格式（CSV/TSV/Excel 复制）');
      return;
    }
    setParsed(r);
    setMapping(suggestMapping(r.headers));
    setResult(null);
  }

  function loadSample() {
    setText(SAMPLE);
  }

  async function doImport() {
    if (!parsed) return;
    if (!Object.values(mapping).includes('date')) {
      alert('必须有一列映射到「日期」');
      return;
    }
    setImporting(true);
    setResult(null);
    try {
      const res = await fetch('/api/metrics/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsed.rows, mapping }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '导入失败');
      setResult({
        success: j.success,
        total: j.total,
        errors: j.errors ?? [],
      });
      if (j.success > 0) {
        // 5 秒后回到 analytics
        setTimeout(() => router.push('/analytics'), 100);
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  const previewRows = parsed?.rows.slice(0, 5) ?? [];

  return (
    <div className="space-y-4">
      <Link
        href="/analytics"
        className="inline-block text-sm text-brand-600"
      >
        ← 返回数据复盘
      </Link>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">批量导入数据</h2>
          <button onClick={loadSample} className="text-xs text-brand-600">
            填入示例
          </button>
        </div>
        <div className="card-body space-y-3">
          <p className="text-sm text-slate-500 leading-relaxed">
            从 Excel / 表格里复制数据（含表头）粘贴下面，自动识别字段、预览后入库。支持 TSV（Excel复制默认）、CSV、分号分隔。
          </p>
          <textarea
            className="input min-h-[160px] font-mono text-xs"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="粘贴 Excel/表格数据（第一行是表头）"
          />
          <div className="flex gap-2">
            <button onClick={parseNow} className="btn-primary">
              ① 解析并预览
            </button>
            {text && (
              <button
                onClick={() => {
                  setText('');
                  setParsed(null);
                  setResult(null);
                }}
                className="btn-secondary"
              >
                清空
              </button>
            )}
          </div>
        </div>
      </div>

      {parsed && (
        <>
          <div className="card">
            <div className="card-header">
              <h3 className="font-semibold">字段映射</h3>
              <span className="text-xs text-slate-500">
                自动识别了 {parsed.headers.length} 列，确认后导入
              </span>
            </div>
            <div className="card-body grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {parsed.headers.map((h) => (
                <div key={h}>
                  <label className="label text-xs">CSV 列：{h}</label>
                  <select
                    className="input"
                    value={mapping[h] ?? ''}
                    onChange={(e) =>
                      setMapping({ ...mapping, [h]: e.target.value })
                    }
                  >
                    {DB_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="font-semibold">数据预览（前 5 行）</h3>
              <span className="text-xs text-slate-500">
                共 {parsed.rows.length} 行
              </span>
            </div>
            <div className="card-body overflow-x-auto">
              <table className="table min-w-[800px]">
                <thead>
                  <tr>
                    {parsed.headers.map((h) => (
                      <th key={h}>
                        {h}
                        <div className="text-[10px] text-slate-400 font-normal">
                          → {mapping[h] || '(不导入)'}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i}>
                      {parsed.headers.map((h) => (
                        <td key={h} className="text-xs">
                          {r[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-body flex items-center justify-between gap-3">
              <div className="text-sm text-slate-500">
                确认无误后点击导入。已存在的相同记录不会去重，建议清单本次只导入新数据。
              </div>
              <button
                onClick={doImport}
                disabled={importing}
                className="btn-primary"
              >
                {importing ? '导入中...' : `② 导入 ${parsed.rows.length} 条`}
              </button>
            </div>
          </div>
        </>
      )}

      {result && (
        <div
          className={
            'card ' +
            (result.errors.length === 0
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-amber-200 bg-amber-50')
          }
        >
          <div className="card-body">
            <div className="font-semibold">
              {result.errors.length === 0
                ? `✅ 成功导入 ${result.success}/${result.total} 条`
                : `⚠ 导入完成，成功 ${result.success}/${result.total}，失败 ${result.errors.length}`}
            </div>
            {result.errors.length > 0 && (
              <ul className="mt-2 text-sm text-amber-800 space-y-1">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    第 {e.line} 行：{e.reason}
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/analytics"
              className="inline-block mt-3 text-sm text-brand-600"
            >
              查看数据复盘 →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
