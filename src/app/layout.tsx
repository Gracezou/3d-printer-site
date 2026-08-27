import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '3D 打印成品店',
    template: '%s | 3D 打印成品店',
  },
  description: '按需生产的 3D 打印成品独立站',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
