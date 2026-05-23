import { NextRequest, NextResponse } from 'next/server';

/**
 * 移动设备自动跳转到 /m 路径独立站。
 * 桌面访问 /m 也允许（方便预览）。
 * 用户可以加 ?desktop=1 强制桌面版（写 cookie）。
 *
 * v0.8 Batch 6 修复：
 * - cookie view_mode=desktop 优先级最高：即使是 /m/* 也会跳出去到对应桌面路径
 * - cookie view_mode=mobile 同样优先于 UA：桌面 UA 仍会被强制带到 /m
 * - 这样 /m 页面的"桌面版"按钮（写 cookie 后跳 /...）才不会被中间件再拽回 /m
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
    const target = isMobilePath(pathname) ? pathname : (REMAP_TO_MOBILE_HOME.has(pathname) ? '/m' : `/m${pathname}`);
    const res = NextResponse.redirect(new URL(target, req.url));
    res.cookies.set('view_mode', 'mobile', {
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
      sameSite: 'lax',
    });
    return res;
  }

  const cookieMode = req.cookies.get('view_mode')?.value;

  // cookie=desktop 时：在 /m/* 下也强制跳到桌面路径（修复 B6.6 关键 bug）
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
    return NextResponse.redirect(
      new URL((REMAP_TO_MOBILE_HOME.has(pathname) ? '/m' : (REMAP_TO_MOBILE_HOME.has(pathname) ? '/m' : `/m${pathname}`)), req.url),
    );
  }

  // 已经在 /m 下且没有 cookie -> 放行
  if (isMobilePath(pathname)) {
    return NextResponse.next();
  }

  // 自动按 UA 判断
  if (MOBILE_RE.test(ua)) {
    return NextResponse.redirect(
      new URL((REMAP_TO_MOBILE_HOME.has(pathname) ? '/m' : (REMAP_TO_MOBILE_HOME.has(pathname) ? '/m' : `/m${pathname}`)), req.url),
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads).*)'],
};
