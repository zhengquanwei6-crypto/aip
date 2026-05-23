// v0.11 B6 · 极简 markdown → HTML 渲染器
//
// 支持：
//   - h1 / h2 / h3 (`#` `##` `###`)
//   - 段落 <p>
//   - 无序列表 <ul> (`-` 或 `*`)
//   - 有序列表 <ol> (`1.` `2.` ...)
//   - 表格 (GFM `| col | col |` + `|---|---|`)  // 文档实际需要，加 ~30 行成本可接受
//   - 行内代码 `code`
//   - 围栏代码块 ```lang ... ```（不做语法高亮）
//   - 加粗 **text** / 斜体 *text*
//   - 链接 [text](url)
//   - 水平线 `---`
//   - 引用块 `>` 多行合并
//
// 不支持：图片、嵌套列表、footnote、HTML 透传（全部转义）。
// 0 第三方依赖。
//
// 安全考量：
//   - 所有用户原文先 escape HTML（即使内容是我们自己写的 markdown，也保证未来从 DB 读 prompt 文本时不被 XSS）
//   - 链接 href 经过 sanitizeHref，只允许 `http(s)://` `mailto:` 和站内绝对路径

const ESC_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC_MAP[c] ?? c);
}

function sanitizeHref(href: string): string {
  const trimmed = href.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('#')
  ) {
    return escapeHtml(trimmed);
  }
  // 不支持的 scheme（javascript: data: ...）一律降级 #
  return '#';
}

/**
 * 行内规则：先处理 code（避免后续 \*\* 把 code 内的 ** 误处理），再 link、再 bold、再 italic。
 * code 用占位符策略避免被后面的规则破坏。
 */
function renderInline(input: string): string {
  // 先把 inline code `xxx` 抽出来占位，content 已 escape
  const codes: string[] = [];
  let s = input.replace(/`([^`\n]+)`/g, (_, code: string) => {
    codes.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000CODE${codes.length - 1}\u0000`;
  });

  // escape 剩余 HTML
  s = escapeHtml(s);

  // 链接 [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text: string, href: string) => {
    const safeHref = sanitizeHref(href);
    const isExternal = /^https?:\/\//.test(href);
    const attrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${safeHref}" class="text-brand-600 hover:underline dark:text-brand-400"${attrs}>${text}</a>`;
  });

  // 加粗 **text**
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  // 斜体 *text*（不与 ** 冲突，因为 ** 已替换）
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');

  // 还原 inline code
  s = s.replace(/\u0000CODE(\d+)\u0000/g, (_, idx: string) => codes[Number(idx)] ?? '');

  return s;
}

type Block =
  | { kind: 'h'; level: 1 | 2 | 3; text: string }
  | { kind: 'p'; lines: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'code'; lang: string; lines: string[] }
  | { kind: 'hr' }
  | { kind: 'blockquote'; lines: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] };

function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    // 围栏代码块
    if (/^```/.test(trimmed)) {
      const lang = trimmed.replace(/^```/, '').trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test((lines[i] ?? '').trim())) {
        code.push(lines[i] ?? '');
        i++;
      }
      i++; // skip closing ```
      out.push({ kind: 'code', lang, lines: code });
      continue;
    }

    // 水平线
    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed) || /^___+$/.test(trimmed)) {
      out.push({ kind: 'hr' });
      i++;
      continue;
    }

    // 标题
    const h1 = /^# (.+)$/.exec(line);
    if (h1) {
      out.push({ kind: 'h', level: 1, text: h1[1] ?? '' });
      i++;
      continue;
    }
    const h2 = /^## (.+)$/.exec(line);
    if (h2) {
      out.push({ kind: 'h', level: 2, text: h2[1] ?? '' });
      i++;
      continue;
    }
    const h3 = /^### (.+)$/.exec(line);
    if (h3) {
      out.push({ kind: 'h', level: 3, text: h3[1] ?? '' });
      i++;
      continue;
    }

    // 表格：当前行像 `| col |` 且下一行是 `|---|`
    if (
      /^\|.+\|\s*$/.test(line) &&
      i + 1 < lines.length &&
      /^\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(lines[i + 1] ?? '')
    ) {
      const head = splitTableRow(line);
      i += 2; // 跳过 head + 分隔
      const rows: string[][] = [];
      while (i < lines.length && /^\|.+\|\s*$/.test(lines[i] ?? '')) {
        rows.push(splitTableRow(lines[i] ?? ''));
        i++;
      }
      out.push({ kind: 'table', head, rows });
      continue;
    }

    // 引用块（连续 `> ` 行合并）
    if (/^>\s?/.test(trimmed)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test((lines[i] ?? '').trim())) {
        buf.push((lines[i] ?? '').replace(/^>\s?/, ''));
        i++;
      }
      out.push({ kind: 'blockquote', lines: buf });
      continue;
    }

    // 无序列表
    if (/^(-|\*) /.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^(-|\*) /.test((lines[i] ?? '').trim())) {
        items.push((lines[i] ?? '').replace(/^\s*(-|\*) /, ''));
        i++;
      }
      out.push({ kind: 'ul', items });
      continue;
    }

    // 有序列表
    if (/^\d+\. /.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test((lines[i] ?? '').trim())) {
        items.push((lines[i] ?? '').replace(/^\s*\d+\. /, ''));
        i++;
      }
      out.push({ kind: 'ol', items });
      continue;
    }

    // 空行
    if (trimmed === '') {
      i++;
      continue;
    }

    // 段落（连续非空非匹配行）
    const para: string[] = [line];
    i++;
    while (i < lines.length) {
      const lt = (lines[i] ?? '').trim();
      if (
        lt === '' ||
        /^# /.test(lt) ||
        /^## /.test(lt) ||
        /^### /.test(lt) ||
        /^```/.test(lt) ||
        /^---+$/.test(lt) ||
        /^>\s?/.test(lt) ||
        /^(-|\*) /.test(lt) ||
        /^\d+\. /.test(lt) ||
        /^\|.+\|\s*$/.test(lt)
      ) {
        break;
      }
      para.push(lines[i] ?? '');
      i++;
    }
    out.push({ kind: 'p', lines: para });
  }

  return out;
}

function splitTableRow(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim());
}

function renderBlock(b: Block): string {
  switch (b.kind) {
    case 'h': {
      const cls = (
        {
          1: 'text-2xl sm:text-3xl font-bold mt-2 mb-4 text-slate-900 dark:text-slate-50',
          2: 'text-xl sm:text-2xl font-semibold mt-8 mb-3 text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2',
          3: 'text-base sm:text-lg font-semibold mt-6 mb-2 text-slate-900 dark:text-slate-100',
        } as const
      )[b.level];
      // 给 h2 加 anchor 方便未来加 ToC slug 跳转
      const id = b.level === 2 ? slugifyForId(b.text) : '';
      const idAttr = id ? ` id="${escapeHtml(id)}"` : '';
      return `<h${b.level} class="${cls}"${idAttr}>${renderInline(b.text)}</h${b.level}>`;
    }
    case 'p':
      return `<p class="my-3 text-slate-700 dark:text-slate-300 leading-relaxed">${renderInline(
        b.lines.join(' '),
      )}</p>`;
    case 'ul':
      return `<ul class="list-disc pl-6 my-3 space-y-1 text-slate-700 dark:text-slate-300">${b.items
        .map((it) => `<li>${renderInline(it)}</li>`)
        .join('')}</ul>`;
    case 'ol':
      return `<ol class="list-decimal pl-6 my-3 space-y-1 text-slate-700 dark:text-slate-300">${b.items
        .map((it) => `<li>${renderInline(it)}</li>`)
        .join('')}</ol>`;
    case 'code': {
      const code = b.lines.map((l) => escapeHtml(l)).join('\n');
      const langTag = b.lang
        ? ` <span class="text-xs text-slate-400 ml-2 align-middle">${escapeHtml(b.lang)}</span>`
        : '';
      return `<pre class="my-4 rounded-md bg-slate-900 text-slate-100 dark:bg-slate-950 dark:border dark:border-slate-800 p-3 sm:p-4 overflow-x-auto text-xs sm:text-sm leading-relaxed"><code>${code}</code>${langTag}</pre>`;
    }
    case 'hr':
      return '<hr class="my-6 border-slate-200 dark:border-slate-800" />';
    case 'blockquote':
      return `<blockquote class="my-4 border-l-4 border-amber-400 dark:border-amber-500 bg-amber-50/60 dark:bg-amber-900/10 px-4 py-2 text-slate-700 dark:text-slate-300 rounded-r">${b.lines
        .map((l) => `<p class="my-1">${renderInline(l)}</p>`)
        .join('')}</blockquote>`;
    case 'table': {
      const head = b.head
        .map(
          (c) =>
            `<th class="px-3 py-2 text-left bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 font-medium border-b border-slate-200 dark:border-slate-700">${renderInline(
              c,
            )}</th>`,
        )
        .join('');
      const rows = b.rows
        .map(
          (r) =>
            `<tr>${r
              .map(
                (c) =>
                  `<td class="px-3 py-2 border-b border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300 align-top">${renderInline(
                    c,
                  )}</td>`,
              )
              .join('')}</tr>`,
        )
        .join('');
      return `<div class="my-4 overflow-x-auto"><table class="w-full text-sm border-collapse"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }
  }
}

function slugifyForId(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** 单入口：markdown 字符串 → HTML 字符串（已经包含完整的 className） */
export function renderMarkdown(md: string): string {
  const blocks = parseBlocks(md);
  return blocks.map(renderBlock).join('\n');
}
