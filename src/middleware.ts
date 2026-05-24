import { NextRequest, NextResponse } from 'next/server';

/**
 * 移动设备自动跳转到 /m 路径独立站。
 * 桌面访问 /m 也允许（方便预览）。
 * 用户可以加 ?desktop=1 强制桌面版（写 cookie）。
 *
 * v0.8 Batch 6 修复：
 * - cookie view_mode=desktop 优先级最高：即使是 /m/* 也会跳出去到对应桌面路径
 * - cookie view_mode=mobile 同样优先于 UA：桌面 UA 仍会被强制带到 /m
 *
 * v0.11 B2 清理：移除 §九 #5 中标记的双层三元嵌套死代码。
 *
 * v0.11 B5 NAV 整合：
 * - /pricing  → 307 → /clients?tab=pricing
 * - /prompts  → 307 → /presets?tab=content
 * 这两条 redirect 必须放在 cookie / UA 判定之前 —— 否则 cookie=desktop 直接 next()，
 * cookie=mobile 又会先把它们变成 /m/pricing /m/prompts，永远走不到我们的整合页。
 *
 * v0.12 B1 BUG-M22 真 404 修复：
 * - Next.js 14.2.18 standalone 下 server-component notFound() 仍会返回 200 + body
 *   （streaming SSR 已写 header，notFound 改不了 status）。
 * - 在 middleware 提前拦截不在白名单的 /docs/<slug> → 直接 NextResponse(404)。
 * - 11 个合法 slug 透传，root /docs 透传，其它一切 /docs/<bogus> 都 404。
 *
 * v0.12 B3.3 NAV 整合（content + image → /create）：
 * - /content → 307 → /create?tab=content
 * - /image   → 307 → /create?tab=image
 * 沿袭 B5 /pricing /prompts 模式 —— 在 cookie / UA 判定之前 redirect。
 * 用户书签 / 外链 / NAV 历史都走这里 307，避免直接 404。
 */

const MOBILE_RE =
  /Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile Safari/i;

function isMobilePath(p: string): boolean {
  return p === '/m' || p.startsWith('/m/');
}

// BUG-2 fix: paths in this set don't have a corresponding /m/<path>
// page; redirect them to the mobile home (/m) instead.
const REMAP_TO_MOBILE_HOME = new Set(['/dashboard', '/']);
function stripMobilePrefix(p: string): string {
  if (!p) return '/dashboard';
  if (p === '/m') return '/dashboard';
  if (p.startsWith('/m/')) return p.slice(2); // /m/today -> /today
  return p;
}

/** v0.11 B2: 单点判断"桌面路径 → 对应移动端路径" */
function toMobileTarget(pathname: string): string {
  return REMAP_TO_MOBILE_HOME.has(pathname) ? '/m' : `/m${pathname}`;
}

/**
 * v0.11 B5 + v0.12 B3.3: B5 NAV 整合后旧 URL → 新 URL 的精确映射（exact match only,
 * 子路径不动 —— /pricing/... 没有子路径; /prompts 也没 /prompts/[xxx] 的桌面页;
 * /content + /image 也没子路径，旧 deeplink 全是根级 URL）。
 */
const LEGACY_REDIRECTS: Record<string, string> = {
  '/pricing': '/clients?tab=pricing',
  '/prompts': '/presets?tab=content',
  // v0.12 B3.3
  '/content': '/create?tab=content',
  '/image': '/create?tab=image',
};

/**
 * v0.12 B1：使用手册 11 篇合法 slug 白名单（与 src/lib/docs/index.ts DOCS_ENTRIES 一致）。
 * 不在白名单的 /docs/<slug> 由 middleware 直接返回 404，避开 Next.js 14 standalone
 * server-component notFound() 仍返回 200 的已知 bug。
 */
const VALID_DOC_SLUGS = new Set<string>([
  '01-quick-start',
  '02-modules-tour',
  '03-workflow',
  '04-image-best-practices',
  '05-agents',
  '06-shortcuts',
  '07-faq',
  '08-backup',
  '09-troubleshooting',
  '10-playground',
  '11-market-trends',
]);

/** /docs/<bogus> → 真 404（中文 brand body · text/html · 0 依赖）。 */
function notFoundResponse(): NextResponse {
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>未找到 · 使用手册</title><meta name="robots" content="noindex"></head><body style="font-family:system-ui,sans-serif;padding:48px;text-align:center;color:#475569;background:#f8fafc;"><h1 style="color:#0f172a;">找不到这篇文档</h1><p>这条 /docs 路径不存在。可能链接拼错了。</p><p><a href="/docs" style="color:#0ea5e9;">回到使用手册首页</a></p></body></html>`;
  return new NextResponse(html, {
    status: 404,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const ua = req.headers.get('user-agent') || '';

  // 静态资源 / API 直接放行
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/uploads') ||
    pathname.includes('.') // 文件
  ) {
    return NextResponse.next();
  }

  // v0.12 B1 BUG-M22: 不在白名单的 /docs/<slug> 直接 404
  // 注意：仅拦截 /docs/<single-segment>·/docs 根 + /docs/<slug>/<sub> 透传
  // （目前没有 sub 路由，但保留兼容性）
  if (pathname.startsWith('/docs/')) {
    const tail = pathname.slice('/docs/'.length);
    const slug = tail.split('/')[0];
    if (slug && !VALID_DOC_SLUGS.has(slug)) {
      return notFoundResponse();
    }
  }

  // v0.11 B5 + v0.12 B3.3: 旧 URL 精确重定向, 必须放在 cookie / UA 判定之前
  // (cookie=desktop 时会直接 next() 跳过 cookie 之后的逻辑;
  //  cookie=mobile 会把 /pricing 改写到 /m/pricing 而非整合页)
  const legacyTarget = LEGACY_REDIRECTS[pathname];
  if (legacyTarget) {
    return NextResponse.redirect(new URL(legacyTarget, req.url), 307);
  }

  // ?desktop=1 -> 写 cookie + 如果当前在 /m 下，跳到去掉前缀的桌面路径
  if (searchParams.get('desktop') === '1') {
    if (isMobilePath(pathname)) {
      const target = stripMobilePrefix(pathname);
      const url = new URL(target, req.url);
      url.searchParams.delete('desktop');
      const res = NextResponse.redirect(url);
      res.cookies.set('view_mode', 'desktop', {
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
        sameSite: 'lax',
      });
      return res;
    }
    const res = NextResponse.next();
    res.cookies.set('view_mode', 'desktop', {
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
      sameSite: 'lax',
    });
    return res;
  }
  // ?mobile=1 -> 写 cookie 并跳到 /m
  if (searchParams.get('mobile') === '1') {
    const target = isMobilePath(pathname) ? pathname : toMobileTarget(pathname);
    const res = NextResponse.redirect(new URL(target, req.url));
    res.cookies.set('view_mode', 'mobile', {
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
      sameSite: 'lax',
    });
    return res;
  }

  const cookieMode = req.cookies.get('view_mode')?.value;

  // cookie=desktop 时：在 /m/* 下也强制跳到桌面路径
  if (cookieMode === 'desktop') {
    if (isMobilePath(pathname)) {
      const target = stripMobilePrefix(pathname);
      return NextResponse.redirect(new URL(target, req.url));
    }
    return NextResponse.next();
  }
  // cookie=mobile 时：保持 /m 路径或跳过去
  if (cookieMode === 'mobile') {
    if (isMobilePath(pathname)) return NextResponse.next();
    return NextResponse.redirect(new URL(toMobileTarget(pathname), req.url));
  }

  // 已经在 /m 下且没有 cookie -> 放行
  if (isMobilePath(pathname)) {
    return NextResponse.next();
  }

  // 自动按 UA 判断
  if (MOBILE_RE.test(ua)) {
    return NextResponse.redirect(new URL(toMobileTarget(pathname), req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads).*)'],
};
