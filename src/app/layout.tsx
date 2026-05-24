import type { Metadata, Viewport } from 'next';
import './globals.css';
import ThemeProvider, { themeInitScript } from '@/components/ThemeProvider';

/**
 * v0.12 B4.2：站点更名「平面设计接单 AI 运营工作台」→「果冻的AI · 智能体工作台」。
 *
 * 部署目录 / git remote / 容器名 / DATABASE_URL 仍叫 design-ai-ops（公共契约不动）。
 * 仅替换前端可见的 metadata + 浏览器 tab title。
 */
export const metadata: Metadata = {
  title: '果冻的AI · 智能体工作台',
  description:
    '果冻的AI · 智能体集合平台。接单助手 / 创作助手 / API 助手等多个垂直智能体，本地 SQLite 持久化，自定义 systemPrompt。',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0a0a0a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
