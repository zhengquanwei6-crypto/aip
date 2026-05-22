/**
 * 跨浏览器复制工具：优先使用 navigator.clipboard，失败时回退 execCommand。
 */
export async function copyAll(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallthrough */
  }
  // 老浏览器 / 非 https
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** 拼小红书发布包 */
export function buildXhsBundle(opts: {
  title: string;
  body: string;
  tags?: string[];
  coverText?: string;
  cta?: string;
}): string {
  const parts: string[] = [];
  parts.push(opts.title);
  parts.push('');
  parts.push(opts.body);
  if (opts.tags && opts.tags.length > 0) {
    parts.push('');
    parts.push(opts.tags.map((t) => `#${t}`).join(' '));
  }
  if (opts.coverText || opts.cta) {
    parts.push('');
    parts.push('───');
    if (opts.coverText) parts.push(`封面大字：${opts.coverText}`);
    if (opts.cta) parts.push(`CTA：${opts.cta}`);
  }
  return parts.join('\n');
}

/** 拼闲鱼商品发布包 */
export function buildXianyuBundle(opts: {
  title: string;
  description: string;
  coverText?: string;
  preOrderNotes?: string[];
}): string {
  const parts: string[] = [];
  parts.push(opts.title);
  parts.push('');
  parts.push(opts.description);
  if (opts.preOrderNotes && opts.preOrderNotes.length > 0) {
    parts.push('');
    parts.push('【拍前须知】');
    parts.push(...opts.preOrderNotes.map((n, i) => `${i + 1}. ${n}`));
  }
  if (opts.coverText) {
    parts.push('');
    parts.push(`封面：${opts.coverText}`);
  }
  return parts.join('\n');
}
