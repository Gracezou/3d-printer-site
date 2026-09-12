import type { Metadata } from 'next';

import { getSiteOrigin } from '@/lib/seo';
import { zhCN } from '@/messages/zh-CN';

import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(getSiteOrigin()),
  title: {
    default: zhCN.seo.rootTitle,
    template: `%s｜${zhCN.brand.name}`,
  },
  description: zhCN.seo.rootDescription,
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
