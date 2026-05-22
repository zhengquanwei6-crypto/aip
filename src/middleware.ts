import { NextRequest, NextResponse } from 'next/server';

/**
 * 移动设备自动跳转到 /m 路径独立站。
 * 桌面访问 /m 也允许（方便预览）。
 * 用户可以加 ?desktop=1 强制使用桌面版（写入 cookie，永久生效）。
 */

const MOBILE_RE =
  /Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile Safari/i;

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const ua = req.headers.get('user-agent') || '';

  // 静态资源 / API / 已经在 /m 直接放行
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/uploads') ||
    pathname.startsWith('/m') ||
    pathname.includes('.') // 文件
  ) {
    return NextResponse.next();
  }

  // ?desktop=1 -> 写 cookie 强制桌面版
  if (searchParams.get('desktop') === '1') {
    const res = NextResponse.next();
    res.cookies.set('view_mode', 'desktop', {
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });
    return res;
  }
  // ?mobile=1 -> 写 cookie 强制移动版
  if (searchParams.get('mobile') === '1') {
    const res = NextResponse.redirect(new URL(`/m${pathname}`, req.url));
    res.cookies.set('view_mode', 'mobile', {
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });
    return res;
  }

  const cookieMode = req.cookies.get('view_mode')?.value;
  if (cookieMode === 'desktop') return NextResponse.next();
  if (cookieMode === 'mobile') {
    return NextResponse.redirect(new URL(`/m${pathname === '/' ? '' : pathname}`, req.url));
  }

  // 自动按 UA 判断
  if (MOBILE_RE.test(ua)) {
    return NextResponse.redirect(new URL(`/m${pathname === '/' ? '' : pathname}`, req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads).*)'],
};
