import type { Metadata } from 'next';

import './globals.css';

const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  metadataBase: new URL(configuredSiteUrl ?? 'http://localhost:5003'),
  title: {
    default: '层光造物 · 3D 打印成品店',
    template: '%s | 层光造物',
  },
  description: '精选设计，按单生产的 3D 打印成品独立站。',
  robots: { index: true, follow: true },
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
