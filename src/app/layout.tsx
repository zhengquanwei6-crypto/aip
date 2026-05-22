import type { Metadata, Viewport } from 'next';
import './globals.css';
import ThemeProvider, { themeInitScript } from '@/components/ThemeProvider';

export const metadata: Metadata = {
  title: '平面设计接单 AI 运营工作台',
  description: '小红书 + 闲鱼平面设计接单内部运营工作台',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#2563eb',
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
