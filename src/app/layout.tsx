import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '平面设计接单 AI 运营工作台',
  description: '小红书 + 闲鱼平面设计接单内部运营工作台',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
